# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- `auth/` — Keycloak JWT guard (`shop` realm)
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
- **Prisma** uses `?pgbouncer=true` in `DATABASE_URL` because PgBouncer runs in transaction mode.
- **Pre-checkout availability check** is always fresh (no cache) to avoid selling unavailable stock.
- **TecDoc data** is cached in Redis with TTL; no Postgres cache at launch.
- **Auth** is Keycloak — all NestJS routes validate JWT from the `shop` realm.
- `packages/shared` is the contract layer between `web` and `api`; put Zod schemas and TS types there, never inline them in one app only.

### Path aliases
- `apps/web`: `@/*` → `./src/*`
- `apps/api`: no aliases; use relative imports
- `tsconfig.base.json` at root enforces strict mode for all workspaces

## Quality Gate

After every code change, run all three checks and fix any failures before considering the task done:

```bash
# In apps/api:
npm run lint        # must produce zero errors
npm run test        # all unit tests must pass
npm run test:e2e    # all e2e tests must pass

# In root (covers web + shared):
npm run lint
npm run type-check
```

**Rules:**
- Never introduce a new failing test, lint error, or type error — even in unrelated files you touched.
- If a pre-existing test is already failing, note it explicitly before starting work; do not mask it.
- Do not disable lint rules (`// eslint-disable`) or skip tests (`it.skip`, `xit`) to make the gate pass.

## Test-Driven Development

**Workflow for every new feature:**
1. Write the unit tests first (`.spec.ts`) — define expected inputs, outputs, and edge cases.
2. Run the tests to confirm they fail (`npm run test` in `apps/api`).
3. Implement the feature until all tests pass.
4. Add or update e2e tests in `apps/api/test/` if the feature touches HTTP endpoints.
5. Never merge code that makes tests pass by special-casing the test input.

**NestJS unit tests** — use `Test.createTestingModule()` with mocked providers; never hit a real DB in unit tests.

**NestJS e2e tests** — spin up the full app with `supertest`; run against a test database or in-memory substitute.

**Frontend** — Next.js Server Components and Server Actions are pure functions; test them with Jest. Client Components require React Testing Library.

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

## NestJS Best Practices

### Project structure
- **Feature modules, not layer modules.** Each feature directory contains its own controller, service, repository, DTOs, and tests. `common/` is for truly cross-cutting concerns only (global filters, interceptors, pipes).
- **Keep controllers thin.** Controllers handle HTTP mapping and delegate immediately to services. No business logic in controllers.
- **Repository pattern.** Wrap all Prisma calls in a repository class (e.g. `OrderRepository`). Services never call `this.prisma.*` directly — they call the repository. This isolates DB access and makes unit testing straightforward.
- **Barrel files.** Each feature module exposes a public API via `index.ts`. Other modules import from the barrel, not from internal files.
- **Services do not import other feature services directly.** Cross-feature communication goes through events (SQS / NestJS `EventEmitter`) or a shared service in `common/`. This prevents circular dependencies and keeps modules independently testable.

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
- Prefer pure functions; isolate side effects (DB writes, HTTP calls) at the edges.
- Mark helper functions `private`. Only expose what callers outside the class actually need.
- Maximum 2–3 parameters. Group related params into an object/DTO when you exceed that.

**Spacing & formatting**
- One blank line between logical sections inside a function.
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

**General**
- Don't repeat yourself — if the same logic appears twice, extract it.
- Leave the code cleaner than you found it (Boy Scout Rule), but only within the scope of the current task.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
