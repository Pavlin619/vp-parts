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

**Critical: TecDoc is NOT a REST API.** It is a JSON RPC service. Do not invent REST-style paths — they do not exist and calls will fail silently or with unexpected errors.

**Protocol:** All calls are `HTTP POST` to a single endpoint:
```
POST {TECDOC_BASE_URL}/services/TecdocToCatDLB.jsonEndpoint
```

**Request shape:** The function name is the top-level JSON key:
```json
{
  "getFunctionName": {
    "lang": "bg",
    "linkageTargetCountry": "BG",
    ...other params
  }
}
```

**Authentication:** `X-Api-Key: YOUR_KEY` HTTP header (correct as implemented).

**Required env vars:** `TECDOC_BASE_URL`, `TECDOC_API_KEY`.

**`provider` is optional, and a wrong one is worse than none.** The XSD marks `provider` ("Your assigned TecDoc Provider Id") required on every request type, but the live service does not enforce it: entitlement is resolved from `X-Api-Key`. Verified against the live endpoint with our key — a call omitting `provider` is answered in full, and one carrying a ProviderId that is not ours is refused `{"status":401,"statusText":"Access not allowed"}` regardless of how valid the key is. This is why `TECDOC_PROVIDER_ID` is optional in the Joi schema and omitted from the body when unset; never fill it with a placeholder to get past a validation error. `[VERIFY-TC]` Whether a real ProviderId scopes the assortment is unverified — we have never held one.

**Key functions used in this project:**

| Function | Purpose |
|---|---|
| `getLinkageTargets` | Manufacturers, model series, vehicle variants |
| `getArticles` | Assembly group tree, article list, article search by number |
| `getBrands` | Brand logos (future) |
| `getAutoCompleteSuggestions` | Search autocomplete (future) |
| `getArticleLinkedAllLinkingTarget4` | Compatible vehicles for an article (future, doc section 8.4) |

**Where to verify the contract before implementing any TecDoc call.** Two documents are authoritative, and they answer different questions:

1. **The XSD** — `https://webservice.tecalliance.services/pegasus-3-0/services/TecdocToCatDLB.soapEndpoint?xsd=1` (no credentials needed). Every request and response type with its documented field semantics. Note the `.soapEndpoint` segment: the path without it returns 404. The JSON endpoint we actually call is the same contract, so this schema is authoritative for it too.
2. **Onboarding Guide — TecDoc Web Service (TecDoc Pegasus 3.0 API), version 3.0, 25/01/2022.** Worked request/response pairs for the flows this project is built on — §8.2 vehicle drill, §8.3 assembly-group drill, §8.5 number search — plus behaviour the XSD has no way to express, such as what a response looks like when a parameter is left at a sentinel value.

Use the XSD for *what a field is* and the guide for *what a call returns in practice*. **Where they disagree, the XSD wins**: it is served live, while the guide is a 2022 snapshot. Where the guide shows something the XSD does not mention, the guide stands — but say so at the point of use, because it is the weaker source.

- Interactive docs + test client: `https://webservice.tecalliance.services/pegasus-3-0/info/`
- Service Index tab: every function with full request/response parameter documentation
- Use the Test Client tab (needs a provider key) to verify actual response shapes before writing mapping code

**Never assume a field name or endpoint path.** Always check the XSD or the Service Index before adding a new TecDoc call.

**Mark what the schema cannot settle.** Some behaviour is not in the XSD — how repeated filters combine, whether an id is unique across trees, what a sentinel default means. Where the code had to assume, leave a `[VERIFY-TC]` comment stating the assumption and what breaks if it is wrong, so the next person with Test Client access can close it. Grep for `[VERIFY-TC]` to find the open ones.

#### Article identity: an article number is not unique

**A TecDoc article is identified by `(dataSupplierId, articleNumber)`, never by the number alone.** Two data suppliers can and do file the same number for different parts. A number-only `getArticles` lookup returns every one of them and the caller takes whichever the catalogue sorted first — which is a coin toss, not a lookup. This surfaced as an article detail page showing another company's specs and applicable vehicles.

`dataSupplierId` is the brand: it is what `getBrands` is keyed by, what the onboarding guide's catalogue-data table calls `BrandId`, and the only brand axis `getArticles` can filter on. It travels through our own contracts as `brandId` on `ArticleSummaryDto`, `ArticleAutocompleteItemDto` and `BrandDto`.

Rules when adding anything article-scoped:

- **Resolving one specific part** — send `dataSupplierIds: [brandId]` plus `searchMatchType: 'exact'`, and route it through `ArticlesTecDoc.articleLookupPayload`. The public route is `/catalog/brands/:brandId/articles/:articleNumber`.
- **Cache keys, query keys and React list keys** carry both halves. A number-only key serves one brand's part to everyone asking for the other.
- **Every link to a part** goes through `articleDetailHref(brandId, articleNumber)` in `apps/web/src/lib/catalog/article-href.ts`.
- **There is no exception, substitutes included.** Which parts replace a part is a property of that part, not of its number, so two suppliers filing one number have different replacements — see the next section.

**Stock is matched on the same identity, in the `WHERE` clause.** `public.autoparts` and `public.supplier_stock` both carry `tecdoc_supplier_id` next to `tecdoc_number` and both are indexed on the pair, so the repositories query `WHERE tecdoc_number = … AND tecdoc_supplier_id = …` and the database does the narrowing — there is no post-filter in TypeScript to keep in sync. The batch read joins the wanted pairs in as two parallel arrays (`unnest($1::text[], $2::text[])`), which plans as one index lookup per pair: 1.7 ms for 500 pairs. Number-only matching was mispricing — 13,596 numbers in `supplier_stock` are filed by more than one supplier, and 23% of measured number-only matches attributed stock to the wrong brand — so `InventoryService.getAvailability` takes `ArticleIdentityDto[]` and answers a map keyed by `articleIdentityKey(brandId, articleNumber)`, and `GET /catalog/articles-availability?articles=268:WL6340` carries both halves on the wire. A line whose `tecdoc_supplier_id` is null, an internal OE code, or a zero-padded internal code simply does not match, which also leaves original parts unreachable — they are a separate relation, see `TODO(inventory-oe-parts)`.

#### Cross-references: candidates first, detail per page

**Which parts replace a part is read from the cross-reference index, in two phases: a cheap search for the whole candidate set, then a rendered-row read for the page a visitor reached.** `docs/CROSS-REFERENCES.md` is the design document — it carries the live measurements every number below comes from, and the alternatives that were rejected. The code is one package, `catalog/articles/cross-references/`, reached through its barrel: `cross-references.tecdoc.ts` (the search and the hydration read) and `candidate-set.ts` (the pure filtering, ordering and paging).

**Phase 1 — the candidate set.** One `getArticles` with `searchType: 3` (Comparable Number) on the part's *own* number, narrowed by `genericArticleIds` to the type of part it is, asking only for `includeGenericArticles`, `includeComparableNumbers` and `includeMisc`. A candidate costs under a kilobyte, so the complete set arrives in one call at `perPage: 1000` — TecDoc's own maximum, against a measured median of 99 and a widest of 354 (341 KB) over 418 parts — and is cached whole. There is no paging loop, deliberately: a second page could only carry a set wider than the ceiling, so `readCandidates` warns on a truncated set instead of paging for a case three times wider than any in the data.

**Phase 2 — the rendered page.** The `legacyArticleId` each candidate carries feeds back into `getArticles` for the images, criteria and OE numbers a row shows — 25 rows cost 611 KB, which is why only the page a visitor reached is paid for. Never `includeAll` here: `pdfs`, `links`, `linkages`, `partsList`, `accessoryList`, `gtins` and `prices` all ride along in it and none is rendered.

A bare comparable-number search *is* unusable, and two things in the same response fix it — neither of which an earlier attempt used:

- **`genericArticleIds` narrows to the part's own type**, server-side. A.B.S. `16100`: 269 candidates down to 58 brake discs.
- **Each row reports whose number it matched**, in `comparableNumbers[].dataSupplierId` — the same id space as our `brandId`. `keepCandidatesCiting` keeps only the rows citing *this* brand's number, which is what turns a loose number match into equivalence. Do **not** use `searchQueryMatches` for this: it names the brand by `mfrId`, an unrelated id space (see the warning in `article-mapper.ts`).

What follows:

- **Both halves of the identity travel.** The routes are `/catalog/brands/:brandId/articles/:articleNumber/substitutes` and `.../alternative-numbers`; the cache keys (`tecdoc:crossrefs:…`, `tecdoc:article-row:…`), the TanStack query key and the React list keys all carry brand *and* number.
- **An empty list is a legitimate answer.** A part TecDoc files no generic article for is not searched at all, and a candidate set the provenance filter empties stays empty — a wrong substitute is a part a mechanic fits to the wrong car.
- **The whole set is ordered by what we can ship**, then paged: in stock first, then fastest delivery band and lowest price, then supply status, and finally `(brandName, articleNumber)` so paging is deterministic. This is why the set is read whole — a sort on stock is only meaningful if it sees every candidate. `InventoryService.getAvailability` fails closed everywhere else; the ordering step is the one caller that catches it, because a stock-database outage must cost the list its *order*, not its existence.
- **The delivery rank is the band, never `deliveryWorkDays`.** `CENTRAL` and `REGIONAL_1` both file nought working days — our own shelf, and a supplier that ships today if the order beats its cut-off — so on days alone they tie, price decides, and the list interleaves green-badge rows with blue ones. `deliveryBand` in `packages/shared/src/delivery.ts` is the one definition of that band: the web colours the availability dot from it and the API sorts by it, so anything ranking or badging delivery speed reads it from there rather than re-deriving it.
- **One search is the whole answer — there is no second source and no top-up.** A thin list is served thin: how many suppliers cite a brand is a property of TecDoc's data. An OE-number fallback shipped first and was removed, because "which parts fit the same original" is a different relation from "which parts replace this part", and mixing it in below a threshold meant two visitors could see rows selected by different rules. Do not add a second source here without deciding what the list *means*.
- **The substitutes route is paginated and the alternative-numbers route is uncapped.** `total` counts the whole set, so the section offers every alternative; the chips need only a number and a brand, which the candidate already carries, so that surface pays for no hydration at all.
- **TecDoc normalises punctuation and spacing on both sides of a number match**, so `895 615 301`, `895615301` and `895-615-301` are one number and one search.
- **Drop the viewed part, on `(dataSupplierId, articleNumber)` and never on the number alone.** The search answers with the part it was given among the rest (60 of 236 sets measured), and matching on the number alone would also drop the *other* supplier's part filed under it — which is a genuine replacement, as the KNECHT/MAHLE `KC 69` pair shows. Nothing else is dropped: there is no dedupe, because no candidate set repeats a pair (0 in 542 sets / 30,830 rows) while 495 of those sets legitimately have one supplier contributing several rows under different numbers.

#### Paging and sorting `getArticles`

Settled from the two sources above, so none of it needs the Test Client.

- **`perPage` defaults to 10 and tops out at 1000.** The schema sets no ceiling and the guide's own examples use 100, but the live service enforces one and names it: `perPage: 2000` is refused `400` with `Field 'perPage' must be > 0 and <= 1000`. We send 20 from `/search` and from the category listing, and 1000 for the cross-reference candidate read. `perPage` is a cap, not a fetch size — a request costs the rows that exist, so raising it does not cost anything on a narrow result.
- **`page` reaches only the first ~10,000 results** — "exact limit subject to change". The schema offers no cursor, scroll or offset alternative, so this is a hard ceiling on any pager, not a tuning knob.
- **`maxAllowedPage` in the response is the real bound.** It is derived from the match count *and* `perPage`, so raising `perPage` lowers it. Never size a pager on `ceil(total / perPage)`: a broad query reports millions of matches and still refuses page 501. `SearchTecDoc.resolveMaxPage` is the one place that decides this.
- **`perPage: 0` returns counts and facets with no article rows** — guide §8.3 step 1 answers it with 6,943,670 matches and `articles: []`. That is the documented shape of a count-only or facet-only call.
- **`sort` is a repeatable `{ field, direction }`.** `field` is one of `score`, `mfrName`, `articleNumber`, `articleCreatedOn`, `linkageCreatedOn`, `linkageSortNum`; `direction` is `asc` or `desc`. We send none today, so results arrive in TecDoc's own order.
- **Nothing orderable or filterable in TecDoc knows what we can ship.** `includePrices` returns catalogue prices the data supplier filed with TecDoc (typed by `kindOfPriceKey`), not our sell price, and no sort field or facet touches stock. Sorting or filtering by price, availability or delivery time has to be answered from backoffice inventory, which we read per rendered page — see `InventoryService`.

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

Default to no comment. Well-named code explains itself, and every comment is a second thing to keep true — a stale one is worse than none. Write one only when a reader who understands the code would still ask "why?".

Worth a comment:
- A non-obvious constraint or external contract (`the load balancer appends, so the last entry is the trustworthy one`).
- A decision whose alternative looks more sensible at first glance — say why the obvious option was rejected.
- A rule the type system can't express (`must not be called inside a 'use cache' scope`).

Not worth a comment:
- Restating the code (`// loop over the items`, `// return the result`).
- A docblock on every function, parameter, and constant by default. Export docs are for genuinely non-obvious public API, not a house style.
- Explaining a change or its history — that belongs in the commit message. Never write `// changed to fix X` or `// previously we did Y`.
- Section banners inside a function. Use a blank line and a well-named helper instead.

Keep them short. One or two lines carries almost every real explanation; if it takes a paragraph, the design probably needs the explanation more than the reader does — put it in `docs/` and link it. Prefer naming a thing over describing it: a `private` helper called `proxyReportedIp` beats a comment above an index expression.

**General**
- Don't repeat yourself — if the same logic appears twice, extract it.
- Leave the code cleaner than you found it (Boy Scout Rule), but only within the scope of the current task.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/002-autoparts-shop-spec/plan.md`.
<!-- SPECKIT END -->
