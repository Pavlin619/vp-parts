# API Contracts: Autoparts Shop NestJS API

**Branch**: `002-autoparts-shop-spec` | **Date**: 2026-06-05

Base URL: `https://api.vpparts.bg` (production) / `http://localhost:3001` (local dev)

All request and response types are defined in `packages/shared/src/dto/`. All error responses conform to `ApiErrorResponse` from `packages/shared/src/errors.ts`: `{ statusCode: number, errorCode: AppErrorCode }`.

**Authentication**: Clerk-issued Bearer JWT in `Authorization` header on all protected endpoints. Public endpoints are marked `[PUBLIC]`. Internal endpoints (called by the Spring Boot backoffice) use a shared-secret bearer token (`INTERNAL_API_TOKEN`) and are only reachable from the Lightsail private network.

> **Money convention**: All monetary values in requests and responses are **integer EUR cents**. `1500` = €15.00. The frontend uses `formatPrice(cents)` from `@vp-parts-shop/shared` for all display formatting. The backend never returns floats or decimal strings for monetary fields.

---

## Catalog Module

### Manufacturers

**`GET /catalog/manufacturers`** `[PUBLIC]`

Returns all available vehicle manufacturers for the selected country (BG).

Response `200`:
```json
[
  { "id": "16", "name": "Volkswagen" },
  { "id": "5", "name": "BMW" }
]
```
Cache: Redis, 7 days.

---

### Model Series

**`GET /catalog/manufacturers/:manufacturerId/model-series`** `[PUBLIC]`

Returns model series for a specific manufacturer.

Path params: `manufacturerId` — TecDoc manufacturer ID

Response `200`:
```json
[
  { "id": "16_2", "manufacturerId": "16", "name": "Golf" },
  { "id": "16_3", "manufacturerId": "16", "name": "Passat" }
]
```
Cache: Redis, 7 days.

---

### Vehicle Variants

**`GET /catalog/model-series/:seriesId/variants`** `[PUBLIC]`

Returns year/engine variants for a model series.

Response `200`:
```json
[
  {
    "vehicleId": "V10042",
    "seriesId": "16_2",
    "name": "Golf VII",
    "yearFrom": 2012,
    "yearTo": 2020,
    "engine": "2.0 TDI",
    "powerKw": 110,
    "fuelType": "Diesel",
    "bodyType": "Hatchback"
  }
]
```
Cache: Redis, 7 days.

---

### Assembly Groups (Categories)

**`GET /catalog/vehicles/:vehicleId/categories`** `[PUBLIC]`

Returns the top-level assembly group tree for the selected vehicle. Only groups that have at least one compatible article are returned.

Response `200`:
```json
[
  { "id": "1001", "name": "Brakes", "parentId": null },
  { "id": "1002", "name": "Engine", "parentId": null },
  { "id": "2001", "name": "Brake Discs", "parentId": "1001" }
]
```
Cache: Redis, 7 days.

---

### Article Listing

**`GET /catalog/vehicles/:vehicleId/categories/:categoryId/articles`** `[PUBLIC]`

Returns all articles compatible with the vehicle in the given assembly group. Includes articles with no stock (marked `available: false`).

Query params:
- `page` (default 1), `pageSize` (default 20, max 50)

Response `200`:
```json
{
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "items": [
    {
      "articleNumber": "WL6340",
      "brandName": "WIX",
      "description": "Oil Filter",
      "thumbnailUrl": "https://cdn.example.com/img/WL6340.jpg",
      "available": true,
      "bestPriceExVat": 1250,
      "bestPriceIncVat": 1500
    },
    {
      "articleNumber": "OC123",
      "brandName": "MANN",
      "description": "Oil Filter",
      "thumbnailUrl": null,
      "available": false,
      "bestPriceExVat": null,
      "bestPriceIncVat": null
    }
  ]
}
```

---

### Article Detail

**`GET /catalog/articles/:articleNumber`** `[PUBLIC]`

Full article detail. Includes cross-references, images, specs, compatible vehicles.

Query params: `vehicleId` (optional) — if provided, adds `fitsVehicle: boolean` to response.

Response `200`:
```json
{
  "articleNumber": "WL6340",
  "brandName": "WIX",
  "description": "Oil Filter, Manual Transmission",
  "images": ["https://cdn.example.com/img/WL6340-1.jpg"],
  "technicalSpecs": [
    { "key": "Height (mm)", "value": "87" },
    { "key": "Outer Diameter (mm)", "value": "76" }
  ],
  "oemNumbers": ["06L115561", "06L115562"],
  "compatibleVehicles": [
    { "vehicleId": "V10042", "name": "VW Golf VII 2.0 TDI 110kW (2012–2020)" }
  ],
  "fitsVehicle": true,
  "available": true,
  "stockStatus": "IN_STOCK",
  "estimatedDeliveryDays": 1,
  "bestPriceExVat": 1250,
  "bestPriceIncVat": 1500,
  "tradePriceExVat": 980,
  "tradePriceIncVat": 1176
}
```

Note: `tradePriceExVat` / `tradePriceIncVat` are only populated for authenticated `MECHANIC` role requests. For all other callers these fields are omitted. All price fields are integer EUR cents.

Cache: Redis, 24h.

---

## Search Module

### Part Number Search

**`GET /search?q={query}`** `[PUBLIC]`

Normalises the query and searches the TecDoc catalogue. Query param `vehicleId` (optional) adds fit indicator.

Response `200` — single exact match:
```json
{ "redirect": "/catalog/articles/WL6340" }
```

Response `200` — multiple matches:
```json
{
  "query": "WL6340",
  "normalisedQuery": "WL6340",
  "results": [
    {
      "articleNumber": "WL6340",
      "brandName": "WIX",
      "description": "Oil Filter",
      "available": true,
      "bestPriceIncVat": 1500,
      "fitsVehicle": true
    }
  ]
}
```

Response `200` — no matches:
```json
{ "query": "XXXX999", "normalisedQuery": "XXXX999", "results": [] }
```

---

### Autocomplete

**`GET /search/autocomplete?q={query}`** `[PUBLIC]`

Returns up to 8 suggestions for queries of 3+ characters.

Response `200`:
```json
[
  { "articleNumber": "WL6340", "brandName": "WIX", "description": "Oil Filter" },
  { "articleNumber": "WL6341", "brandName": "WIX", "description": "Oil Filter Heavy Duty" }
]
```
Cache: Redis, 30 min.

---

## Inventory Module

### Availability Check

**`GET /inventory/articles/:articleNumber/availability`** (Protected)

Fresh availability and pricing for a single article. Used by the cart refresh and pre-checkout check.

Response `200`:
```json
{
  "articleNumber": "WL6340",
  "available": true,
  "stockStatus": "IN_STOCK",
  "estimatedDeliveryDays": 1,
  "priceExVat": 1250,
  "priceIncVat": 1500
}
```

This endpoint always calls the backoffice live — no Redis cache. Used in the pre-checkout validation loop.

---

## Cart Module

> **Anonymous cart note**: Anonymous visitors manage their cart entirely client-side (browser localStorage via Zustand). These API endpoints are only called for **logged-in users**. When an anonymous visitor logs in, the frontend reads the local cart and calls `POST /cart/items` for each item to merge it into the server-side account cart, then clears local storage. All cart endpoints therefore remain `(Protected)`.

### Get Active Cart

**`GET /cart`** (Protected)

Returns the customer's active cart with current prices refreshed.

Response `200`:
```json
{
  "id": "cart-uuid",
  "items": [
    {
      "articleNumber": "WL6340",
      "brandName": "WIX",
      "description": "Oil Filter",
      "thumbnailUrl": "https://cdn.example.com/img/WL6340.jpg",
      "quantity": 2,
      "unitPriceExVat": 1250,
      "unitPriceIncVat": 1500,
      "lineTotalIncVat": 3000,
      "available": true
    }
  ],
  "subtotalExVat": 2500,
  "vatAmount": 500,
  "totalIncVat": 3000,
  "itemCount": 2
}
```

---

### Add Item to Cart

**`POST /cart/items`** (Protected)

Request body:
```json
{ "articleNumber": "WL6340", "quantity": 2 }
```

Response `200`: updated cart (same shape as `GET /cart`)

Errors: `404 ARTICLE_NOT_FOUND`, `422 ARTICLE_UNAVAILABLE`

---

### Update Cart Item Quantity

**`PATCH /cart/items/:articleNumber`** (Protected)

Request body: `{ "quantity": 3 }`

Response `200`: updated cart

Errors: `404 CART_ITEM_NOT_FOUND`, `422 QUANTITY_EXCEEDS_STOCK`

---

### Remove Cart Item

**`DELETE /cart/items/:articleNumber`** (Protected)

Response `200`: updated cart

---

### Validate Cart (Pre-Checkout)

**`POST /cart/validate`** (Protected)

Performs a live availability check on every item in the cart. Returns which items (if any) are no longer available or have changed price.

Response `200`:
```json
{
  "valid": true,
  "changedItems": [],
  "unavailableItems": []
}
```

Response `200` (with issues):
```json
{
  "valid": false,
  "changedItems": [
    {
      "articleNumber": "WL6340",
      "oldPriceIncVat": 1500,
      "newPriceIncVat": 1650,
      "difference": 150
    }
  ],
  "unavailableItems": [
    { "articleNumber": "OC123", "description": "Oil Filter MANN" }
  ]
}
```

---

### Save Cart (Mechanic only)

**`POST /cart/save`** (Protected, `MECHANIC` role)

Request body: `{ "name": "Job — Lada Niva, July service" }`

Response `201`: `{ "savedCartId": "uuid", "name": "Job — ..." }`

---

### List Saved Carts (Mechanic only)

**`GET /cart/saved`** (Protected, `MECHANIC` role)

Response `200`:
```json
[
  { "id": "uuid", "name": "Job — Lada Niva, July service", "itemCount": 4, "updatedAt": "..." }
]
```

---

## Checkout & Orders Module

### Pre-Payment Confirmation

**`POST /orders/checkout/confirm`** (Protected)

Final live-price check immediately before payment is initiated. MUST be called immediately before creating a payment intent. Uses the exact same live backoffice call as `/cart/validate` but is a separate endpoint to make the call site explicit and auditable.

Request body: `{ "cartId": "uuid" }`

Response `200`:
```json
{
  "confirmed": true,
  "confirmedItems": [
    { "articleNumber": "WL6340", "confirmedPriceExVat": 1250, "quantity": 2 }
  ],
  "subtotalExVat": 2500,
  "vatAmount": 500,
  "totalIncVat": 3000
}
```

Response `422 PRICE_CHANGED` or `422 ARTICLE_UNAVAILABLE` if anything has changed since the last cart validate.

---

### Create Order (Post-Payment)

**`POST /orders`** (Protected)

Called after payment is confirmed (Stripe webhook or myPOS IPN has been processed). Creates the order record and publishes `OrderPlaced` to SQS.

Request body:
```json
{
  "cartId": "uuid",
  "addressId": "uuid",
  "shippingMethod": "ECONT",
  "paymentMethod": "STRIPE",
  "paymentReference": "pi_abc123",
  "vehicleTag": "CB1234AB",
  "jobReference": "Golf service Jul-2026"
}
```

Response `201`:
```json
{
  "orderId": "uuid",
  "orderReference": "VP-20260605-00001",
  "status": "PROCESSING"
}
```

---

### Order History

**`GET /orders`** (Protected)

Query params: `page` (default 1), `pageSize` (default 20)
Mechanic additional params: `vehicleTag`, `jobReference` (filter)

Response `200`:
```json
{
  "total": 5,
  "orders": [
    {
      "orderId": "uuid",
      "orderReference": "VP-20260605-00001",
      "createdAt": "2026-06-05T10:00:00Z",
      "itemCount": 3,
      "totalIncVat": 8500,
      "status": "ON_THE_WAY"
    }
  ]
}
```

---

### Order Detail

**`GET /orders/:orderId`** (Protected)

Response `200`:
```json
{
  "orderId": "uuid",
  "orderReference": "VP-20260605-00001",
  "status": "ON_THE_WAY",
  "createdAt": "2026-06-05T10:00:00Z",
  "items": [
    {
      "articleNumber": "WL6340",
      "brandName": "WIX",
      "description": "Oil Filter",
      "quantity": 2,
      "unitPriceIncVat": 1500,
      "lineTotalIncVat": 3000
    }
  ],
  "deliveryAddress": { "fullName": "Ivan Petrov", "city": "Sofia", "..." : "..." },
  "shippingMethod": "ECONT",
  "shippingCostIncVat": 600,
  "subtotalExVat": 6500,
  "vatAmount": 1300,
  "totalIncVat": 8400,
  "paymentMethod": "STRIPE",
  "courierName": "Econt",
  "trackingReference": "1234567890",
  "vehicleTag": "CB1234AB",
  "jobReference": "Golf service Jul-2026",
  "statusHistory": [
    { "status": "PROCESSING", "occurredAt": "2026-06-05T10:00:00Z" },
    { "status": "ON_THE_WAY", "occurredAt": "2026-06-06T09:15:00Z" }
  ]
}
```

Errors: `404 ORDER_NOT_FOUND` if the order doesn't belong to the requesting customer.

---

### Order Status SSE Stream

**`GET /orders/:orderId/status`** (Protected)

Server-Sent Events stream. Emits a message whenever the order status changes.

Event format:
```
data: {"orderId":"uuid","status":"ITEMS_PREPARED","occurredAt":"2026-06-05T14:30:00Z"}
```

The stream is held open until the order reaches a terminal state (`DELIVERED`, `CANCELLED`, `FULFILLMENT_FAILED`) or the client disconnects.

---

### Cancel Order Request

**`POST /orders/:orderId/cancel`** (Protected)

Only available for orders in `PROCESSING` status.

Response `202`: `{ "message": "Cancellation request received. You will be notified by email." }`

Errors: `409 ORDER_CANNOT_BE_CANCELLED` if status is not `PROCESSING`.

---

## Payments Module

### Stripe — Create Payment Intent

**`POST /payments/stripe/intent`** (Protected)

Request body: `{ "cartId": "uuid", "confirmedTotal": 8400 }`

Response `200`: `{ "clientSecret": "pi_abc123_secret_xyz" }`

---

### Stripe Webhook

**`POST /payments/stripe/webhook`** `[PUBLIC]`

Stripe-signed webhook. Verifies `Stripe-Signature` header. On `payment_intent.succeeded`, triggers order creation and `OrderPlaced` SQS event. Returns `200` immediately.

---

### myPOS — Initiate Payment

**`POST /payments/mypos/initiate`** (Protected)

NestJS calls the myPOS Checkout API server-side and returns the hosted payment URL to the frontend.

Request body: `{ "cartId": "uuid", "confirmedTotal": 8400 }`

Response `200`:
```json
{
  "checkoutUrl": "https://checkout.mypos.com/pay/session_abc123"
}
```

Frontend redirects the customer's browser to `checkoutUrl`. The myPOS hosted page handles card entry and 3DS authentication.

---

### myPOS — IPN (Instant Payment Notification)

**`POST /payments/mypos/ipn`** `[PUBLIC]`

myPOS calls this endpoint server-to-server after payment completes (success or failure). NestJS verifies the HMAC-SHA256 signature using the merchant secret key. On success, triggers order creation and `OrderPlaced` SQS event. Returns `200` to myPOS.

Note: The customer's browser is separately redirected to the success/cancel return URL configured at checkout initiation — the IPN and the browser redirect are independent flows.

---

### COD — Confirm Order

**`POST /payments/cod/confirm`** (Protected)

Creates a COD order directly (no payment gateway). Only allowed when order total ≤ `COD_MAX_ORDER_TOTAL_CENTS` (configured threshold, default 20000 = €200.00).

Request body: `{ "cartId": "uuid", "addressId": "uuid", "shippingMethod": "SPEEDY" }`

Response `201`: `{ "orderId": "uuid", "orderReference": "VP-20260605-00001" }`

Errors: `422 COD_THRESHOLD_EXCEEDED`

---

## Clerk Webhook

### Clerk User Event

**`POST /webhooks/clerk`** `[PUBLIC — Clerk signature required]`

Receives lifecycle events from Clerk. Verifies the `svix-id`, `svix-timestamp`, and `svix-signature` headers using the `CLERK_WEBHOOK_SECRET` environment variable via the `svix` library.

**Handled events**:
- `user.created` — creates a `Customer` record in Postgres (`clerkId`, `email`, `firstName`, `lastName`; `phoneNumber` left blank until onboarding step)
- `user.updated` — syncs `email`, `firstName`, `lastName` changes from Clerk to Postgres

Response `200`: `{ "received": true }`

Returns `400` if signature verification fails.

---

## Customers Module

### Get Current Customer

**`GET /customers/me`** (Protected)

**`GET /customers/me`** (Protected)

Response `200`: Customer profile + mechanic profile status if applicable.

---

### Update Profile

**`PATCH /customers/me`** (Protected)

Request body: subset of `{ firstName, lastName, phoneNumber }`.

Response `200`: updated profile.

---

### Addresses

**`GET /customers/me/addresses`** — list saved addresses

**`POST /customers/me/addresses`** — add address

**`PATCH /customers/me/addresses/:id`** — update address

**`DELETE /customers/me/addresses/:id`** — delete address

---

### Mechanic Application

**`POST /customers/mechanic-application`** (Protected)

Request body:
```json
{
  "businessName": "AutoService Petrov",
  "eik": "123456789",
  "vatNumber": "BG123456789",
  "businessAddress": "ul. Industrialna 5, Sofia 1000",
  "businessPhone": "+35929123456"
}
```

Response `201`: `{ "status": "PENDING", "message": "Application submitted. You will be notified by email." }`

Errors: `409 MECHANIC_APPLICATION_ALREADY_EXISTS`

---

### Saved Vehicles (Mechanic only)

**`GET /customers/me/saved-vehicles`** — list (max 10)

**`POST /customers/me/saved-vehicles`** — save vehicle
Request: `{ "tecdocVehicleId": "V10042", "manufacturer": "VW", "modelSeries": "Golf VII", "variant": "2.0 TDI 110kW" }`

**`DELETE /customers/me/saved-vehicles/:id`** — remove

---

## Shipping Module

### Calculate Shipping Rate

**`GET /shipping/rates`** `[PUBLIC]`

Query params: `method` (`ECONT` or `SPEEDY`), `city`, `postcode`, `weightGrams`

Response `200`:
```json
{
  "method": "ECONT",
  "costIncVat": 6.00,
  "estimatedDeliveryDays": 1
}
```

---

## Configuration Module

### Checkout Config

**`GET /config/checkout`** `[PUBLIC]`

Returns runtime configuration values the frontend needs at checkout.

Response `200`:
```json
{
  "codMaxOrderTotal": 20000,
  "vatRate": 0.20
}
```

---

## Internal Endpoints (called by Spring Boot backoffice — not exposed to browser)

### Approve Mechanic

**`POST /internal/mechanic-approve/:customerId`** (Service-to-service: `InternalGuard` — shared-secret bearer token, private network only)

Called by the backoffice when the operator approves a mechanic application.

Request body: `{ "approvedBy": "operator-id" }`

Response `200`: `{ "success": true }`

---

### Reject Mechanic

**`POST /internal/mechanic-reject/:customerId`** (Service-to-service: `InternalGuard` — shared-secret bearer token, private network only)

Request body: `{ "rejectedBy": "operator-id", "reason": "EIK could not be verified" }`

Response `200`: `{ "success": true }`

---

## Error Codes (`AppErrorCode` enum in `packages/shared/src/errors.ts`)

| Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Input failed Zod/DTO validation |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Authenticated but insufficient role |
| `ARTICLE_NOT_FOUND` | 404 | Article number not in TecDoc catalogue |
| `ARTICLE_UNAVAILABLE` | 422 | Article has no stock at checkout |
| `PRICE_CHANGED` | 422 | Price changed since cart was built |
| `ORDER_NOT_FOUND` | 404 | Order doesn't exist or belongs to another customer |
| `ORDER_CANNOT_BE_CANCELLED` | 409 | Order is past the cancellation window |
| `CART_ITEM_NOT_FOUND` | 404 | Item not in cart |
| `QUANTITY_EXCEEDS_STOCK` | 422 | Requested quantity exceeds available stock |
| `EMAIL_ALREADY_EXISTS` | 409 | Email is already registered |
| `MECHANIC_APPLICATION_ALREADY_EXISTS` | 409 | Customer already has a pending/approved application |
| `COD_THRESHOLD_EXCEEDED` | 422 | Order total too high for cash on delivery |
| `BACKOFFICE_UNAVAILABLE` | 503 | Live backoffice check could not complete — checkout blocked |
| `PAYMENT_FAILED` | 402 | Payment gateway declined or returned error |
