# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Keep it short — it is loaded into every prompt.** It holds what applies across the whole repository: commands, architecture, the quality gate, and how we write code. Anything true of one feature only — a measurement, a screen's reasoning, why one API call is shaped as it is — goes in `docs/` and is linked from the code it governs. Change history goes in commit messages. Before adding a section here, ask whether it would still guide someone building a feature that does not exist yet.

## Commands

### Root (Turborepo — runs all workspaces)
```bash
npm run dev          # Start all apps in watch mode
npm run build        # Build all apps
npm run lint         # Lint all apps
npm run type-check   # Type-check all apps
```

### Individual workspaces
```bash
# From repo root, target a specific app:
npm run dev --workspace=apps/web
npm run dev --workspace=apps/api

# From within apps/api:
npm run test                        # Run Jest unit tests
npm run test:e2e                    # Run e2e tests (jest --config ./test/jest-e2e.json)
npx jest src/some/file.spec.ts      # Run a single test file

# From within apps/web:
npm run test                        # Run Jest unit tests (Jest + React Testing Library)
npx jest src/some/file.spec.ts      # Run a single test file

# Prisma (from apps/api):
npx prisma migrate dev              # Apply pending migrations
npx prisma generate                 # Regenerate Prisma client after schema change
```

### Local infrastructure
```bash
# From infra/docker/:
docker compose up -d   # Start PostgreSQL (5432) + Redis (6379)
docker compose down    # Stop
```

## Architecture

This is a TypeScript monorepo (Turborepo + npm workspaces) for an automotive parts e-commerce shop. Read `docs/ARCHITECTURE.md` for diagrams, rationale, and implementation detail — it is the authoritative design document.

The rest of `docs/` carries the detail deliberately kept out of this file: `TECDOC.md` (what the TecDoc endpoint actually does, measured, and the features built on it), `CROSS-REFERENCES.md` (which parts replace a part), `PRICING-AND-DELIVERY.md` and `DELIVERY-LOGIC.md`.

### Workspaces
| Path | Package | Purpose |
|---|---|---|
| `apps/web` | `@vp-parts-shop/web` | Next.js 16 frontend, deployed to Vercel |
| `apps/api` | `@vp-parts-shop/api` | NestJS 11 backend, deployed to AWS Lightsail Containers |
| `packages/shared` | `@vp-parts-shop/shared` | Shared TypeScript types & Zod schemas — no runtime deps |

### Data flow
```
Browser → Next.js (Vercel) → NestJS API (Lightsail) → PostgreSQL / Redis / SQS
                                                      ↕ (SQS events)
                                            Spring Boot Backoffice (Lightsail VM)
```

The Spring Boot backoffice owns all supplier/pricing logic. The NestJS API integrates with it via SQS event bus and a shared PostgreSQL database (split schemas — backoffice schema is read-only from NestJS).

### NestJS module layout (planned in ARCHITECTURE.md)
- `catalog/` — TecDoc integration, vehicle & parts search
- `inventory/` — Price & availability from backoffice
- `orders/` — State machine, checkout, SQS publisher, SSE (order status)
- `payments/` — Stripe, Borica, COD
- `customers/` — Accounts, mechanic approval
- `auth/` — Clerk JWT guard, `InternalGuard` (shared-secret for backoffice calls), `@Public()` decorator
- `events/` — SQS consumers, email worker
- `common/` — Global filters, interceptors, pipes

### Next.js rendering strategy
| Route | Strategy |
|---|---|
| Homepage | ISR (6 h revalidation) |
| Category pages | ISR (1 h) |
| Product detail | SSR (fresh price/stock on every request) |
| Cart / Checkout | Client component |
| Order detail | Client + SSE for live status |

### Key technical decisions
- **Prisma** uses `?pgbouncer=true` in the pooled `DATABASE_URL` (runtime client) because PgBouncer runs in transaction mode. Migrations and other Prisma CLI commands need a direct, non-pooled connection via `DIRECT_URL` (used by `prisma.config.ts`); it falls back to `DATABASE_URL` for local/CI environments without a pooler.
- **Pre-checkout availability check** is always fresh (no cache) to avoid selling unavailable stock.
- **TecDoc data** is cached in Redis with TTL; no Postgres cache at launch.
- **Auth** is Clerk — all NestJS routes validate Clerk-issued JWTs via `@clerk/backend` SDK. Clerk handles sign-in/sign-up UI; a `user.created` webhook creates the `Customer` record in Postgres. Internal backoffice endpoints are protected by `InternalGuard` (shared-secret bearer token, private-network only).
- `packages/shared` is the contract layer between `web` and `api`; put Zod schemas and TS types there, never inline them in one app only.

### TecDoc Pegasus 3.0 API integration

**TecDoc is not a REST API.** It is a JSON RPC service: every call is an `HTTP POST` to the single endpoint `{TECDOC_BASE_URL}/services/TecdocToCatDLB.jsonEndpoint`, authenticated with an `X-Api-Key` header, with the function name as the top-level JSON key.

```json
{ "getArticles": { "lang": "bg", "linkageTargetCountry": "BG", "...": "other params" } }
```

Env vars: `TECDOC_BASE_URL`, `TECDOC_API_KEY`. `provider` is optional and a wrong one is refused `401` — never fill it with a placeholder.

**Never assume a field name or an endpoint path.** Two sources are authoritative and answer different questions: the XSD (`https://webservice.tecalliance.services/pegasus-3-0/services/TecdocToCatDLB.soapEndpoint?xsd=1`) for *what a field is*, and the Onboarding Guide (TecDoc Pegasus 3.0, v3.0, 25/01/2022) for *what a call returns in practice*. Where they disagree the XSD wins — it is served live, the guide is a 2022 snapshot. Interactive docs and a test client: `https://webservice.tecalliance.services/pegasus-3-0/info/`.

Rules that apply to every TecDoc call:

- **An article is `(dataSupplierId, articleNumber)`, never the number alone.** Two suppliers file the same number for different parts, so a number-only lookup is a coin toss — it shipped one company's specs on another's detail page. `dataSupplierId` travels through our contracts as `brandId`; every route, cache key, query key, React list key and stock `WHERE` clause carries both halves.
- **Never send `includeAll`.** Name the flags the call actually reads. It is the most expensive mistake available on this API: it adds PDFs, links, linkages, parts lists, GTINs, prices and OE numbers to every row, and no list renders any of them. Most list reads need only generic articles, images and criteria.
- **Nothing orderable or filterable in TecDoc knows what we can ship.** No sort field or facet touches our stock, and `includePrices` returns the supplier's catalogue price, not ours. Sorting by price, availability or delivery has to be answered from backoffice inventory over a set we hold in full.
- **`perPage` tops out at 1000 and `page` reaches only ~10,000 results.** There is no cursor. Size a pager on the response's `maxAllowedPage`, never on `ceil(total / perPage)`.
- **Adding a field to a cached DTO means bumping its shape version in the cache key.** Entries written by the previous release otherwise make the API promise a field it does not send until they expire, which is a client crash rather than a missing row.
- **`[VERIFY-TC]` marks an assumption the XSD cannot settle** — how repeated filters combine, what a sentinel default means. State what breaks if it is wrong. Close one by replacing it with the measurement, not by deleting it.

`docs/TECDOC.md` holds the measured detail behind the features built on this — the vehicle selector's `'VL'` scope, make logos, the list and search pipeline, facet shaping, and the include flags each call needs. Read the relevant section before changing one of those surfaces, and record new findings there.

### Path aliases
- `apps/web`: `@/*` → `./src/*`
- `apps/api`: no aliases; use relative imports
- `tsconfig.base.json` at root enforces strict mode for all workspaces

## Quality Gate

After every code change, run all checks relevant to the workspace you touched and fix any failures before considering the task done:

```bash
# In apps/api:
npm run lint        # must produce zero errors
npm run test        # all unit tests must pass
npm run test:e2e    # all e2e tests must pass

# In apps/web:
npm run lint
npm run test        # all Jest + RTL unit tests must pass

# In root (covers web + shared):
npm run lint
npm run type-check
```

**Rules:**
- Never introduce a new failing test, lint error, or type error — even in unrelated files you touched.
- If a pre-existing test is already failing, note it explicitly before starting work; do not mask it.
- Do not disable lint rules (`// eslint-disable`) or skip tests (`it.skip`, `xit`) to make the gate pass.
- **Every new feature must ship with tests.** Any new file added to `apps/web/src/` or `apps/api/src/` must be accompanied by a corresponding `.spec.ts`/`.spec.tsx` file covering its non-trivial logic. Where full test coverage is not feasible (e.g. thin route wrappers, loading skeletons), note the exception explicitly in the PR description.

## Test-Driven Development

**Workflow for every new feature:**
1. Write the unit tests first (`.spec.ts`/`.spec.tsx`) — define expected inputs, outputs, and edge cases.
2. Run the tests to confirm they fail (`npm run test` in the relevant workspace).
3. Implement the feature until all tests pass.
4. Add or update e2e tests in `apps/api/test/` if the feature touches HTTP endpoints.
5. Never merge code that makes tests pass by special-casing the test input.

**NestJS unit tests** — use `Test.createTestingModule()` with mocked providers; never hit a real DB in unit tests.

**NestJS e2e tests** — spin up the full app with `supertest`; run against a test database or in-memory substitute.

**Frontend unit tests** — `apps/web` uses Jest + React Testing Library (configured via `next/jest`). Test strategy by type:
- **Pure functions** (`lib/utils.ts`, `lib/api/*.ts`): Jest only — mock `fetch`/`apiFetch`, assert URL construction, headers, and error handling.
- **Algorithms** (e.g. `buildTree` in `category-nav.tsx`): export the function and test it in isolation with Jest. No rendering needed.
- **Zustand stores** (`hooks/use-vehicle-context.ts`): call `store.getState()` and `store.setState()` directly — no React rendering needed.
- **Client Components** with conditional rendering logic (e.g. `ArticleCard`): use React Testing Library — `render()`, query by role/label/text, simulate events with `userEvent`.
- **Skip tests for**: loading skeletons, thin route wrappers with no logic, shadcn UI primitives under `components/ui/`.

## Next.js Best Practices

Next.js is **frontend only** in this stack. All business logic and data persistence live in the NestJS API. Server Components and Server Actions never access the database or contain domain logic — they call the NestJS API over HTTP.

### Server / Client components
- **Default to Server Components.** Only add `'use client'` at leaf level for interactive islands. A `'use client'` boundary moves the entire subtree into the client bundle.
- **Server Components call the NestJS API**, not the database. Their value is keeping auth tokens and API secrets off the client and reducing bundle size — not running server-side logic.
- **Pass Server Components as `children` into Client Components**, never the other way around. This keeps the NestJS fetch calls out of the client bundle.
- **Caching is opt-in in Next.js 15+.** `fetch` is not cached by default. Use `'use cache'` + `cacheLife()` for stable data (e.g. catalog); wrap dynamic data in `<Suspense>` to enable streaming and Partial Prerendering.
- **Prefer `revalidateTag()` over `revalidatePath()`** when cached data appears on multiple routes; tag mutations at the data layer, not per-page.
- **Server Actions are thin HTTP wrappers** — they call the NestJS API and revalidate cache tags. No business logic inside them. Always validate inputs with Zod before forwarding.
- **Import `'server-only'`** in any module that holds API secrets (auth tokens, internal service URLs) to get a build-time error if it leaks into client code.
- **Error boundaries per segment**: use `error.tsx` for runtime errors, `not-found.tsx` for 404s, `loading.tsx` for Suspense skeletons.

### Folder structure
```
src/
  app/                        # file-based routes only — no logic here
    (marketing)/              # route group (no URL segment)
    (shop)/
      products/[slug]/
        page.tsx
        loading.tsx
        error.tsx
  components/
    ui/                       # shadcn primitives — never edit directly, wrap them
    [feature]/                # feature-scoped components (e.g. cart/, catalog/)
  lib/
    api/                      # all NestJS API call functions (one file per domain)
    utils.ts
  hooks/                      # client-side custom hooks
  types/                      # FE-only types; shared contract types go in packages/shared
```

### API calls
- All NestJS API calls live in `src/lib/api/` — never call `fetch` directly from a component or hook.
- Each file covers one domain (`orders.ts`, `catalog.ts`). Export plain async functions; keep headers, base URL, and token injection in a single shared `apiFetch` wrapper.
- **Server Components** call these functions directly (they run on the server, so auth tokens stay out of the bundle).
- **Client Components** call these functions through TanStack Query hooks — never `useEffect` + `fetch`.
- Parse the error response using the shared `ApiErrorResponse` type (see NestJS error contract below) and surface `errorCode` to the UI layer for message lookup.

### Components & styles
- **shadcn components** (`src/components/ui/`) are generated — do not modify them directly. Wrap them in a feature component if you need to change behaviour.
- Compose feature components from shadcn primitives; keep feature-specific state and callbacks in the feature component, not inside the primitive wrapper.
- Use `cn()` (from `src/lib/utils.ts`) for all conditional class merging — never string-concatenate Tailwind classes.
- Use `class-variance-authority` (CVA) to define component variants; keep variant definitions co-located with the component file.
- No inline `style={{}}` props except for truly dynamic values that Tailwind cannot express (e.g. CSS custom properties for runtime colors). Use Tailwind utilities for everything else.
- One component per file. File name matches the component name in kebab-case (`product-card.tsx` → `ProductCard`).
- **Split page sections into named components.** When a route page (`page.tsx`) contains distinct visual sections (breadcrumbs, grids, pagination, headers), extract each into its own file under `components/[feature]/`. Route pages should only compose components — no inline JSX blocks.

## React & Next.js Patterns

### TanStack Query v5
- **Define queries with `queryOptions()` factories** in `lib/api/` — never inline `queryKey`/`queryFn` pairs directly in components. Components import and spread the factory: `useQuery({ ...manufacturersQueryOptions, enabled: isOpen })`.
- **Key structure:** `['domain', 'entity', id?]` tuple arrays (e.g. `['catalog', 'manufacturers']`). Centralising keys in one place prevents drift.
- **Always handle loading and error states explicitly.** Destructure `isPending` / `isError` and render a skeleton or error message — never silently show an empty list while data loads.
- **Prefer `useSuspenseQuery` + `<Suspense fallback={<Skeleton />}>`** for new components where the loading UI can be a skeleton; it removes the need for manual `isPending` checks inside the component.
- For mutations: use `useMutation` with `onSuccess: () => queryClient.invalidateQueries(...)` — avoid manually patching the cache unless optimistic updates are required.

### Zustand v5 with Next.js (SSR)
- **Hydration guard:** Zustand `persist` reads from `localStorage`, which only exists on the client. Any component that branches on persisted state must guard with `useHydration()` (exported from `hooks/use-vehicle-context.ts`). While `isHydrated` is `false`, render a neutral skeleton — this keeps the server HTML and the initial client render identical, preventing React hydration mismatches.
- **Always subscribe with selectors:** `useStore(state => state.field)`, never `useStore()`. The whole-store subscription re-renders the component on any state change, even unrelated slices.
- One Zustand store per independent concern. Do not combine unrelated state into one store.

### Next.js navigation
- Use `<Link>` from `next/link` for **every internal link.** Never use `<a href="/path">` for same-origin navigation — it causes a full page reload and bypasses prefetching.
- External links (different origin, open in new tab) use `<a target="_blank" rel="noopener noreferrer">`.

### Next.js Image
- Use `<Image>` from `next/image` for all content images — never a bare `<img>` tag. `next/image` handles lazy loading, WebP conversion, and responsive sizing automatically.
- Use `fill` inside a `position: relative` container (`className="relative"`) for variable-size slots. Use explicit `width` / `height` props for fixed-dimension images.
- Always provide a `sizes` attribute when using `fill` so the browser can choose the right source set (e.g. `sizes="(max-width: 640px) 50vw, 20vw"`).
- Register all external image CDN hostnames in `next.config.ts` under `images.remotePatterns` **before** using them. An unregistered hostname causes a build/runtime error.

### `'use cache'` directive
- Every `'use cache'` function must call `cacheLife(preset)` and `cacheTag(tag)` before returning data. Without them the entry has no TTL and cannot be selectively invalidated.
- Tag granularity: use the smallest logical unit that changes together (e.g. `articles-${vehicleId}-${categoryId}`), not a broad sweep like `catalog`.
- Invalidate at the data layer with `revalidateTag(tag)` inside Server Actions. Never use `revalidatePath()` as a substitute — it blows the cache for an entire route, not just the changed data.

## NestJS Best Practices

### Project structure
- **Feature modules, not layer modules.** Each feature directory contains its own controller, service, repository, DTOs, and tests. `common/` is for truly cross-cutting concerns only (global filters, interceptors, pipes).
- **Keep controllers thin.** Controllers handle HTTP mapping and delegate immediately to services. No business logic in controllers.
- **Repository pattern.** Wrap all Prisma calls in a repository class (e.g. `OrderRepository`). Services never call `this.prisma.*` directly — they call the repository. This isolates DB access and makes unit testing straightforward.
- **Barrel files.** Each feature module exposes a public API via `index.ts`. Other modules import from the barrel, not from internal files.
- **Cross-feature _command/write_ flows go through events, never direct calls.** A service MUST NOT inject another feature's service to trigger a side effect (e.g. order placed → email sent). Use SQS / NestJS `EventEmitter` or a shared service in `common/`. This prevents circular dependencies and keeps modules independently testable.
- **Synchronous _read_ enrichment MAY inject another feature's service** via its public barrel (`index.ts`) — e.g. `CatalogService` injecting `InventoryService` to attach live price/availability to a listing. Two rules: import from the barrel (never internal files), and keep the dependency acyclic (it must point one direction only; if you need a cycle, switch to events).

### Error contract with the frontend
Every error response must conform to a shared structure defined in `packages/shared`:

```typescript
// packages/shared/src/errors.ts
export enum AppErrorCode {
  ORDER_NOT_FOUND     = 'ORDER_NOT_FOUND',
  PAYMENT_FAILED      = 'PAYMENT_FAILED',
  PART_UNAVAILABLE    = 'PART_UNAVAILABLE',
  UNAUTHORIZED        = 'UNAUTHORIZED',
  VALIDATION_ERROR    = 'VALIDATION_ERROR',
  // add codes here as the API grows
}

export interface ApiErrorResponse {
  statusCode: number;
  errorCode: AppErrorCode;
}
```

- Throw typed domain exceptions from services (e.g. `new PartUnavailableException()`). Each exception carries the correct `AppErrorCode`.
- The **global exception filter** catches everything, logs full detail server-side, and returns only `{ statusCode, errorCode }` to the client — no `message`, no stack trace, no internal paths.
- The frontend maps `errorCode` to a localised UI message. It never displays raw error strings from the API.

### Security & observability in errors
- **Never return sensitive data in error responses.** SQL errors, stack traces, file paths, and third-party API messages must be logged server-side only and stripped from the response body.
- Log at the right level: `error` for unexpected exceptions (with full stack), `warn` for expected domain errors (e.g. `ORDER_NOT_FOUND`), `debug` for request tracing. Do not log request bodies that may contain PII or payment data.
- In production, use a structured logger (e.g. `pino`) so logs are machine-parseable; avoid `console.log`.

### Managing complexity
- **Validate at the boundary with `ValidationPipe`.** Register globally in `main.ts` with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`. Services receive already-valid, typed data.
- **DTOs use mapped types** (`PartialType`, `PickType`, `OmitType` from `@nestjs/mapped-types`) for update/patch variants — never duplicate validation decorators.
- **Use the right abstraction:**
  - **Guards** — authentication / authorization (run before the handler).
  - **Pipes** — input transformation & validation.
  - **Interceptors** — response shaping, logging, cache layer.
  - **Exception filters** — catch and format all errors uniformly.
- **Config via `ConfigModule`**: `ConfigModule.forRoot({ isGlobal: true, validationSchema })` validates all env vars at startup with Joi — fail fast rather than fail at runtime.
- **Constructor injection only.** Avoid `@Inject()` property injection; keep the dependency graph explicit and easy to mock in tests.

## Clean Code

**Naming**
- Names must reveal intent — a reader should not need to look at the implementation to understand what a variable, function, or class does.
- Avoid abbreviations (`usr`, `cfg`, `mgr`). Use full words.
- Boolean names start with `is`, `has`, or `can` (`isAvailable`, `hasDiscount`).
- Functions are verbs (`fetchOrder`, `validateCart`); classes are nouns (`OrderService`, `CartItem`).

**Functions**
- One function, one responsibility. If you need "and" to describe what it does, split it.
- Keep functions short — aim for what fits in one screen without scrolling.
- **Avoid large functions that do many things.** When a function grows past one screen or strings together several distinct steps (fetch → transform → assemble → return), extract each step into a small, well-named helper so the original method reads as a high-level summary of those steps.
- **Use private helper functions where applicable.** Pull repeated or self-contained logic out of a method into a `private` method (or a module-level pure function when it has no dependency on instance state). Prefer many small, focused functions over one big one.
- Prefer pure functions; isolate side effects (DB writes, HTTP calls) at the edges.
- Mark helper functions `private`. Only expose what callers outside the class actually need.
- Maximum 2–3 parameters. Group related params into an object/DTO when you exceed that.

**Spacing & formatting**
- **Separate logically distinct parts of the code with a single blank line for readability.** Inside a function, group each step (e.g. input guards, the main read, the transform, the return) into its own visually distinct block separated by one blank line, so each block reads as a single idea.
- Two blank lines between top-level class members (methods).
- No trailing blank lines inside a block.
- Keep line length under ~100 characters; break long chains or argument lists onto separate lines.

**Classes & modules**
- Classes should be small and focused on a single concept.
- Declare class members in order: `public` fields → `private` fields → `constructor` → `public` methods → `private` methods.
- No dead code. Remove commented-out code; use git history if you need it back.

**Conditionals**
- Avoid deep nesting — use early returns (guard clauses) instead.
- Extract complex boolean expressions into a named variable or function.
- Prefer `switch` / lookup tables over long `if-else` chains when branching on a known set of values.

**Comments**

Default to no comment. Well-named code explains itself, and every comment is a second thing to keep true — a stale one is worse than none. Write one only when a reader who understands the code would still ask "why?". Most files should carry none, and a handful in one file is already a lot; if a change adds more than that, the code needs the clarity, not the prose.

Worth a comment:
- A non-obvious constraint or external contract (`the load balancer appends, so the last entry is the trustworthy one`).
- A decision whose alternative looks more sensible at first glance — say why the obvious option was rejected.
- A rule the type system can't express (`must not be called inside a 'use cache' scope`).

Not worth a comment:
- Restating the code (`// loop over the items`, `// return the result`).
- A docblock on every function, parameter, and constant by default. Export docs are for genuinely non-obvious public API, not a house style.
- Explaining a change or its history — that belongs in the commit message. Never write `// changed to fix X` or `// previously we did Y`.
- Section banners inside a function. Use a blank line and a well-named helper instead.
- **Every finding from investigating a problem.** Measurements, probe output, options that were tried, how a conclusion was reached — none of that is a comment. Keep the one line stating the rule a reader must not break, and put the evidence in `docs/`.

Keep them short. One or two lines carries almost every real explanation; if it takes a paragraph, the design probably needs the explanation more than the reader does — put it in `docs/` and link it. Prefer naming a thing over describing it: a `private` helper called `proxyReportedIp` beats a comment above an index expression.

**General**
- Don't repeat yourself — if the same logic appears twice, extract it.
- Leave the code cleaner than you found it (Boy Scout Rule), but only within the scope of the current task.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/002-autoparts-shop-spec/plan.md`.
<!-- SPECKIT END -->
