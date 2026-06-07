# Data Model: Autoparts Shop

**Branch**: `002-autoparts-shop-spec` | **Date**: 2026-06-05

Schema: `shop` — owned by NestJS, managed by Prisma migrations. The `backoffice` schema is owned by Spring Boot and is read-only from NestJS (`shop_app` has `SELECT` on `backoffice.nomenclature` only; no access to `supplier_stock`).

---

## Entity Relationship Overview

```
Customer ─── has one ──► MechanicProfile   (optional, one mechanic per customer)
Customer ─── has many ──► Address
Customer ─── has many ──► Cart             (one active + named saved carts for mechanics)
Customer ─── has many ──► Order
Customer ─── has many ──► SavedVehicle     (mechanic feature, up to 10)

Cart ─── has many ──► CartItem

Order ─── belongs to ──► Address           (snapshot at time of order)
Order ─── has many ──► OrderItem
Order ─── has many ──► OrderStatusHistory

[TecDoc data is not stored in Postgres at launch — Redis-cached only]
```

---

## Entities

### Customer

The registered user of the shop. Role determines pricing context and available features.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | Internal identifier |
| `clerkId` | String | UNIQUE NOT NULL | Clerk user ID — used to correlate JWT `sub` claim |
| `email` | String | UNIQUE NOT NULL | Primary contact and login identifier |
| `firstName` | String | NOT NULL | |
| `lastName` | String | NOT NULL | |
| `phoneNumber` | String | NOT NULL | Bulgarian mobile or fixed-line |
| `role` | CustomerRole enum | NOT NULL, default CUSTOMER | `CUSTOMER` or `MECHANIC` |
| `createdAt` | Timestamp | NOT NULL | |
| `updatedAt` | Timestamp | NOT NULL | |

**Indexes**: `clerkId` (unique), `email` (unique)

**Validation rules** (Zod schema in `packages/shared`):
- `email`: valid email format
- `phoneNumber`: Bulgarian format — E.164 or local Bulgarian mobile/fixed (starts with `0` or `+359`)
- `firstName`, `lastName`: 1–100 characters, no digits

---

### MechanicProfile

Trade account application details for a customer. One per customer, created on application submission.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `customerId` | UUID | UNIQUE FK → Customer | One profile per customer |
| `businessName` | String | NOT NULL | Workshop or company name |
| `eik` | String | UNIQUE NOT NULL | Bulgarian UIC/EIK (9 or 13 digits) |
| `vatNumber` | String | NULL | Bulgarian VAT number — `BG` + 9 or 13 digits |
| `businessAddress` | String | NOT NULL | Full business address as free text |
| `businessPhone` | String | NOT NULL | Business contact number |
| `status` | MechanicApprovalStatus enum | NOT NULL, default PENDING | `PENDING`, `APPROVED`, `REJECTED` |
| `rejectionReason` | String | NULL | Populated by operator on rejection |
| `appliedAt` | Timestamp | NOT NULL | |
| `reviewedAt` | Timestamp | NULL | Set when operator acts |

**State transitions**: `PENDING → APPROVED` or `PENDING → REJECTED`

**Business rule**: When status transitions to `APPROVED`, the Customer's `role` is updated to `MECHANIC` in Postgres **and** the Clerk Backend API is called to set `publicMetadata.role = 'MECHANIC'` on the Clerk user. The mechanic's next Clerk session will carry the role in JWT claims.

---

### Address

A delivery address saved by a customer. Snapshot is taken into `Order.deliverySnapshot` at order creation so address changes do not affect historical orders.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `customerId` | UUID | FK → Customer | |
| `fullName` | String | NOT NULL | Recipient name |
| `city` | String | NOT NULL | Bulgarian city/town |
| `postcode` | String | NOT NULL | 4-digit Bulgarian postcode |
| `street` | String | NOT NULL | Street name |
| `streetNumber` | String | NOT NULL | Street number |
| `apartment` | String | NULL | Optional apartment/floor |
| `phoneNumber` | String | NOT NULL | Recipient contact for courier |
| `isDefault` | Boolean | NOT NULL, default false | Pre-filled at checkout |
| `createdAt` | Timestamp | NOT NULL | |
| `updatedAt` | Timestamp | NOT NULL | |

**Indexes**: `customerId`

**Validation rules**:
- `postcode`: exactly 4 digits (`\d{4}`)
- `streetNumber`: alphanumeric, 1–10 characters

---

### Cart

A collection of items for a customer. Active cart: `name IS NULL`. Named saved cart (mechanic feature): `name IS NOT NULL`. Each customer has at most one active cart at a time.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `customerId` | UUID | FK → Customer | |
| `name` | String | NULL | NULL = active cart; non-null = saved mechanic cart |
| `createdAt` | Timestamp | NOT NULL | |
| `updatedAt` | Timestamp | NOT NULL | |

**Indexes**: `customerId`

**Business rule**: When a mechanic activates a saved cart, any existing active cart items are merged (quantity summed for duplicates).

---

### CartItem

One article in a cart with its captured price at time of addition.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `cartId` | UUID | FK → Cart, CASCADE DELETE | |
| `articleNumber` | String | NOT NULL | Normalised TecDoc article number |
| `brandName` | String | NOT NULL | Brand at time of addition |
| `description` | String | NOT NULL | Short description for display |
| `quantity` | Int | NOT NULL, > 0 | |
| `unitPriceCaptured` | Int | NOT NULL | Price at time of add in EUR cents — display only; pre-checkout re-validates live price |

**Unique constraint**: `(cartId, articleNumber)` — only one line per article per cart

**Indexes**: `cartId`

**Business rule**: `unitPriceCaptured` is for display only. The pre-checkout confirmation always fetches a fresh price from the backoffice. If price has changed, the customer is shown the difference.

---

### Order

A confirmed purchase. Created atomically with payment confirmation. Status transitions are driven exclusively by SQS `fulfillment-events` from the backoffice.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | Internal ID |
| `orderReference` | String | UNIQUE NOT NULL | Human-readable ref, e.g. `VP-20260605-00001` |
| `customerId` | UUID | FK → Customer | |
| `deliverySnapshot` | JSON | NOT NULL | Full address captured at order time (immutable) |
| `status` | OrderStatus enum | NOT NULL, default PROCESSING | See state machine below |
| `shippingMethod` | ShippingMethod enum | NOT NULL | `ECONT` or `SPEEDY` |
| `shippingCost` | Int | NOT NULL | EUR cents |
| `subtotal` | Int | NOT NULL | Items total ex-VAT, EUR cents — exact integer sum of line totals |
| `vatAmount` | Int | NOT NULL | `Math.round(subtotal * 0.20)` — rounding applied exactly once here |
| `total` | Int | NOT NULL | `subtotal + vatAmount + shippingCost` — exact integer sum |
| `paymentMethod` | PaymentMethod enum | NOT NULL | `STRIPE`, `MYPOS`, `CASH_ON_DELIVERY` |
| `paymentReference` | String | NULL | Stripe PaymentIntent ID or myPOS order/session reference |
| `courierName` | String | NULL | Set on `OrderShipped` event |
| `trackingReference` | String | NULL | Set on `OrderShipped` event |
| `vehicleTag` | String | NULL | Mechanic: vehicle registration for this job |
| `jobReference` | String | NULL | Mechanic: free-text job reference |
| `createdAt` | Timestamp | NOT NULL | |
| `updatedAt` | Timestamp | NOT NULL | |

**Indexes**: `customerId`, `status`, `orderReference` (unique), `createdAt` (for daily summary queries)

**Order reference format**: `VP-{YYYYMMDD}-{5-digit-sequence}` — generated by NestJS at order creation.

**State machine**:
```
PROCESSING → ITEMS_PREPARED → ON_THE_WAY → DELIVERED
     └──────────────────────────────────► CANCELLED
     └──────────────────────────────────► FULFILLMENT_FAILED
```

**Invariants** (enforced in `Order` aggregate):
- Only `PROCESSING` → `CANCELLED` is allowed as a customer-initiated transition
- `ITEMS_PREPARED`, `ON_THE_WAY`, `DELIVERED` transitions are only accepted from SQS events
- `FULFILLMENT_FAILED` is set by the SQS consumer if the backoffice publishes a failure event
- Once in `DELIVERED`, `CANCELLED`, or `FULFILLMENT_FAILED`, no further transitions are allowed

**`deliverySnapshot` shape** (JSON):
```json
{
  "fullName": "Ivan Petrov",
  "city": "Sofia",
  "postcode": "1000",
  "street": "bul. Vitosha",
  "streetNumber": "42",
  "apartment": "ap. 3",
  "phoneNumber": "+359887123456"
}
```

---

### OrderItem

One article line within an order. Prices are confirmed (post-live-check) values.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `orderId` | UUID | FK → Order | |
| `articleNumber` | String | NOT NULL | Normalised |
| `brandName` | String | NOT NULL | |
| `description` | String | NOT NULL | |
| `quantity` | Int | NOT NULL, > 0 | |
| `unitPrice` | Int | NOT NULL | Confirmed live price ex-VAT, EUR cents |
| `lineTotal` | Int | NOT NULL | `unitPrice × quantity` — exact integer, no rounding |

**Indexes**: `orderId`

---

### OrderStatusHistory

Append-only log of every status transition for an order. Used to render the timeline on the order detail page.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `orderId` | UUID | FK → Order | |
| `status` | OrderStatus enum | NOT NULL | The status reached |
| `occurredAt` | Timestamp | NOT NULL | When this status was set |
| `source` | String | NOT NULL | `PAYMENT_CONFIRMED`, `SQS_EVENT`, `OPERATOR_ACTION`, `CUSTOMER_CANCEL` |

**Indexes**: `orderId`

---

### SavedVehicle

A vehicle saved to a mechanic's account for quick re-selection. Maximum 10 per customer (enforced at service layer).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `customerId` | UUID | FK → Customer | |
| `tecdocVehicleId` | String | NOT NULL | TecDoc linkage target ID |
| `manufacturer` | String | NOT NULL | Display name, e.g. "Volkswagen" |
| `modelSeries` | String | NOT NULL | Display name, e.g. "Golf VI" |
| `variant` | String | NOT NULL | Display name, e.g. "2.0 TDI 140hp (2008–2013)" |
| `addedAt` | Timestamp | NOT NULL | |

**Unique constraint**: `(customerId, tecdocVehicleId)`

**Indexes**: `customerId`

---

## Enums (defined in `packages/shared/src/enums.ts`)

```typescript
export enum CustomerRole {
  CUSTOMER = 'CUSTOMER',
  MECHANIC = 'MECHANIC',
}

export enum MechanicApprovalStatus {
  PENDING  = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum OrderStatus {
  PROCESSING          = 'PROCESSING',
  ITEMS_PREPARED      = 'ITEMS_PREPARED',
  ON_THE_WAY          = 'ON_THE_WAY',
  DELIVERED           = 'DELIVERED',
  CANCELLED           = 'CANCELLED',
  FULFILLMENT_FAILED  = 'FULFILLMENT_FAILED',
}

export enum ShippingMethod {
  ECONT  = 'ECONT',
  SPEEDY = 'SPEEDY',
}

export enum PaymentMethod {
  STRIPE           = 'STRIPE',
  MYPOS            = 'MYPOS',
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
}

export enum MechanicApprovalStatus {
  PENDING  = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}
```

---

## Value Objects (defined in `packages/shared/src/types/`)

### `Money`
```typescript
// Integer cents (EUR). 1299 = €12.99. Never a float, never a decimal string.
interface Money {
  cents: number;     // integer only — validated at construction
  currency: 'EUR';
}
```

### `ArticleNumber`
```typescript
// Normalised part number — output of the normaliser pipeline
// Always uppercase, no hyphens, no spaces, no brand tokens
type ArticleNumber = string & { readonly _brand: 'ArticleNumber' };
```

### `VehicleId`
```typescript
// TecDoc linkage target ID
type VehicleId = string & { readonly _brand: 'VehicleId' };
```

---

## `PriceCalculator` Domain Service

Location: `apps/api/src/common/price-calculator.ts`

The only place in the codebase where order totals and VAT amounts are computed.

```typescript
class PriceCalculator {
  // Returns exact integer: unitPrice * quantity (no rounding)
  lineTotal(unitPriceCents: number, quantity: number): number

  // Returns exact integer sum of all line totals (no rounding)
  subtotal(lines: Array<{ unitPriceCents: number; quantity: number }>): number

  // Rounding applied exactly once: Math.round(subtotal * 0.20)
  vatAmount(subtotalCents: number, vatRate: number): number

  // Exact integer sum: subtotal + vatAmount + shippingCents
  orderTotal(subtotalCents: number, vatAmountCents: number, shippingCents: number): number
}
```

**100% unit test coverage is mandatory** (Constitution IX). Required test cases include:
- `lineTotal(1, 1)` → `1` (1 cent, no rounding)
- `vatAmount(1000, 0.20)` → `200` (exact, no rounding needed)
- `vatAmount(999, 0.20)` → `200` (Math.round(199.8) = 200 — round half up)
- `vatAmount(995, 0.20)` → `199` (Math.round(199.0) = 199)
- Multi-item orders where per-line vs aggregate rounding would diverge

---

## Read-only Backoffice Cross-Schema Access

NestJS (`shop_app` Postgres user) has `SELECT` on `backoffice.nomenclature` only — for potential article metadata reads. All pricing and availability data is obtained via the internal REST API, not direct SQL.

The backoffice (`backoffice_app`) has:
- `SELECT` on `shop.orders` and `shop.customers` (for reporting/CRM)
- `UPDATE` on `shop.orders` — exclusively for setting `status` via fulfillment event processing in the backoffice. This is the only cross-schema write and is protected by Postgres row-level logic.

These permissions are enforced at the Postgres role level, not by application convention alone.

---

## Indexes Summary

| Table | Index | Reason |
|---|---|---|
| `Customer` | `email` (unique) | Login lookup |
| `Customer` | `clerkId` (unique) | JWT `sub` claim resolution |
| `Cart` | `customerId` | Active cart fetch |
| `CartItem` | `cartId` | Cart item fetch |
| `Order` | `customerId` | Order history |
| `Order` | `status` | Fulfilment dashboard queries |
| `Order` | `createdAt` | Daily summary aggregations |
| `OrderItem` | `orderId` | Order detail fetch |
| `OrderStatusHistory` | `orderId` | Timeline render |
| `SavedVehicle` | `customerId` | Mechanic vehicle list |
| `MechanicProfile` | `eik` (unique) | Duplicate application prevention |
