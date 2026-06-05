# Tasks: Autoparts Shop — Online Store

**Input**: Design documents from `/specs/002-autoparts-shop-spec/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | data-model.md ✅ | contracts/api-endpoints.md ✅ | research.md ✅ | design.md ✅

**Design reference**: All frontend tasks MUST match `specs/002-autoparts-shop-spec/design.md` pixel-for-pixel. That file contains design tokens, component specs, and page layouts from the approved Claude Design prototype. Read it before implementing any component or page.

**Organization**: Tasks grouped by user story to enable independent implementation and testing. TDD is mandatory per Constitution Principle V — unit tests are written before implementation in every phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in the same phase)
- **[Story]**: Which user story this task belongs to ([US1]–[US10])
- Every task includes an exact file path

## Path Conventions (this project)

- **Backend**: `apps/api/src/`
- **Frontend**: `apps/web/src/`
- **Shared**: `packages/shared/src/`
- **Unit tests**: co-located `.spec.ts` files alongside source
- **e2e tests (NestJS)**: `apps/api/test/`
- **e2e tests (Playwright)**: `apps/web/e2e/`
- **Infra**: `infra/docker/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The monorepo skeleton exists (Turborepo, NestJS bootstrap, Next.js bootstrap, Prisma config). This phase fills in everything else the whole project depends on: Prisma schema, shared contract layer, NestJS core infrastructure, Next.js core infrastructure.

- [ ] T001 Define Prisma schema with all entities (Customer, MechanicProfile, Address, Cart, CartItem, Order, OrderItem, OrderStatusHistory, SavedVehicle) plus all enums and indexes from data-model.md in `apps/api/prisma/schema.prisma`
- [ ] T002 Run initial Prisma migration and regenerate Prisma client in `apps/api/` (`npx prisma migrate dev --name init && npx prisma generate`)
- [ ] T003 [P] Define all shared enums (CustomerRole, MechanicApprovalStatus, OrderStatus, ShippingMethod, PaymentMethod) in `packages/shared/src/enums.ts`
- [ ] T004 [P] Define AppErrorCode enum and ApiErrorResponse interface in `packages/shared/src/errors.ts`
- [ ] T005 [P] Define value objects Money, ArticleNumber, VehicleId as branded types in `packages/shared/src/types/value-objects.ts`
- [ ] T006 [P] Implement formatPrice(cents) using Intl.NumberFormat (EUR, currency style) in `packages/shared/src/utils.ts`
- [ ] T007 Define Zod validation schemas (address.schema.ts, cart.schema.ts, checkout.schema.ts, customers.schema.ts) in `packages/shared/src/schemas/`
- [ ] T008 Define all request/response DTOs (catalog.dto.ts, cart.dto.ts, checkout.dto.ts, orders.dto.ts, customers.dto.ts) in `packages/shared/src/dto/`
- [ ] T009 Export all types, schemas, DTOs, enums, value objects, and utilities from `packages/shared/src/index.ts`
- [ ] T010 [P] Write unit tests for PriceCalculator covering all rounding edge cases (1 cent, 999 cents, multi-item aggregation) in `apps/api/src/common/price-calculator.spec.ts` — mandatory 100% coverage per Constitution IX
- [ ] T011 Implement PriceCalculator domain service (lineTotal, subtotal, vatAmount with single Math.round, orderTotal) in `apps/api/src/common/price-calculator.ts` — implement AFTER T010 tests fail
- [ ] T012 [P] Configure ConfigModule with Joi env validation schema (all env vars validated at startup) in `apps/api/src/app.module.ts`
- [ ] T013 [P] Register global ValidationPipe `{ whitelist: true, forbidNonWhitelisted: true, transform: true }` and configure CORS in `apps/api/src/main.ts`
- [ ] T014 [P] Implement global exception filter (strips internals, returns only `{ statusCode, errorCode }`) in `apps/api/src/common/exception.filter.ts`
- [ ] T015 [P] Implement request logging interceptor using NestJS Logger (no PII or payment data in logs) in `apps/api/src/common/logging.interceptor.ts`
- [ ] T016 Implement JwtGuard (validates Keycloak shop realm JWT) in `apps/api/src/auth/jwt.guard.ts`
- [ ] T017 [P] Implement JwtStrategy (Keycloak JWKS endpoint, shop realm) in `apps/api/src/auth/jwt.strategy.ts`
- [ ] T018 [P] Implement @Public() decorator for opt-out of JwtGuard in `apps/api/src/auth/public.decorator.ts`
- [ ] T019 Create AuthModule barrel and export JwtGuard and @Public() in `apps/api/src/auth/index.ts`
- [ ] T020 Create CommonModule barrel exporting exception filter, logging interceptor, PriceCalculator in `apps/api/src/common/index.ts`
- [ ] T020b [P] Configure Tailwind theme with all design tokens from `specs/002-autoparts-shop-spec/design.md` (colors, Inter + Space Grotesk + JetBrains Mono fonts, spacing scale, border-radius, shadows) in `apps/web/tailwind.config.ts` and `apps/web/src/app/globals.css`
- [ ] T021 [P] Implement apiFetch wrapper (base URL, Authorization header injection, ApiErrorResponse error parsing) in `apps/web/src/lib/api/index.ts`
- [ ] T022 [P] Configure TanStack Query provider (QueryClient with defaults) in `apps/web/src/app/providers.tsx`
- [ ] T023 [P] Implement cn() utility and formatDate() helper in `apps/web/src/lib/utils.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire NestJS modules together, configure rate limiting and Redis, and set up test infrastructure. Must complete before any user story work begins.

**⚠️ CRITICAL**: No user story implementation can start until this phase is complete.

- [ ] T024 Wire AuthModule, CommonModule, ThrottlerModule (rate limiting on all public endpoints), and ConfigModule (isGlobal: true) into AppModule in `apps/api/src/app.module.ts`
- [ ] T025 [P] Create `.env.example` at repo root documenting all required environment variables (Keycloak, DB, Redis, SQS, Stripe, myPOS, Econt, Speedy, TecDoc, email provider)
- [ ] T026 [P] Set up NestJS e2e test helper (createTestApp factory with test database override) in `apps/api/test/helpers/create-test-app.ts`
- [ ] T027 [P] Configure Playwright for Next.js e2e tests (baseURL, test directory, browser targets) in `apps/web/playwright.config.ts`

**Checkpoint**: NestJS starts, JWT auth is active globally, global error handling and rate limiting are wired, Prisma migration is applied — user story implementation can begin.

---

## Phase 3: User Story 1 — Vehicle-First Part Discovery (Priority: P1) 🎯 MVP

**Goal**: A visitor selects a vehicle (make → model series → variant) and browses compatible parts by category. Parts with no stock are labelled "Currently Unavailable". Parts with stock show the lowest price across suppliers.

**Independent Test**: Open the shop, select a vehicle, navigate to a category, and verify that parts list correctly with availability labels — no account or cart required.

### Tests for User Story 1 (write first — confirm they FAIL before implementing)

- [ ] T028 [P] [US1] Write unit tests for TecDocClient (getManufacturers, getModelSeries, getVehicleTypes, getAssemblyGroupTree, getArticles, getArticleDetails — mock HTTP calls) in `apps/api/src/catalog/tecdoc/tecdoc-client.spec.ts`
- [ ] T029 [P] [US1] Write unit tests for TecDocCacheService (Redis hit returns cached value, Redis miss calls TecDocClient and populates cache, TTLs: vehicle tree 7d, article 24h per ARCHITECTURE.md) in `apps/api/src/catalog/tecdoc/tecdoc-cache.service.spec.ts`
- [ ] T030 [P] [US1] Write unit tests for CatalogService (manufacturer list, model series filter by manufacturerId, category tree, article listing with best-price derivation and unavailability labelling) in `apps/api/src/catalog/catalog.service.spec.ts`
- [ ] T031 [US1] Write integration tests for CatalogController (all GET /catalog/* endpoints, caching headers, pagination) in `apps/api/test/catalog.e2e-spec.ts`

### Implementation for User Story 1

- [ ] T032 [P] [US1] Implement TecDocClient (HTTP proxy to TecDoc Pegasus 3.0 API, API key from ConfigService) in `apps/api/src/catalog/tecdoc/tecdoc-client.ts`
- [ ] T033 [US1] Implement TecDocCacheService (Redis check-then-set with per-operation TTLs; cache key `tecdoc:{operation}:{params-hash}`) in `apps/api/src/catalog/tecdoc/tecdoc-cache.service.ts`
- [ ] T034 [US1] Implement CatalogRepository (TecDoc data is Redis-cached only at launch — no Postgres; stub for future Postgres cache) in `apps/api/src/catalog/catalog.repository.ts`
- [ ] T035 [US1] Implement CatalogService (delegate to TecDocCacheService; expose vehicle tree, category tree, article listing with best price and availability via InventoryService) in `apps/api/src/catalog/catalog.service.ts`
- [ ] T036 [US1] Implement CatalogController (@Public; GET /catalog/manufacturers, /manufacturers/:id/model-series, /model-series/:id/variants, /vehicles/:vehicleId/categories, /vehicles/:vehicleId/categories/:categoryId/articles, /articles/:articleNumber) in `apps/api/src/catalog/catalog.controller.ts`
- [ ] T037 [US1] Create CatalogModule and barrel in `apps/api/src/catalog/index.ts`
- [ ] T038 [US1] Implement catalog API functions (getManufacturers, getModelSeries, getVariants, getCategories, listArticles, getArticleDetail) in `apps/web/src/lib/api/catalog.ts`
- [ ] T039 [US1] Implement use-vehicle-context hook (Zustand store; persist selected vehicle in localStorage; sync to server for logged-in users via PATCH /customers/me) in `apps/web/src/hooks/use-vehicle-context.ts`
- [ ] T040 [P] [US1] Create VehicleSelector client component (full-screen modal on mobile, step-by-step make/model/year, current selection always visible, no horizontal scroll at 360px) in `apps/web/src/components/catalog/vehicle-selector.tsx`
- [ ] T041 [P] [US1] Create CategoryNav component (assembly group tree sidebar/accordion) in `apps/web/src/components/catalog/category-nav.tsx`
- [ ] T042 [P] [US1] Create ArticleCard component (thumbnail, article number, brand, "Currently Unavailable" badge for no-stock, bestPriceIncVat via formatPrice, "Add to Cart" button) in `apps/web/src/components/catalog/article-card.tsx`
- [ ] T043 [US1] Implement shop layout (vehicle context provider, CartDrawer slot, VehicleSelector trigger) with `loading.tsx` and `error.tsx` in `apps/web/src/app/(shop)/layout.tsx`
- [ ] T044 [US1] Implement vehicle selector page (Client Component, renders VehicleSelector) in `apps/web/src/app/(shop)/vehicles/page.tsx`
- [ ] T045 [US1] Implement category listing page (ISR 1 h, `revalidateTag('catalog')`, ArticleCard grid) with `loading.tsx` and `error.tsx` in `apps/web/src/app/(shop)/catalog/[categorySlug]/page.tsx`
- [ ] T046 [US1] Implement homepage (ISR 6 h, vehicle selector entry point, TecAlliance "TecDoc Inside" signet per licensing requirement) with `loading.tsx` and `error.tsx` in `apps/web/src/app/(marketing)/page.tsx`

**Checkpoint**: Vehicle selection → category browse independently functional. A tester can select a vehicle and see compatible parts. Deploy/demo as MVP increment.

---

## Phase 4: User Story 2 — Part Number Search (Priority: P1)

**Goal**: A customer types a part number (clean or messy); the system normalises and returns matching parts with vehicle fit indicator if a vehicle is selected.

**Independent Test**: Type a known part number into the search bar and verify the correct part appears — no vehicle selection or account required.

### Tests for User Story 2

- [ ] T047 [P] [US2] Write unit tests for normaliser covering all 8 pipeline steps (trim, tokenise, strip brand tokens, join, remove hyphens/dots, collapse spaces, uppercase) and the configurable brand dictionary in `apps/api/src/search/normaliser.spec.ts`
- [ ] T048 [P] [US2] Write unit tests for SearchService (exact match → redirect, multi-match → list, no match → empty results, autocomplete returns ≤8 for ≥3 char input, cache key convention) in `apps/api/src/search/search.service.spec.ts`
- [ ] T049 [US2] Write integration tests for SearchController (GET /search?q and GET /search/autocomplete?q, with and without vehicleId) in `apps/api/test/search.e2e-spec.ts`

### Implementation for User Story 2

- [ ] T050 [P] [US2] Implement part number normaliser (8-step pipeline, brand dictionary loaded from ConfigService, output is ArticleNumber value object) in `apps/api/src/search/normaliser.ts`
- [ ] T051 [US2] Implement SearchService (normalise input → TecDoc search via CatalogService → resolve to single redirect / multi-match list / empty; autocomplete cached 30 min; annotate vehicle fit if vehicleId provided) in `apps/api/src/search/search.service.ts`
- [ ] T052 [US2] Implement SearchController (@Public; GET /search?q with optional vehicleId; GET /search/autocomplete?q) in `apps/api/src/search/search.controller.ts`
- [ ] T053 [US2] Create SearchModule and barrel in `apps/api/src/search/index.ts`
- [ ] T054 [US2] Implement search API functions (searchByPartNumber, getAutocomplete) in `apps/web/src/lib/api/catalog.ts` (extend existing file)
- [ ] T055 [P] [US2] Create SearchBar component (debounced input, autocomplete dropdown ≤8 items, submit triggers search page navigation) in `apps/web/src/components/catalog/search-bar.tsx`
- [ ] T056 [US2] Implement search results page (SSR; auto-redirect on single match; multi-match article list with brand/description/price/fit indicator; empty-state with contact prompt) with `loading.tsx` and `error.tsx` in `apps/web/src/app/(shop)/search/page.tsx`

**Checkpoint**: Part number search fully functional independently. Any user can search without vehicle selection or login.

---

## Phase 5: User Story 3 — Part Detail Page (Priority: P1)

**Goal**: A visitor viewing a specific part sees all information (specs, images, OEM refs, compatible vehicles, live availability, pricing by role) and can add to cart.

**Independent Test**: Navigate directly to a part URL and verify all information renders with accurate live availability status.

### Tests for User Story 3

- [ ] T057 [P] [US3] Write unit tests for BackofficeClient (OAuth2 client credentials token fetch, in-memory token cache, 60-second refresh threshold, single retry on 401) in `apps/api/src/inventory/backoffice-client.spec.ts`
- [ ] T058 [P] [US3] Write unit tests for InventoryService (returns live price/availability, passes customer role for trade price, no Redis cache for this service) in `apps/api/src/inventory/inventory.service.spec.ts`
- [ ] T059 [US3] Write integration tests for availability endpoint (GET /inventory/articles/:articleNumber/availability — no cached response headers) in `apps/api/test/inventory.e2e-spec.ts`

### Implementation for User Story 3

- [ ] T060 [P] [US3] Implement BackofficeClient (OAuth2 client credentials flow, in-memory token cache with 60s expiry buffer, automatic retry on 401) in `apps/api/src/inventory/backoffice.client.ts`
- [ ] T061 [US3] Implement InventoryService (call backoffice GET /internal/price-and-availability/:articleNumber with customer role; return stockStatus, estimatedDeliveryDays, priceExVat, priceIncVat, tradePriceExVat for MECHANIC) in `apps/api/src/inventory/inventory.service.ts`
- [ ] T062 [US3] Implement InventoryController (GET /inventory/articles/:articleNumber/availability — protected, no cache) in `apps/api/src/inventory/inventory.controller.ts`
- [ ] T063 [US3] Create InventoryModule and barrel in `apps/api/src/inventory/index.ts`
- [ ] T064 [US3] Implement inventory API function (getAvailability) in `apps/web/src/lib/api/inventory.ts`
- [ ] T065 [P] [US3] Create ArticleImages component (image gallery, "no image available" placeholder visually distinct from product images) in `apps/web/src/components/catalog/article-images.tsx`
- [ ] T066 [P] [US3] Create ArticleSpecs component (technical specs table, OEM cross-reference numbers, compatible vehicles list) in `apps/web/src/components/catalog/article-specs.tsx`
- [ ] T067 [P] [US3] Create VehicleFitBadge component ("Fits your [Vehicle Name]" or "Does not fit" indicator near part title) in `apps/web/src/components/catalog/vehicle-fit-badge.tsx`
- [ ] T068 [P] [US3] Create RelatedParts component (same category + same vehicle compatibility, Server Component) in `apps/web/src/components/catalog/related-parts.tsx`
- [ ] T069 [US3] Implement article detail page (SSR — fresh stock/price every request; role-based price display; "Add to Cart" hidden when out-of-stock; quantity selector) with `loading.tsx` and `error.tsx` in `apps/web/src/app/(shop)/catalog/articles/[articleNumber]/page.tsx`

**Checkpoint**: Part detail page independently functional — all information renders, availability is live, add-to-cart button state is correct.

---

## Phase 6: User Story 4 — Cart Management (Priority: P1)

**Goal**: A logged-in customer accumulates parts, edits quantities, removes items, sees live totals, and gets pre-checkout availability validation before proceeding. Mechanics can save named carts.

**Independent Test**: Add multiple parts, adjust quantities, remove one, verify totals recalculate — without proceeding to checkout.

### Tests for User Story 4

- [ ] T070 [P] [US4] Write unit tests for CartService (add item, update quantity, remove item, get active cart with refreshed prices, merge anonymous cart on login, pre-checkout validate, save named cart for MECHANIC, reopen saved cart with price refresh) in `apps/api/src/cart/cart.service.spec.ts`
- [ ] T071 [US4] Write integration tests for CartController (GET /cart, POST /cart/items, PATCH /cart/items/:articleNumber, DELETE /cart/items/:articleNumber, POST /cart/validate, POST /cart/save, GET /cart/saved) in `apps/api/test/cart.e2e-spec.ts`

### Implementation for User Story 4

- [ ] T072 [US4] Implement CartRepository (active cart CRUD, saved cart create/list, cartItem upsert with (cartId, articleNumber) unique constraint) in `apps/api/src/cart/cart.repository.ts`
- [ ] T073 [US4] Implement CartService (add/update/remove items, merge anonymous cart items, refresh prices via InventoryService on GET, pre-checkout validate, mechanic named cart save/reopen with price refresh) in `apps/api/src/cart/cart.service.ts`
- [ ] T074 [US4] Implement CartController (all 7 cart endpoints; POST /cart/save and GET /cart/saved require MECHANIC role) in `apps/api/src/cart/cart.controller.ts`
- [ ] T075 [US4] Create CartModule and barrel in `apps/api/src/cart/index.ts`
- [ ] T076 [US4] Implement cart API functions (getCart, addItem, updateItem, removeItem, validateCart, saveCart, listSavedCarts) in `apps/web/src/lib/api/cart.ts`
- [ ] T077 [US4] Implement Zustand anonymous cart store (localStorage persistence, merge-on-login action that calls POST /cart/items for each local item then clears local store) in `apps/web/src/hooks/use-cart.ts`
- [ ] T078 [P] [US4] Create CartItem component (thumbnail, article number, brand, quantity stepper, unit price with VAT label, line total via formatPrice) in `apps/web/src/components/cart/cart-item.tsx`
- [ ] T079 [P] [US4] Create CartSummary component (subtotal ex-VAT, VAT amount, grand total inc-VAT, all via formatPrice) in `apps/web/src/components/cart/cart-summary.tsx`
- [ ] T080 [US4] Create CartDrawer component (sidebar overlay; server cart via TanStack Query; empty-cart state with browse CTA) in `apps/web/src/components/cart/cart-drawer.tsx`
- [ ] T081 [US4] Implement full cart page (Client Component; validate-before-checkout gate showing unavailable items; mechanic "Save Cart" button) in `apps/web/src/app/(shop)/cart/page.tsx`

**Checkpoint**: Cart management fully functional. Server cart persists across devices; anonymous cart merges on login; pre-checkout validation flags unavailable items correctly.

---

## Phase 7: User Story 5 — Checkout Flow (Priority: P1)

**Goal**: A logged-in customer provides a delivery address, selects shipping + payment, confirms a live-price-verified order summary, and pays. On success: on-screen confirmation + confirmation email.

**Independent Test**: Complete a full end-to-end checkout with a test payment and verify an order is created and confirmation is received.

### Tests for User Story 5

- [ ] T082 [P] [US5] Write unit tests for Order aggregate state machine (all valid transitions, all invalid transitions throw, terminal states reject further transitions) in `apps/api/src/orders/order.aggregate.spec.ts`
- [ ] T083 [P] [US5] Write unit tests for CheckoutService (live confirm calls backoffice, price-change detection, out-of-stock halt prevents order creation, PriceCalculator used for totals) in `apps/api/src/orders/checkout.service.spec.ts`
- [ ] T084 [P] [US5] Write unit tests for StripeAdapter (createPaymentIntent, webhook signature verification using Stripe SDK) in `apps/api/src/payments/stripe/stripe.adapter.spec.ts`
- [ ] T085 [P] [US5] Write unit tests for MyPosAdapter (initiate hosted checkout, IPN HMAC-SHA256 signature verification) in `apps/api/src/payments/mypos/mypos.adapter.spec.ts`
- [ ] T086 [P] [US5] Write unit tests for CodAdapter (COD threshold enforcement: reject when total > COD_MAX_ORDER_TOTAL_CENTS) in `apps/api/src/payments/cod/cod.adapter.spec.ts`
- [ ] T087 [P] [US5] Write unit tests for EcontClient and SpeedyClient (shipping cost calculation, flat-rate fallback when API unavailable) in `apps/api/src/shipping/econt.client.spec.ts` and `apps/api/src/shipping/speedy.client.spec.ts`
- [ ] T088 [US5] Write integration tests for full checkout flow (POST /orders/checkout/confirm, POST /payments/stripe/intent, POST /orders, order confirmation response) in `apps/api/test/checkout.e2e-spec.ts`

### Implementation for User Story 5

- [ ] T089 [US5] Implement Order aggregate with state machine and invariant enforcement in `apps/api/src/orders/order.aggregate.ts`
- [ ] T090 [US5] Implement OrdersRepository (atomic create order + items + initial OrderStatusHistory entry; query history; update status) in `apps/api/src/orders/orders.repository.ts`
- [ ] T091 [US5] Implement CheckoutService (live confirm via InventoryService — no Redis cache; detect price changes; halt on out-of-stock; compute totals via PriceCalculator; create Order atomically) in `apps/api/src/orders/checkout.service.ts`
- [ ] T092 [US5] Implement SqsPublisher (publish OrderPlaced event to fulfillment SQS queue) in `apps/api/src/events/sqs.publisher.ts`
- [ ] T093 [US5] Implement OrdersService (list orders, get order detail, request cancellation) in `apps/api/src/orders/orders.service.ts`
- [ ] T094 [US5] Implement OrdersController (POST /orders/checkout/confirm, POST /orders, GET /orders, GET /orders/:id, POST /orders/:id/cancel, GET /orders/:id/status SSE via @Sse()) in `apps/api/src/orders/orders.controller.ts`
- [ ] T095 [US5] Create OrdersModule and barrel in `apps/api/src/orders/index.ts`
- [ ] T096 [P] [US5] Implement EcontClient (shipping cost calculation, basic auth, origin: Sofia warehouse) in `apps/api/src/shipping/econt.client.ts`
- [ ] T097 [P] [US5] Implement SpeedyClient (shipping cost calculation, username+password auth) in `apps/api/src/shipping/speedy.client.ts`
- [ ] T098 [US5] Implement ShippingService (orchestrate Econt + Speedy; return flat-rate fallback on API error with "estimate" note) in `apps/api/src/shipping/shipping.service.ts`
- [ ] T099 [US5] Implement ShippingController (@Public; GET /shipping/rates?method&city&postcode&weightGrams) in `apps/api/src/shipping/shipping.controller.ts`
- [ ] T100 [US5] Create ShippingModule and barrel in `apps/api/src/shipping/index.ts`
- [ ] T101 [P] [US5] Implement StripeAdapter (createPaymentIntent with integer cents amount) in `apps/api/src/payments/stripe/stripe.adapter.ts`
- [ ] T102 [P] [US5] Implement StripeWebhookController (@Public; POST /payments/stripe/webhook; Stripe-Signature verification; on payment_intent.succeeded trigger order creation + SqsPublisher) in `apps/api/src/payments/stripe/stripe-webhook.controller.ts`
- [ ] T103 [P] [US5] Implement MyPosAdapter (server-side Checkout API call → return checkoutUrl) in `apps/api/src/payments/mypos/mypos.adapter.ts`
- [ ] T104 [P] [US5] Implement MyPosIpnController (@Public; POST /payments/mypos/ipn; HMAC-SHA256 verification; on success trigger order creation + SqsPublisher) in `apps/api/src/payments/mypos/mypos-ipn.controller.ts`
- [ ] T105 [P] [US5] Implement CodAdapter (threshold check against COD_MAX_ORDER_TOTAL_CENTS, direct order creation for COD orders) in `apps/api/src/payments/cod/cod.adapter.ts`
- [ ] T106 [US5] Create PaymentsModule and barrel in `apps/api/src/payments/index.ts`
- [ ] T107 [US5] Implement ConfigController (@Public; GET /config/checkout → { codMaxOrderTotal, vatRate }) in `apps/api/src/config/config.controller.ts`
- [ ] T108 [US5] Implement checkout and orders API functions (confirmCheckout, createOrder, initiateStripePayment, initiateMyPosPayment, confirmCodOrder) in `apps/web/src/lib/api/orders.ts` and `apps/web/src/lib/api/payments.ts`
- [ ] T109 [US5] Implement shipping API function (getShippingRates) in `apps/web/src/lib/api/shipping.ts`
- [ ] T110 [P] [US5] Create AddressForm component (Bulgarian address validation: city, 4-digit postcode, street, street number required; apartment optional) in `apps/web/src/components/checkout/address-form.tsx`
- [ ] T111 [P] [US5] Create ShippingSelector component (Econt/Speedy options with cost via formatPrice and estimated delivery days) in `apps/web/src/components/checkout/shipping-selector.tsx`
- [ ] T112 [P] [US5] Create PaymentStep component (Stripe Elements card form; myPOS redirect button; COD option conditional on order total vs. threshold) in `apps/web/src/components/checkout/payment-step.tsx`
- [ ] T113 [US5] Implement multi-step checkout page (Client Component: address → shipping → payment → confirmation; preserve all data on payment failure; redirect to login for anonymous visitors with destination preserved) in `apps/web/src/app/(shop)/checkout/page.tsx`

**Checkpoint**: Full checkout flow functional end-to-end with test payments. Order created, on-screen confirmation shown, confirmation email sent. Revenue-generating MVP.

---

## Phase 8: User Story 6 — Order Tracking (Priority: P2)

**Goal**: A customer sees all past orders, views live-updating order status via SSE without refreshing, and receives an email notification at each status change.

**Independent Test**: Navigate to order detail page of a known order and verify the status displays correctly and updates automatically when the backoffice advances it.

### Tests for User Story 6

- [ ] T114 [P] [US6] Write unit tests for SseService (add connection to registry, remove on disconnect via finalize operator, broadcast to all subjects for an orderId, no orphaned connections after disconnect) in `apps/api/src/orders/sse.service.spec.ts`
- [ ] T115 [P] [US6] Write unit tests for SqsConsumer (processes FulfillmentItemsReady → ITEMS_PREPARED, OrderShipped → ON_THE_WAY with courier data, OrderDelivered → DELIVERED, OrderFulfillmentFailed → FULFILLMENT_FAILED; each triggers SseService.broadcast and EmailWorker) in `apps/api/src/events/sqs.consumer.spec.ts`
- [ ] T116 [P] [US6] Write unit tests for EmailWorker (correct email template selected per OrderStatus, send called once per transition) in `apps/api/src/events/email.worker.spec.ts`
- [ ] T117 [US6] Write integration tests for order tracking endpoints (GET /orders, GET /orders/:id with full detail, SSE stream emits correct status payload) in `apps/api/test/orders-tracking.e2e-spec.ts`

### Implementation for User Story 6

- [ ] T118 [US6] Implement SseService (Map<orderId, Set<Subject<MessageEvent>>>; broadcast on status change; finalize() cleanup on client disconnect) in `apps/api/src/orders/sse.service.ts`
- [ ] T119 [US6] Implement SqsConsumer (poll fulfillment-events queue; update Order status via aggregate and OrdersRepository; trigger SseService.broadcast and EmailWorker per transition) in `apps/api/src/events/sqs.consumer.ts`
- [ ] T120 [US6] Implement EmailWorker (send transactional email per OrderStatus using configured email provider; template per status with plain-language description and order reference) in `apps/api/src/events/email.worker.ts`
- [ ] T121 [US6] Create EventsModule (SqsPublisher, SqsConsumer, EmailWorker) and barrel in `apps/api/src/events/index.ts`
- [ ] T122 [US6] Implement use-order-status-sse hook (EventSource to GET /orders/:orderId/status, update state on message, cleanup EventSource on unmount) in `apps/web/src/hooks/use-order-status-sse.ts`
- [ ] T123 [P] [US6] Create OrderStatusBadge component (four plain-language labels: Processing / Items Prepared / On the Way / Delivered; with description text) in `apps/web/src/components/orders/order-status-badge.tsx`
- [ ] T124 [P] [US6] Create OrderTimeline component (append-only list of status transitions with timestamps from statusHistory) in `apps/web/src/components/orders/order-timeline.tsx`
- [ ] T125 [P] [US6] Create SSEStatusUpdater client component (mounts use-order-status-sse, calls parent onStatusChange callback) in `apps/web/src/components/orders/sse-status-updater.tsx`
- [ ] T126 [US6] Implement orders API functions (listOrders, getOrderDetail) in `apps/web/src/lib/api/orders.ts`
- [ ] T127 [US6] Implement order history page (Server Component, reverse chronological, order reference / date / item count / total / status per row) with `loading.tsx` and `error.tsx` in `apps/web/src/app/(shop)/orders/page.tsx`
- [ ] T128 [US6] Implement order detail page (Client Component + SSEStatusUpdater; full item list; OrderTimeline; cancellation button for PROCESSING status only; courier tracking reference when dispatched) with `loading.tsx` and `error.tsx` in `apps/web/src/app/(shop)/orders/[orderId]/page.tsx`

**Checkpoint**: Customer sees order history and live status updates without page refresh. Email notifications fire on each status transition.

---

## Phase 9: User Story 7 — Customer Account Registration and Management (Priority: P2)

**Goal**: New visitors register, verify their email, log in, reset forgotten passwords, and manage saved delivery addresses.

**Independent Test**: Complete registration, receive verification email, log in, update profile, add a saved address — no order required.

### Tests for User Story 7

- [ ] T129 [P] [US7] Write unit tests for CustomersService (register creates Keycloak user and persists Customer; email verification activates account; profile update; address CRUD with isDefault constraint; password reset token expiry) in `apps/api/src/customers/customers.service.spec.ts`
- [ ] T130 [US7] Write integration tests for CustomersController (POST /customers/register, GET /customers/me, PATCH /customers/me, CRUD /customers/me/addresses) in `apps/api/test/customers.e2e-spec.ts`

### Implementation for User Story 7

- [ ] T131 [US7] Implement CustomersRepository (customer CRUD, address CRUD, lookup by keycloakId and email) in `apps/api/src/customers/customers.repository.ts`
- [ ] T132 [US7] Implement CustomersService (register via Keycloak Admin API, send verification email, profile update, address management with max-default enforcement) in `apps/api/src/customers/customers.service.ts`
- [ ] T133 [US7] Implement CustomersController (@Public POST /customers/register; protected GET/PATCH /customers/me; protected CRUD /customers/me/addresses) in `apps/api/src/customers/customers.controller.ts`
- [ ] T134 [US7] Create CustomersModule and barrel in `apps/api/src/customers/index.ts`
- [ ] T135 [US7] Implement customers API functions (register, getProfile, updateProfile, listAddresses, addAddress, updateAddress, deleteAddress) in `apps/web/src/lib/api/customers.ts`
- [ ] T136 [P] [US7] Create RegisterForm component (first name, last name, email, phone, password with requirements displayed before submit per FR-044) in `apps/web/src/components/auth/register-form.tsx`
- [ ] T137 [P] [US7] Create AddressManager component (list saved addresses, add/edit/delete, set default, used at checkout address step) in `apps/web/src/components/account/address-manager.tsx`
- [ ] T138 [US7] Implement account settings page (Client Component: profile details, AddressManager, links to order history and mechanic application section) with `loading.tsx` and `error.tsx` in `apps/web/src/app/(shop)/account/page.tsx`

**Checkpoint**: Full registration and login flow functional. Saved address management works. Account area accessible.

---

## Phase 10: User Story 8 — Mechanic Trade Account Application (Priority: P2)

**Goal**: A registered customer submits a trade account application; backoffice operator approves or rejects; approved mechanics see trade pricing everywhere in the shop.

**Independent Test**: Submit mechanic application from a customer account and verify it enters PENDING state. Have operator approve it and verify role upgrades to MECHANIC.

### Tests for User Story 8

- [ ] T139 [P] [US8] Write unit tests for mechanic application flow (submit creates MechanicProfile with PENDING status; approve → Customer.role = MECHANIC + Keycloak role assignment + email; reject → reason stored + email, Customer.role remains CUSTOMER) extending `apps/api/src/customers/customers.service.spec.ts`
- [ ] T140 [US8] Write integration tests for mechanic endpoints (POST /customers/mechanic-application, POST /internal/mechanic-approve/:customerId, POST /internal/mechanic-reject/:customerId) in `apps/api/test/mechanic.e2e-spec.ts`

### Implementation for User Story 8

- [ ] T141 [US8] Implement mechanic application logic in CustomersService (createMechanicProfile → PENDING; approveMechanic → update Customer.role + Keycloak Admin API assign ROLE_MECHANIC + activation email; rejectMechanic → store reason + rejection email + Customer remains CUSTOMER) extending `apps/api/src/customers/customers.service.ts`
- [ ] T142 [US8] Implement internal mechanic approve/reject endpoints (service-to-service client credentials auth guard; POST /internal/mechanic-approve/:customerId; POST /internal/mechanic-reject/:customerId) extending `apps/api/src/customers/customers.controller.ts`
- [ ] T143 [P] [US8] Create MechanicApplicationForm component (businessName, EIK, optional VAT number, businessAddress, businessPhone; show PENDING/APPROVED/REJECTED status if application exists) in `apps/web/src/components/account/mechanic-application-form.tsx`
- [ ] T144 [US8] Extend account settings page to include mechanic application section (show form if no application; show pending/approved/rejected state) in `apps/web/src/app/(shop)/account/page.tsx`

**Checkpoint**: Mechanic applies → enters PENDING → operator approves → customer's next login shows ROLE_MECHANIC in JWT → trade prices display everywhere.

---

## Phase 11: User Story 9 — Mechanic B2B Shopping Experience (Priority: P2)

**Goal**: Approved mechanics see only trade pricing universally, save vehicles for quick re-selection (max 10), save named carts, and tag orders with vehicle registration or job reference.

**Independent Test**: Log in as an approved mechanic, browse any part listing, confirm only trade price is displayed. Save a vehicle and verify it re-selects on return.

### Tests for User Story 9

- [ ] T145 [P] [US9] Write unit tests for saved vehicles service (add vehicle, list returns ≤10, add eleventh throws, delete removes entry, unique (customerId, tecdocVehicleId) enforced) extending `apps/api/src/customers/customers.service.spec.ts`
- [ ] T146 [US9] Write integration tests for mechanic B2B endpoints (saved vehicles CRUD, order history filter by vehicleTag/jobReference) in `apps/api/test/mechanic-b2b.e2e-spec.ts`

### Implementation for User Story 9

- [ ] T147 [US9] Implement saved vehicles CRUD (list, add with max-10 enforcement, delete) in CustomersRepository and CustomersService; expose GET/POST/DELETE /customers/me/saved-vehicles (MECHANIC role guard) in CustomersController extending `apps/api/src/customers/`
- [ ] T148 [US9] Extend OrdersController/OrdersService to filter GET /orders by vehicleTag and jobReference query params for MECHANIC role in `apps/api/src/orders/`
- [ ] T149 [P] [US9] Create SavedVehicles component (list up to 10 saved vehicles, quick-select sets vehicle context, delete vehicle) in `apps/web/src/components/account/saved-vehicles.tsx`
- [ ] T150 [US9] Extend checkout page to show vehicleTag and jobReference optional input fields for MECHANIC role in `apps/web/src/app/(shop)/checkout/page.tsx`
- [ ] T151 [US9] Extend account page to show saved carts section (list named carts, open/restore, delete) and saved vehicles section for MECHANIC role in `apps/web/src/app/(shop)/account/page.tsx`

**Checkpoint**: Mechanic B2B experience fully functional — trade prices shown universally, saved vehicles enable quick re-selection, saved carts persist, order tags are searchable.

---

## Phase 12: User Story 10 — Backoffice Fulfilment Dashboard (Priority: P3)

**Goal** (NestJS side only — the Spring Boot dashboard UI is out of scope for this repo): The NestJS API correctly processes all fulfillment SQS events from the backoffice, stores courier tracking data, and triggers customer notifications at each step.

**Independent Test**: Place an online order and verify the SQS consumer correctly processes all fulfillment events (items prepared, shipped with tracking reference, delivered) and triggers SSE + email at each step.

### Tests for User Story 10

- [ ] T152 [US10] Write integration tests for all fulfillment SQS event types (FulfillmentItemsReady, OrderShipped with courierName + trackingReference, OrderDelivered, OrderFulfillmentFailed) in `apps/api/test/fulfillment.e2e-spec.ts`

### Implementation for User Story 10

- [ ] T153 [US10] Extend SqsConsumer to handle OrderShipped event (set Order.courierName and Order.trackingReference from event payload) in `apps/api/src/events/sqs.consumer.ts`
- [ ] T154 [US10] Extend SqsConsumer to handle OrderDelivered and OrderFulfillmentFailed events with correct Order aggregate transitions in `apps/api/src/events/sqs.consumer.ts`
- [ ] T155 [US10] Add daily summary query to OrdersRepository (count orders received/pending/dispatched/delivered today using createdAt index) in `apps/api/src/orders/orders.repository.ts`

**Checkpoint**: All SQS fulfillment events correctly handled; order status transitions drive SSE push and email notifications end-to-end.

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: E2E tests for critical journeys, accessibility, security hardening, performance validation.

- [ ] T156 [P] Write Playwright E2E test for vehicle search → category browse → add to cart journey in `apps/web/e2e/discovery.spec.ts`
- [ ] T157 [P] Write Playwright E2E test for full checkout flow (address → shipping → test payment → confirmation screen) in `apps/web/e2e/checkout.spec.ts`
- [ ] T158 [P] Write Playwright E2E test for order status SSE (place order, simulate fulfillment event, verify page updates without refresh) in `apps/web/e2e/order-tracking.spec.ts`
- [ ] T159 [P] Accessibility audit — add aria-labels to all interactive elements, alt text to all article images, verify keyboard navigation through vehicle selector and checkout flow in `apps/web/src/components/`
- [ ] T160 Run full quality gate across all workspaces (`npm run lint && npm run type-check && npm run test && npm run test:e2e` from repo root)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1–US5 (Phases 3–7, all P1)**: Depend on Foundational completion. Sequential dependency chain: US3 builds on US1 catalog infrastructure; US4 depends on US3 inventory service; US5 depends on US4 cart
- **US6–US9 (Phases 8–11, all P2)**: US6 depends on US5 (orders exist). US7 can start in parallel after Foundational. US8 depends on US7 (customer must exist). US9 depends on US8 (mechanic must be approved)
- **US10 (Phase 12, P3)**: Depends on US5 (SQS flow requires orders); can run in parallel with US6–US9
- **Polish (Phase 13)**: Depends on all desired stories complete

### User Story Dependency Chain

```
Setup → Foundational → US1 → US3 → US4 → US5 → US6
                    ↘ US2 (parallel with US1)     ↓
                    ↘ US7 (parallel) → US8 → US9  ↓
                                               US10 (parallel with US6–US9)
```

### Within Each Story

- Unit tests MUST be written and FAIL before any implementation in that story
- Models/repositories before services
- Services before controllers
- Backend before frontend (shared types must be defined first in packages/shared)
- Story fully functional and tested before moving to next priority

### Parallel Opportunities

- All [P]-marked tasks within a phase can run simultaneously (they touch different files)
- US1 and US2 can be developed by different developers in parallel after Foundational
- US7 customer domain work can be developed in parallel with US3–US5 catalog/inventory/cart work
- All [P]-marked test tasks in each story can be written simultaneously before implementation begins

---

## Parallel Example: User Story 1

```bash
# Step 1 — write all tests in parallel (all touch different files):
Task T028: TecDocClient unit tests
Task T029: TecDocCacheService unit tests
Task T030: CatalogService unit tests

# Step 2 — implement independent parts in parallel:
Task T032: TecDocClient implementation
Task T040: VehicleSelector component
Task T041: CategoryNav component
Task T042: ArticleCard component

# Step 3 — sequential (depends on T032, T033):
Task T033: TecDocCacheService (depends T032)
Task T035: CatalogService (depends T033, T034)
Task T036: CatalogController (depends T035)
```

---

## Implementation Strategy

### MVP First (User Stories 1–5 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — **CRITICAL gate**
3. Complete Phase 3: US1 (Vehicle Discovery) → **STOP AND VALIDATE independently**
4. Complete Phase 4: US2 (Part Number Search) → **STOP AND VALIDATE**
5. Complete Phase 5: US3 (Part Detail + Inventory) → **STOP AND VALIDATE**
6. Complete Phase 6: US4 (Cart Management) → **STOP AND VALIDATE**
7. Complete Phase 7: US5 (Checkout + Payments) → **STOP AND VALIDATE → DEPLOY MVP**

### Incremental Delivery

1. Foundation → US1 → Demo (vehicle browsing works)
2. US2 → Demo (part number search works)
3. US3 → Demo (detail page with live prices and availability)
4. US4 → Demo (cart management and pre-checkout validation)
5. US5 → Demo (full checkout → first real order) — **Revenue-generating MVP**
6. US6 → Demo (live order tracking)
7. US7 → Demo (account management, saved addresses)
8. US8 → Demo (mechanic applications and approvals)
9. US9 → Demo (full B2B mechanic experience)
10. US10 → Demo (backoffice SQS integration complete)

### Parallel Team Strategy

After Foundational phase, assign by domain:

- **Developer A**: US1 + US2 (catalog domain — TecDoc, search, normaliser)
- **Developer B**: US3 + US4 + US5 (inventory, cart, checkout — core transaction flow)
- **Developer C**: US7 + US8 + US9 (customers domain — accounts, mechanics)
- Stories integrate via `packages/shared` contract types — no merge conflicts on domain logic

---

## Notes

- [P] tasks have no dependencies on other incomplete tasks in the same phase and touch different files
- TDD is mandatory per Constitution V — unit tests MUST be written and confirmed failing before implementation in every phase
- `packages/shared` is the merge boundary — update shared types before implementing consuming code in either app
- All monetary values are integer EUR cents throughout every layer (Constitution IX); never use floats or decimal strings
- Pre-checkout price/availability check MUST bypass Redis entirely — call BackofficeClient live (Constitution VII, FR-030)
- `shop_app` Postgres user has no access to `backoffice.supplier_stock` — all pricing goes through the backoffice REST API
- SSE connections MUST be cleaned up via the finalize() operator on disconnect (Constitution VIII)
- Commit after each completed task or logical group before starting the next
