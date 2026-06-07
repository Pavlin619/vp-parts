# Research: Autoparts Shop — Technical Decisions

**Branch**: `002-autoparts-shop-spec` | **Date**: 2026-06-05

All decisions derived from `ARCHITECTURE.md` (authoritative), `spec.md`, and `constitution.md`. No NEEDS CLARIFICATION markers remain.

---

## 1. TecDoc Pegasus 3.0 Integration

**Decision**: Proxy pattern — all TecDoc calls are made server-side by NestJS. The TecDoc API key never reaches the browser. NestJS checks Redis before every TecDoc call; misses populate Redis and return the result.

**Key API operations**:

| Operation | TecDoc Endpoint / Method | Notes |
|---|---|---|
| List manufacturers | `getManufacturers` | Country: `BG`, language: `bg`. Results cached 7 days. |
| Model series for manufacturer | `getModelSeries` | Filtered by `manufacturerId`. Cached 7 days. |
| Vehicle variants (types) | `getVehicleTypes` | Filtered by `modelSeriesId`. Cached 7 days. |
| Assembly group tree | `getAssemblyGroupTree` | For selected vehicle linkage target. Cached 7 days. |
| Compatible articles for vehicle + assembly group | `getArticles` (linked to vehicle) | Returns all matching articles including OEM cross-refs. |
| Article detail | `getArticleDetails` | By `articleNumber` + `brandNumber`. Cached 24h. |
| Part number search | `getArticles` with `searchType: 10`, `searchMatchType: prefix_or_suffix` | Input normalised before query. Results cached 1h. |
| Autocomplete | `getArticles` with prefix match, limit 8 | Cached 30 min. |

**Cache key convention**: `tecdoc:{operation}:{params-hash}` in Redis. Hash computed from all query parameters sorted alphabetically.

**Rationale**: Proxy pattern enforces that the API key is a backend secret. Redis caching at defined TTLs (per ARCHITECTURE.md §TecDoc Caching Strategy) keeps latency low for stable reference data while respecting API rate limits.

**Alternatives considered**:
- Direct browser TecDoc calls — rejected: API key exposure and CORS issues
- Postgres TecDoc cache — deferred: Redis TTLs sufficient at launch volume; revisit when Redis memory pressure is measurable (per ARCHITECTURE.md)

**Legal requirement**: "TecAlliance TecDoc Inside" signet required on shop homepage per TecDoc licensing terms.

---

## 2. Part Number Normalisation Algorithm

**Decision**: Multi-step text normalisation pipeline applied before any catalogue lookup.

**Steps** (in order):
1. Trim leading and trailing whitespace
2. Split on whitespace into tokens
3. Remove any token that matches a brand dictionary (case-insensitive): `WIX`, `BOSCH`, `MANN`, `MAHLE`, `VALEO`, `FEBI`, `SACHS`, `SKF`, `NGK`, `BERU`, `DENSO`, `FRAM`, `DAYCO`, `GATES`, `CONTITECH`, `HELLA`, `OSRAM`, `PHILIPS`, `LIQUI MOLY`, etc. Dictionary is configurable via environment/config.
4. Join remaining tokens
5. Remove all hyphens (`-`) and dots (`.`)
6. Remove all spaces
7. Convert to uppercase
8. Result is the `NormalisedArticleNumber` value object

**Example**: `"WL6340 WIX"` → strip "WIX" → `"WL6340"` → remove hyphens → `"WL6340"` → uppercase → `"WL6340"`

**Rationale**: Real-world part number input is messy. Mechanics and customers copy numbers from packaging, invoices, and web pages where brand names appear alongside numbers. Stripping known brand tokens recovers the bare part number that TecDoc searches against. The brand dictionary starts with the most common Bulgarian market suppliers and is extended at runtime without code changes.

**Alternatives considered**:
- Regular expression heuristics to detect numeric-dominant tokens — rejected: brand names like `MANN` and `HELLA` are alphanumeric and indistinguishable from short part numbers by pattern alone
- TecDoc fuzzy search with raw input — rejected: returns too many false positives; normalization produces cleaner results

---

## 3. myPOS Payment Integration

**Decision**: myPOS Checkout hosted payment page flow. The business already uses myPOS as the POS terminal provider in the physical shop, giving an established merchant relationship, proven reliability, and lower transaction fees compared to Stripe. myPOS natively supports all Bulgarian bank-issued cards (DSK, UniCredit Bulgaria, Postbank, etc.) with 3DS 2.0, replacing the need for a separate Bulgarian card processor.

**Integration flow**:
1. Customer selects myPOS at checkout. NestJS makes a server-side REST call to the myPOS Checkout API with the order details (amount in integer cents, currency `EUR`, order reference, return URLs).
2. myPOS returns a `checkoutUrl` — the hosted payment page for this payment session.
3. NestJS returns `{ checkoutUrl }` to the frontend.
4. Frontend redirects the customer's browser to `checkoutUrl`.
5. Customer completes card entry and 3DS authentication on myPOS's hosted page.
6. myPOS sends an IPN (Instant Payment Notification) via signed POST to `POST /payments/mypos/ipn` on NestJS. NestJS verifies the HMAC-SHA256 signature using the merchant secret key.
7. On successful IPN verification, NestJS creates the order and publishes `OrderPlaced` to SQS. Returns `200` to myPOS.
8. myPOS redirects the customer's browser to the success or failure return URL configured in step 1.

**Key request parameters** (exact field names to be confirmed from myPOS Checkout API documentation during implementation): order amount (integer cents), currency (`EUR`), order reference, merchant ID, success URL, cancel URL, IPN URL, signature.

**Rationale**:
- Existing merchant account and POS relationship — no new commercial onboarding required
- Lower per-transaction fee than Stripe — material cost saving at the expected order volume
- Full support for Bulgarian bank-issued cards with 3DS 2.0 — the original reason for a dedicated Bulgarian processor still applies; myPOS fulfils this role with a cleaner modern REST API
- Single card payment provider at launch reduces integration scope and operational complexity

**Alternatives considered**:
- Keeping Borica — rejected: myPOS covers the same Bulgarian card support with better developer experience (REST + webhook vs. MAC-signed HTML form POST) and lower fees; no reason to maintain Borica alongside myPOS
- Stripe only — rejected: reliability problems with Bulgarian bank-issued cards from local banks; myPOS is better suited as the primary card processor for this market

---

## 4. Econt and Speedy Courier Integration

**Decision**: Both couriers expose REST APIs for cost calculation and office lookup. Integration is limited to (1) calculating shipping cost at checkout given the destination city/postcode and estimated package weight, and (2) receiving a tracking reference from the backoffice after dispatch (the backoffice owns courier dispatch, not NestJS).

**Econt integration** (for cost calculation only):
- API: `https://ee.econt.com/services/Shipments/ShipmentService.createShipment` (calculate mode) or the simpler `tariffCalculator` endpoint
- Auth: basic auth with Econt API credentials
- Request: origin city (Sofia warehouse), destination city/postcode, weight in grams
- Response: delivery cost in EUR cents, estimated days

**Speedy integration** (for cost calculation only):
- API: `https://api.speedy.bg/v1/calculation/` 
- Auth: `username` + `password` in request body
- Request: sender site ID, recipient postcode, parcel weight, parcel count
- Response: price, expected delivery date

**Tracking references**: The backoffice creates the courier shipment after fulfilment. NestJS receives the tracking reference as part of the `OrderShipped` SQS event payload. NestJS does not call courier APIs to create shipments.

**Rationale**: Separating cost calculation (NestJS responsibility) from shipment creation (backoffice responsibility) preserves the architectural boundary — the backoffice owns all supplier and fulfilment logic. NestJS only needs shipping cost for the checkout UI.

**Alternatives considered**:
- Single flat-rate fallback — acceptable as a launch fallback if courier API credentials are unavailable; FR-028 notes this graceful degradation
- Courier dispatch from NestJS — rejected: contradicts the backoffice ownership principle (Constitution I)

---

## 5. Internal API Auth (Shared-Secret Bearer Token)

**Decision**: A long random secret (`INTERNAL_API_TOKEN`) is shared between NestJS and the Spring Boot backoffice via environment variables. `BackofficeClient` includes `Authorization: Bearer <INTERNAL_API_TOKEN>` on every call to the backoffice. The NestJS `InternalGuard` verifies the same token on incoming calls from the backoffice to NestJS internal endpoints. Internal endpoints are only accessible within the Lightsail private network — the Lightsail container service and the VM are in the same region; public-network access to internal routes is blocked at the network/firewall layer.

**Rationale**: The services communicate only over the private network, which is the primary access control. The shared secret is defence-in-depth — it ensures that even if a misconfiguration ever exposed an internal endpoint, unauthenticated callers would be rejected. OAuth2 client credentials were the original design when Keycloak was planned, but Keycloak is no longer part of the stack. A simple shared secret eliminates the OAuth2 infrastructure dependency for M2M auth, significantly reduces operational complexity, and adds no perceptible latency (no token fetch or cache management required).

**Alternatives considered**:
- OAuth2 client credentials (Keycloak) — rejected: Keycloak removed from the stack; the complexity overhead is not justified for two internal services on the same private network
- Per-request JWT signed with a shared private key — rejected: unnecessary complexity for the same security boundary

---

## 6. SSE for Real-Time Order Status

**Decision**: NestJS exposes `GET /orders/:orderId/status` as a Server-Sent Events stream. When the `SqsConsumerService` processes a `fulfillment-events` message, it updates `shop.orders.status` in Postgres and notifies the `SseService` which broadcasts the new status to all open SSE connections for that `orderId`.

**In-memory connection registry**: `SseService` maintains a `Map<orderId, Set<Subject>>`. When a customer opens the order detail page, a new `Subject` (RxJS) is registered. When the customer disconnects (SSE `complete`), the Subject is removed. When an event arrives, the service calls `.next()` on all subjects for the affected order.

**Cleanup**: SSE streams are cleaned up on client disconnect via the observable's `finalize` operator — no orphaned connections (Constitution VIII).

**Scalability note**: The in-memory registry does not scale beyond a single NestJS instance. For multi-instance deployments, a Redis pub/sub channel per orderId would be needed. At launch, one Lightsail Container node is sufficient and this is explicitly noted for future scaling.

**Rationale**: SSE is simpler than WebSockets for a unidirectional server-push use case. NestJS has native SSE support via `@Sse()` decorator and `Observable<MessageEvent>`. No additional infrastructure is required.

**Alternatives considered**:
- Polling from frontend — rejected: wastes bandwidth, adds backend load, 10-second update requirement (SC-004) is hard to meet without short polling intervals
- WebSockets — rejected: bidirectional protocol is unnecessary for one-way status push; SSE is simpler and sufficient

---

## 7. Mechanic Approval via Backoffice

**Decision**: Mechanic approval is executed in two steps: (1) NestJS persists the `MechanicProfile` in `shop.customers` with status `PENDING`; (2) the backoffice operator approves in the Spring Boot dashboard, which calls `POST /internal/mechanic-approve/:customerId` on NestJS using the shared-secret bearer token; (3) NestJS upgrades the customer's role to `MECHANIC` in Postgres **and** calls the Clerk Backend API to set `publicMetadata.role = 'MECHANIC'` on the Clerk user; (4) the mechanic's next Clerk session (issued on their next sign-in or session refresh) will carry `role: MECHANIC` in JWT claims, activating trade pricing.

**Trade pricing**: The backoffice `GET /internal/price-and-availability/:articleNumber` endpoint accepts a `role` query parameter. For `MECHANIC`, it returns the trade price. NestJS reads the role from the validated JWT claims and passes it on every availability call.

**Rationale**: Clerk is the source of truth for authentication. Storing `role` in Clerk `publicMetadata` propagates it into the JWT session token automatically. NestJS `JwtGuard` reads the role from the JWT claims — no DB lookup needed per request. The mechanic receives an approval email; trade pricing activates on their next session, which is acceptable per spec.

**Alternatives considered**:
- Role stored only in Postgres, looked up per request — rejected: adds a DB lookup on every authenticated request; JWT claims approach is stateless and more performant
- Real-time session invalidation after role upgrade — not required: the mechanic is emailed on approval and the spec states trade pricing activates on their next session; brief delay is acceptable

---

## 8. Cash on Delivery Threshold

**Decision**: The COD threshold is stored as a configurable value in NestJS `ConfigModule` (`COD_MAX_ORDER_TOTAL_CENTS`). The spec's placeholder is €200.00 (20000 cents) pending confirmation from the business owner. The frontend receives the threshold via a public configuration endpoint so it can conditionally show the COD option before the user reaches the payment step.

**Endpoint**: `GET /config/checkout` returns `{ codMaxOrderTotal: 20000, vatRate: 0.20 }` — public, no auth required. The `codMaxOrderTotal` value is integer cents.

**Rationale**: The threshold must be changeable without a code deployment. A `ConfigModule`-backed environment variable satisfies this without a database table for a single scalar value.

---

## 9. Money Handling — Integer Cents (EUR)

**Decision**: All monetary values are stored, computed, and transmitted as integer cents (EUR). Bulgaria now uses the Euro. €12.99 is `1299`. Floats and decimal strings are forbidden in computation contexts at every layer.

**Storage**: Prisma schema uses `Int` for all monetary fields. No `Decimal` or `Float` types for money.

**Calculation rules**:
- Line totals: `unitPriceCents × quantity` — exact integer multiplication, never rounded
- Subtotals: exact integer sum of line totals — never rounded
- VAT: `Math.round(subtotalCents × 0.20)` — rounding applied exactly once
- Order total: `subtotal + vatAmount + shippingCents` — exact integer sum

**Display**: `formatPrice(cents: number)` in `@vp-parts-shop/shared` is the only permitted display formatter. It uses `Intl.NumberFormat({ style: 'currency', currency: 'EUR' })`. All component code calls this function — no inline arithmetic or string formatting.

**Payment providers**:
- Stripe `amount` field: integer cents — matches Stripe's documented format
- myPOS Checkout: amount sent as integer cents; currency sent as `EUR`

**`PriceCalculator` domain service**: Single location in `apps/api/src/common/price-calculator.ts` for all VAT and total calculations. 100% unit test coverage with explicit rounding edge-case tests.

**Rationale**: Floating-point arithmetic is unsuitable for money — `0.1 + 0.2 !== 0.3` in IEEE 754. Integer cents eliminate this class of bugs entirely. Both Stripe and myPOS expect integer amounts, making this the natural representation for the full stack.

**Alternatives considered**:
- `Decimal` type (arbitrary precision) — rejected: adds a library dependency (`decimal.js`), more complex than integer arithmetic for a two-decimal-place currency, and both payment providers require integers anyway
- `string` with decimal point — rejected: requires parsing at every computation boundary, error-prone
