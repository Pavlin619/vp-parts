<!--
## Sync Impact Report (v1.1.0)

**Version change**: `1.0.0` → `1.1.0`

**Version bump rationale**: MINOR — new Principle IX (Money Handling) added; no existing principles modified.

**Modified principles**: None

**Added sections**:
- IX. Money Handling

**Removed sections**: None

**Templates checked**:
- `.specify/templates/plan-template.md` ✅ — Constitution Check gate section compatible; Principle IX added as a gate row in `plan.md` for the current feature
- `.specify/templates/spec-template.md` ✅ — no changes required
- `.specify/templates/tasks-template.md` ✅ — no changes required
- `.specify/templates/constitution-template.md` — source template; no edits required (amendment is project-level only)

**Deferred TODOs**: None

---

## Sync Impact Report (v1.0.0)

**Version change**: `[CONSTITUTION_VERSION]` → `1.0.0` (initial constitution ratification — all placeholder tokens replaced)

**Version bump rationale**: MINOR — first population from template skeleton with concrete project content;
no prior versioned governance to compare against.

**Modified principles**: N/A — initial commit

**Added sections**:
- I. Domain-Driven Architecture
- II. NestJS Backend Conventions
- III. Next.js Frontend Conventions
- IV. Shared Contract Layer
- V. Test-First Development
- VI. Code Quality & TypeScript
- VII. Security by Default
- VIII. Performance & Caching
- Definition of Done
- Governance

**Removed sections**: None

**Templates checked**:
- `.specify/templates/plan-template.md` ✅ — Constitution Check gate section present; compatible with all 8 principles
- `.specify/templates/spec-template.md` ✅ — requirements/success-criteria structure compatible; no changes required
- `.specify/templates/tasks-template.md` ✅ — TDD-first task ordering (tests written before implementation) aligns with Principle V
- `.specify/templates/constitution-template.md` ✅ — source template; no edits required

**Deferred TODOs**: None — all placeholders resolved.
-->

# Autoparts Shop Constitution

## Core Principles

### I. Domain-Driven Architecture

The system is organized around seven bounded contexts: **Catalog**, **Orders**, **Inventory**,
**Customers**, **Payments**, **Fulfillment**, and **Auth**. Each NestJS module maps to exactly
one bounded context — no exceptions.

**Ubiquitous language is non-negotiable.** Domain terms (e.g., "article" not "product") MUST be
used consistently in variable names, DTOs, database columns, UI labels, and all written
communication. Never use technical synonyms alongside domain terms.

**Domain logic MUST NOT leak.** Controllers, HTTP handlers, Server Components, and Server Actions
MUST NOT contain business rules or state transition logic. All domain logic lives in domain
services and aggregate roots.

**Aggregates own their invariants.** The `Order` aggregate owns its own valid state transitions
(`PROCESSING → ITEMS_PREPARED → ON_THE_WAY → DELIVERED`, terminal states `CANCELLED` and
`FULFILLMENT_FAILED`). Nothing outside the Orders domain changes order status directly —
transitions happen exclusively through domain events consumed from SQS.

**Value objects MUST be defined** for: `Money` (amount + currency), `ArticleNumber` (normalized
part number), `VehicleId`. These are never plain primitives at the domain boundary.

**The Spring Boot backoffice is the single source of truth** for all supplier logic — pricing
rules, stock routing, and fulfillment decisions. NestJS is a presentation and checkout layer.
NestJS MUST NOT read `backoffice.supplier_stock` directly; all pricing and availability queries
go through the backoffice internal REST API (`GET /internal/price-and-availability/:articleNumber`).

### II. NestJS Backend Conventions

**One module per bounded context** — feature modules, not layer modules. `common/` is reserved
for truly cross-cutting concerns only: global exception filter, interceptors, pipes, decorators.

**Controllers are thin.** A controller MUST validate input (via DTO + `ValidationPipe`), call
exactly one service method, and return the response. No `if/else` business logic, no multiple
service calls, no repository access in controllers.

**Repository pattern is mandatory.** All Prisma calls are wrapped in a repository class
(e.g., `OrderRepository`). Services MUST NOT import or call `PrismaClient` directly.

**Module boundaries are hard.** A module MUST NOT import from another module's internal files.
Cross-module access goes via the module's public barrel (`index.ts`). Cross-feature communication
goes through SQS events or NestJS `EventEmitter` — never direct service injection across bounded
contexts.

**Validation at the boundary.** `ValidationPipe` is registered globally with
`{ whitelist: true, forbidNonWhitelisted: true, transform: true }`. Services receive
already-valid, typed DTOs.

**Error contract is fixed.** Every error response MUST conform to `ApiErrorResponse` from
`@vp-parts-shop/shared`. Domain exceptions carry an `AppErrorCode`. The global exception filter
formats all errors — raw messages, stack traces, file paths, and third-party API responses
MUST NOT reach the client.

**Config via `ConfigService` only.** `process.env` MUST NOT be accessed directly. All env vars
are validated at startup via `ConfigModule.forRoot({ isGlobal: true, validationSchema })`.

**Cross-cutting concerns use interceptors.** Logging, response transformation, and caching layers
MUST be implemented as NestJS interceptors — never inlined in controllers or services.

### III. Next.js Frontend Conventions

**App Router exclusively.** No Pages Router patterns are permitted.

**Default to Server Components.** Add `'use client'` only at the leaf level for interactive
islands (browser APIs, event handlers, React hooks). A `'use client'` boundary moves the entire
subtree into the client bundle — minimize this surface area.

**Server Components call the NestJS API**, not the database. They call functions from
`apps/web/src/lib/api/` directly (auth tokens stay server-side). Client Components use
**TanStack Query** for all server state — `useEffect` + `fetch` for initial data loading is
forbidden.

**Rendering strategy is fixed by ARCHITECTURE.md:**
- Homepage: ISR, revalidate 6 h
- Category pages: ISR, revalidate 1 h
- Product detail: SSR (fresh stock/price on every request)
- Vehicle selector, Cart, Checkout: Client Component
- Order detail: Client Component + SSE for real-time status

**All NestJS API calls live in `src/lib/api/`** (one file per domain). Components MUST NOT call
`fetch` directly. The `apiFetch` wrapper is the single place for headers, base URL, and token
injection.

**All form validation uses Zod schemas from `@vp-parts-shop/shared`.** Validation logic MUST NOT
be duplicated between frontend and backend.

**Every page component MUST have a sibling `loading.tsx` and `error.tsx`.**

**Accessibility is non-negotiable.** All interactive elements MUST have `aria-label` attributes.
All images MUST have `alt` text. Keyboard navigation MUST work throughout.

**UI follows the established design system.** shadcn/ui primitives in `src/components/ui/` MUST
NOT be modified directly — wrap them in a feature component. Use `cn()` for all conditional class
merging. CVA for component variants. No inline `style={{}}` except for truly dynamic CSS custom
properties.

### IV. Shared Contract Layer

**`packages/shared` is the single source of truth** for the API contract between `apps/web`
and `apps/api`.

All request/response DTOs MUST live in `packages/shared/src/dto`. API shapes MUST NOT be
defined inline in either app.

All Zod validation schemas MUST live in `packages/shared/src/schemas`. These are used for both
frontend form validation and backend pipe validation — define once, import everywhere.

Shared enums (`OrderStatus`, vehicle types, article types) MUST be defined once in
`packages/shared` and imported everywhere. They MUST NOT be redefined or duplicated.

**Breaking changes to shared types MUST update both `apps/api` and `apps/web` in the same
commit.** Never leave the two apps out of sync on shared types.

### V. Test-First Development

**TDD is mandatory.** The cycle is: write the failing test → confirm it fails → implement the
minimum code to pass → refactor. Never write implementation before the test.

**Test pyramid:**

- **Unit tests (Jest):** Every public service method, every domain entity, every value object.
  Mock all external dependencies (Prisma, Redis, external APIs) at the boundary — never inside
  the dependency. Coverage: ≥ 80% overall; 100% for domain logic (aggregates, value objects,
  state machines).
- **Integration tests (Jest + Supertest):** Every NestJS controller endpoint. Use a real test
  database (separate schema). Test the happy path AND all explicit error paths.
- **E2E tests (Playwright):** Critical user journeys only — vehicle search → add to cart,
  checkout flow, order status page. Run against local stack.

**Test naming convention is fixed:**

```
describe('ServiceName') → describe('methodName') → it('should [behaviour] when [condition]')
```

Examples:
- `it('should return cached price when Redis has valid entry')`
- `it('should call backoffice API when Redis cache is empty')`
- `it('should throw NotFoundException when article does not exist')`

`'it works'` and `'it should work'` are NEVER acceptable test descriptions.

**Mocking rules:**
- Mock at the boundary: mock `TecDocClient` in catalog service tests, not inside `TecDocClient`.
- Never mock the system under test.
- Use factory functions for test data — never write raw object literals inline in tests.

### VI. Code Quality & TypeScript

**TypeScript strict mode always.** No `any`. No `ts-ignore` without an explicit written
explanation in the same comment. All domain concept types come from `@vp-parts-shop/shared` or
are locally scoped value objects — never define a domain type inline.

**Naming reveals intent.** No abbreviations (`usr`, `cfg`, `mgr`). Booleans start with `is`,
`has`, or `can`. Functions are verbs (`fetchOrder`, `validateCart`). Classes are nouns
(`OrderService`, `CartItem`).

**One function, one responsibility.** Functions longer than 20 lines SHOULD be decomposed.
Maximum 2–3 parameters; group related params into a DTO when exceeded.

**Imports are ordered:** external packages → `@vp-parts-shop/shared` → internal modules.

**Named exports are preferred** over default exports, except for Next.js pages and NestJS modules.

**No dead code.** No commented-out code committed. No `console.log` in production code — use
`NestJS Logger` or Next.js logging primitives.

**Formatting:** one blank line between logical sections inside a function; two blank lines between
top-level class members; line length ≤ 100 characters.

### VII. Security by Default

**Every NestJS endpoint is protected by `JwtGuard` by default.** Public endpoints MUST be
explicitly marked with `@Public()`.

**Never trust client data for financial decisions.** Pricing and availability MUST always be
re-validated against the backoffice via a fresh (non-cached) call before payment is taken.
The 5-minute Redis browse cache MUST NOT be used at checkout.

**No secrets in code, comments, or logs.** All secrets are accessed via `ConfigService` from
environment variables. `.env.example` documents all required variables; actual secrets are
never committed.

**Input sanitization.** All user-provided strings MUST be sanitized before storing or querying.

**Rate limiting on all public endpoints** via NestJS Throttler.

**CORS is explicitly configured.** No wildcard origins in production.

**Error responses never expose internals.** SQL errors, stack traces, file paths, and third-party
API messages MUST be logged server-side only. The global exception filter returns only
`{ statusCode, errorCode }` to the client.

### VIII. Performance & Caching

**Follow the Redis caching strategy from ARCHITECTURE.md exactly.** Respect all defined TTLs:

| Data | TTL |
|---|---|
| Vehicle reference data (manufacturers, model series, types, assembly groups) | 7 days |
| Article detail | 24 h |
| Part number search results | 1 h |
| Autocomplete suggestions | 30 min |
| Price + availability (browse cache) | 5 min — **MUST NOT be used at checkout** |

**No N+1 queries.** Use Prisma `include`/`select` to load related data in one query.

**Database queries MUST use the indexes defined in ARCHITECTURE.md.** No full table scans on
`supplier_stock` or `tecdoc_cache`.

**Next.js images MUST use `next/image`** with explicit `width` and `height`.

**SSE connections MUST be cleaned up on client disconnect.** Do not leave open streams for
disconnected clients.

### IX. Money Handling

**All monetary values are stored, computed, and transmitted as integer cents (EUR).** 1 EUR = 100 cents. `1299` represents €12.99. Never use floats or decimal strings in computation contexts — these are forbidden at every layer.

**NestJS is the sole authority on price calculations.** The frontend displays what the backend returns. The frontend MUST NOT send a calculated total to the backend — totals are always computed server-side and returned in the response.

**Rounding happens exactly once per order calculation — at the VAT step — using round-half-up.** Line totals (`unitPrice × quantity`) and subtotals are always exact integer multiplication — no rounding is applied. A single `Math.round(subtotal * 0.20)` produces the VAT amount. The grand total is the sum of exact integers.

**`formatPrice(cents: number)` in `@vp-parts-shop/shared` is the only permitted way to convert cents to a display string.** It uses `Intl.NumberFormat` with `currency: 'EUR'` and `style: 'currency'`. Price formatting is never done inline in components or services.

**Payment providers receive amounts as integer cents.** Stripe's `amount` field and myPOS Checkout's amount parameter receive the integer cent value directly — never a decimal. This matches the providers' own integer-amount expectations.

**`PriceCalculator` is a domain service in `apps/api/src/common/`** with 100% unit test coverage. It is the only place VAT and total calculations are performed. It MUST have explicit tests for rounding edge cases — e.g. a price of 1 cent (rounds correctly), prices where VAT in decimal would be `.5` (round half up), multi-item orders where per-item rounding would differ from aggregate rounding.

## Definition of Done

A feature is complete when ALL of the following are true:

1. **TDD cycle completed** — tests written first, all passing (unit + integration + E2E where applicable).
2. **Shared types defined** in `@vp-parts-shop/shared` for anything shared between `apps/api` and `apps/web`.
3. **Controller integration test** covers happy path and all error paths.
4. **Zero TypeScript errors, zero lint errors** across all workspaces (`npm run type-check && npm run lint` from root).
5. **Module boundary rules followed** — no cross-module internal imports.
6. **Visual output matches the design** — UI matches the established design system (shadcn/ui + Tailwind; no invented component patterns or visual styles).
7. **ARCHITECTURE.md consulted and not contradicted.**
8. **No secrets, no `console.log`, no commented-out code.**

## Governance

This constitution supersedes all other practices and informal conventions. It is the final word
on how this project is built.

**Amendment procedure:**

1. Open a PR that edits this file and any affected dependent templates.
2. Increment the version following semantic versioning:
   - **MAJOR** — backward-incompatible governance changes, principle removals, or redefinitions.
   - **MINOR** — new principle or section added; materially expanded guidance.
   - **PATCH** — clarifications, wording improvements, typo fixes, non-semantic refinements.
3. Update `LAST_AMENDED_DATE` to the amendment date (ISO format YYYY-MM-DD).
4. Update all dependent templates if the amendment affects their Constitution Check gates,
   task categories, or required artifacts.
5. The PR description MUST include the Sync Impact Report (version change, modified/added/removed
   principles, updated templates, deferred TODOs).

**Compliance review:**

- Every PR review MUST verify that the implementation complies with all nine principles and the
  Definition of Done before merge.
- Justified departures from a principle MUST be documented in the plan's Complexity Tracking
  table with explicit justification and the simpler alternative that was considered and rejected.

**ARCHITECTURE.md is the authoritative source** for all infrastructure, service boundaries, data
ownership, and technology decisions. This constitution MUST NOT contradict it. If a conflict is
found, the constitution amendment MUST be made consistent with ARCHITECTURE.md.

**Version**: 1.1.0 | **Ratified**: 2026-06-02 | **Last Amended**: 2026-06-05
