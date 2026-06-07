# Implementation Plan: Autoparts Shop — Online Store

**Branch**: `002-autoparts-shop-spec` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-autoparts-shop-spec/spec.md`

---

## Summary

Build a customer-facing automotive parts e-commerce shop as a TypeScript monorepo (Next.js frontend + NestJS API + shared package), integrating with an existing Spring Boot backoffice for all supplier pricing and fulfilment logic. The shop enables vehicle-first part discovery via TecDoc Pegasus 3.0, real-time availability-confirmed checkout via the backoffice internal REST API, myPOS/COD payments, and live order status updates via Server-Sent Events driven by SQS fulfilment events. Mechanic (B2B) trade accounts are approved via the backoffice and receive trade pricing everywhere in the shop.

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode across all workspaces)

**Primary Dependencies**:
- Frontend (`apps/web`): Next.js 15 (App Router), shadcn/ui, Tailwind CSS v4, TanStack Query v5, Zustand v5
- Backend (`apps/api`): NestJS 11, Prisma 6, `@aws-sdk/client-sqs`, `@clerk/backend`, `svix`, `@nestjs/throttler`
- Shared (`packages/shared`): Zod v3 (validation schemas + TypeScript inference)

**Storage**: PostgreSQL (shop schema — Prisma managed), Redis (TecDoc + availability cache), AWS SQS (two queues — async event bus)

**Testing**: Jest (unit + integration), Playwright (E2E critical journeys), Supertest (NestJS controller integration)

**Target Platform**: Vercel (Next.js), AWS Lightsail Containers (NestJS + Redis), eu-central-1

**Project Type**: E-commerce web application — TypeScript monorepo (Turborepo + npm workspaces)

**Performance Goals**:
- Vehicle selection → category browse: customer completes in under 90 seconds (SC-001)
- Pre-payment availability check: completes in under 3 seconds (SC-003)
- Order status SSE push: customer sees status change within 10 seconds of operator action (SC-004)
- Part number search: 95% of searchable queries return at least one match (SC-005)

**Constraints**:
- Pre-checkout price/availability check MUST use a live (non-cached) backoffice call — Redis cache MUST NOT be used for financial decisions (Constitution VII, ARCHITECTURE.md §Pricing)
- Zero orders may be placed for out-of-stock items (SC-006, FR-032)
- Mobile-first: all critical interactions work on screens ≥ 360px wide
- Bulgarian delivery addresses only at launch; currency is EUR (Bulgaria adopted the Euro)
- `shop_app` DB user has no access to `backoffice.supplier_stock` — all pricing goes through the backoffice internal REST API

**Scale/Scope**:
- Two apps + one shared package; ~15 frontend routes, ~35 API endpoints
- Launch target: single Lightsail Container node (~$10/mo) + Vercel free/pro (~$0–$20/mo)
- TecDoc catalogue: vehicle tree is stable reference data (7-day Redis TTL); article detail has 24h TTL

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Domain-Driven Architecture | Each NestJS module maps to exactly one bounded context. `Order` aggregate owns its own state transitions driven exclusively by SQS events. `Money`, `ArticleNumber`, `VehicleId` defined as value objects in `packages/shared`. NestJS never reads `supplier_stock` directly. | ✅ PASS |
| II. NestJS Backend Conventions | Repository pattern in every module. Controllers delegate to exactly one service method. Cross-module communication via SQS/EventEmitter only. Barrel files (`index.ts`) per module. | ✅ PASS |
| III. Next.js Frontend Conventions | App Router exclusively. Server Components by default; `'use client'` at leaf interactive islands only. All NestJS calls via `src/lib/api/` functions. TanStack Query for client-side server state. Every page has `loading.tsx` and `error.tsx`. | ✅ PASS |
| IV. Shared Contract Layer | All request/response DTOs, Zod schemas, `OrderStatus` enum, domain enums, and shared types live in `packages/shared`. Never defined inline in either app. Breaking changes update both apps in the same commit. | ✅ PASS |
| V. Test-First Development | TDD cycle mandatory: failing test → implementation → refactor. Unit tests (≥ 80% coverage, 100% for domain logic). Integration tests for every controller. E2E (Playwright) for vehicle search → cart → checkout and order status. | ✅ PASS |
| VI. Code Quality & TypeScript | Strict mode, no `any`, no `ts-ignore` without explanation. Named exports preferred. No dead code. Imports ordered: external → `@vp-parts-shop/shared` → internal. | ✅ PASS |
| VII. Security by Default | Global `JwtGuard` (Clerk JWT via `@clerk/backend`); public endpoints use `@Public()`. Internal backoffice endpoints use `InternalGuard` (shared-secret bearer token, private-network only). All checkout confirmation calls are live (non-cached). Rate limiting via `@nestjs/throttler` on all public endpoints. CORS explicitly configured. Error responses return only `{ statusCode, errorCode }`. | ✅ PASS |
| VIII. Performance & Caching | Redis TTLs from ARCHITECTURE.md enforced exactly: vehicle tree 7d, article detail 24h, search 1h, autocomplete 30m, price+availability 5m. Pre-checkout call bypasses Redis entirely. No N+1 queries — Prisma `include`/`select` used. | ✅ PASS |
| IX. Money Handling | All monetary DB fields are `Int` (EUR cents). `PriceCalculator` domain service is the single calculation point with 100% unit test coverage. `formatPrice(cents)` from `@vp-parts-shop/shared` is the only display formatter. myPOS receives integer cents. Rounding applied exactly once at VAT step. | ✅ PASS |

**Result**: All 9 principles satisfied. No Complexity Tracking entries required.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-autoparts-shop-spec/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── contracts/
│   └── api-endpoints.md ← Phase 1 output
├── design.md            ← UI/UX design reference (Claude Design export — tokens, components, pages)
└── tasks.md             ← Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/
├── web/                               # Next.js — Vercel
│   └── src/
│       ├── app/
│       │   ├── (marketing)/
│       │   │   └── page.tsx           # Homepage (ISR 6h)
│       │   └── (shop)/
│       │       ├── layout.tsx         # Shop shell (cart drawer, vehicle context)
│       │       ├── vehicles/
│       │       │   └── page.tsx       # Vehicle selector (Client Component)
│       │       ├── catalog/
│       │       │   ├── [categorySlug]/
│       │       │   │   ├── page.tsx   # Category listing (ISR 1h)
│       │       │   │   ├── loading.tsx
│       │       │   │   └── error.tsx
│       │       │   └── articles/
│       │       │       └── [articleNumber]/
│       │       │           ├── page.tsx   # Article detail (SSR)
│       │       │           ├── loading.tsx
│       │       │           └── error.tsx
│       │       ├── search/
│       │       │   └── page.tsx       # Search results (SSR)
│       │       ├── cart/
│       │       │   └── page.tsx       # Full cart page (Client Component)
│       │       ├── checkout/
│       │       │   └── page.tsx       # Checkout flow (Client Component)
│       │       ├── orders/
│       │       │   ├── page.tsx       # Order history (Server Component)
│       │       │   └── [orderId]/
│       │       │       └── page.tsx   # Order detail (Client Component + SSE)
│       │       └── account/
│       │           └── page.tsx       # Account settings (Client Component)
│       ├── components/
│       │   ├── ui/                    # shadcn primitives — never edit directly
│       │   ├── catalog/               # VehicleSelector, ArticleCard, CategoryNav
│       │   ├── cart/                  # CartDrawer, CartItem, CartSummary
│       │   ├── checkout/              # AddressForm, ShippingSelector, PaymentStep
│       │   └── orders/                # OrderStatusBadge, OrderTimeline, SSEStatusUpdater
│       ├── lib/
│       │   ├── api/                   # one file per domain — only place fetch is called
│       │   │   ├── catalog.ts
│       │   │   ├── inventory.ts
│       │   │   ├── cart.ts
│       │   │   ├── orders.ts
│       │   │   ├── payments.ts
│       │   │   ├── customers.ts
│       │   │   └── shipping.ts
│       │   └── utils.ts               # cn(), formatMoney(), formatDate()
│       ├── hooks/
│       │   ├── use-vehicle-context.ts
│       │   ├── use-cart.ts
│       │   └── use-order-status-sse.ts
│       └── types/                     # FE-only types (not shared contract types)
│
└── api/                               # NestJS — Lightsail Containers
    └── src/
        ├── catalog/                   # TecDoc proxy, vehicle search, article browse
        │   ├── tecdoc/                # TecDocClient, TecDocCacheService
        │   ├── catalog.controller.ts
        │   ├── catalog.service.ts
        │   ├── catalog.repository.ts
        │   └── index.ts
        ├── inventory/                 # Delegates to backoffice /internal/price-and-availability
        │   ├── backoffice.client.ts   # HTTP client + token cache + retry logic
        │   ├── inventory.service.ts
        │   └── index.ts
        ├── orders/                    # Order aggregate, checkout orchestration, SSE
        │   ├── order.aggregate.ts     # State machine + invariants
        │   ├── orders.controller.ts
        │   ├── orders.service.ts
        │   ├── orders.repository.ts
        │   ├── checkout.service.ts    # Orchestrates validate → pay → place order
        │   ├── sse.service.ts         # SSE connection registry
        │   └── index.ts
        ├── payments/                  # myPOS, COD adapters
        │   ├── mypos/
        │   │   └── mypos.adapter.ts
        │   ├── cod/
        │   │   └── cod.adapter.ts
        │   └── index.ts
        ├── customers/                 # Account management, mechanic approval
        │   ├── customers.controller.ts
        │   ├── customers.service.ts
        │   ├── customers.repository.ts
        │   └── index.ts
        ├── search/                    # Part number normalisation, autocomplete
        │   ├── search.controller.ts
        │   ├── search.service.ts
        │   ├── normaliser.ts          # Brand token stripping, uppercase, hyphen removal
        │   └── index.ts
        ├── shipping/                  # Econt + Speedy cost calculation
        │   ├── econt.client.ts
        │   ├── speedy.client.ts
        │   ├── shipping.service.ts
        │   └── index.ts
        ├── cart/                      # Cart CRUD, session merge, saved carts
        │   ├── cart.controller.ts
        │   ├── cart.service.ts
        │   ├── cart.repository.ts
        │   └── index.ts
        ├── events/                    # SQS publisher + consumer, SSE relay, email
        │   ├── sqs.publisher.ts
        │   ├── sqs.consumer.ts
        │   ├── email.worker.ts
        │   └── index.ts
        ├── auth/                      # Global JwtGuard (Clerk), InternalGuard, @Public() decorator
        │   ├── jwt.guard.ts
        │   ├── clerk-jwt.strategy.ts
        │   ├── internal.guard.ts
        │   ├── public.decorator.ts
        │   └── index.ts
        └── common/                    # Global exception filter, interceptors, pipes
            ├── exception.filter.ts
            ├── logging.interceptor.ts
            └── index.ts

packages/
└── shared/
    └── src/
        ├── dto/                       # All request + response DTOs
        │   ├── catalog.dto.ts
        │   ├── cart.dto.ts
        │   ├── checkout.dto.ts
        │   ├── orders.dto.ts
        │   └── customers.dto.ts
        ├── schemas/                   # Zod validation schemas (frontend + backend)
        │   ├── address.schema.ts
        │   ├── cart.schema.ts
        │   ├── checkout.schema.ts
        │   └── customers.schema.ts
        ├── errors.ts                  # AppErrorCode enum + ApiErrorResponse interface
        ├── enums.ts                   # OrderStatus, CustomerRole, PaymentMethod, etc.
        └── index.ts

infra/
├── docker/
│   └── docker-compose.yml            # PostgreSQL (5432) + Redis (6379) for local dev
└── lightsail/
    └── container-service.json
```

**Structure Decision**: Turborepo monorepo with Workspace Option 2 (frontend + backend + shared package). Module layout follows bounded contexts as specified in ARCHITECTURE.md. Each NestJS module owns its internal files and exposes only a barrel `index.ts` to other modules.
