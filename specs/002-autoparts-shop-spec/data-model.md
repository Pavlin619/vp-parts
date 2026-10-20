# Data Model: Autoparts Shop

**Branch**: `002-autoparts-shop-spec` | **Date**: 2026-06-05

Schema: `shop` — owned by NestJS, managed by Prisma migrations. The backoffice's `public` schema is owned by Spring Boot and is read-only from NestJS: `shop_app` has column-scoped `SELECT` on `public.autoparts` (our own stock — the primary price/availability source, no cost/internal columns) and `public.supplier_stock` (the fallback source, including `buy_price`), plus `SELECT` on `public.nomenclature`. These backoffice tables are not modelled in Prisma; the inventory module reads them with read-only raw queries.

---

## Entity Relationship Overview

```
Customer ─── has one ──► MechanicProfile   (optional, one mechanic per customer)
Customer ─── has many ──► Address
Customer ─── has many ──► Cart             (one active + named saved carts for mechanics)
Customer ─── has many ──► Order
Customer ─── has many ──► SavedVehicle     (mechanic feature, up to 10)

Cart ─── has many ──► CartItem

Order ─── belongs to ──► Cart              (the cart it was placed from; destination snapshotted)
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

A collection of items belonging to a guest (`token`) or a customer
(`customerId`) — never both. Everyone gets one from their first add; it is
minted on a write, never on a read. See `docs/CART.md`.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `token` | String | UNIQUE, NULL | Guest owner. Cleared once a customer claims the cart |
| `customerId` | UUID | FK → Customer, NULL | |
| `status` | Enum | NOT NULL, default ACTIVE | `ACTIVE` \| `MERGED` \| `ORDERED` |
| `version` | Int | NOT NULL, default 0 | Raised by every mutation; checkout pins it |
| `mergedIntoId` | UUID | NULL | Where this cart's lines went |
| `orderId` | UUID | UNIQUE, NULL | The order placed from this cart |
| `expiresAt` | Timestamp | NOT NULL | Pushed 30 days out on every touch |
| `createdAt` | Timestamp | NOT NULL | |
| `updatedAt` | Timestamp | NOT NULL | |

**Indexes**: `(customerId, status)`, `expiresAt`, unique on `token`, unique on `orderId`

**Partial unique index**: `(customerId) WHERE status = 'ACTIVE' AND customerId IS NOT NULL` — a customer has at most one cart they are filling, while keeping every cart they have merged away or ordered from. Prisma cannot express a `WHERE` on an index, so it is written out by hand in the migration.

**Business rules**:
- A cart is **never deleted once ordered from**: it is the record of what was bought, and `orderId` being unique is what makes a retried payment webhook idempotent.
- Guest carts (`customerId IS NULL`) are swept once `expiresAt` passes. Customer carts do not expire.
- Merging sets the source cart to `MERGED` and releases its token.

---

### CartItem

One article in a cart. Intent and a catalogue snapshot — no price that is ever displayed.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `cartId` | UUID | FK → Cart, CASCADE DELETE | |
| `brandId` | String | NOT NULL | TecDoc `dataSupplierId` — half of the identity |
| `articleNumber` | String | NOT NULL | The other half |
| `brandName` | String | NOT NULL | Brand at time of addition |
| `brandLogoUrl` | String | NULL | |
| `description` | String | NOT NULL | Short description for display |
| `thumbnailUrl` | String | NULL | |
| `quantity` | Int | NOT NULL, 1–99 | |
| `isSelected` | Bool | NOT NULL, default true | Whether this line is to be ordered |
| `addedAtPriceIncVat` | Int | NULL | Inc-VAT cents when the line was added |
| `addedAt` | Timestamp | NOT NULL | |
| `updatedAt` | Timestamp | NOT NULL | |

**Unique constraint**: `(cartId, brandId, articleNumber)` — one line per *part*, not per number. Two data suppliers file the same number for different parts, so keying on the number alone merges one company's part into the other's line.

**Indexes**: `cartId`

**Business rules**:
- A cart holds at most 50 distinct lines (`MAX_CART_LINES`), because the whole cart is priced by one availability batch and that endpoint refuses more. Raising an existing line is always allowed.
- `addedAtPriceIncVat` is **never rendered as the price**. It exists so the cart can say the price has moved since the part went in; the price shown is always the live one.
- Nothing else about money or stock is stored. The pre-checkout confirmation reads both live and fails closed.

---

### Order

A placed order. Cash on delivery creates it directly (`docs/ORDERS.md`). Status transitions after `PROCESSING` are driven by SQS `fulfillment-events` from the backoffice. Every amount is EUR cents **including VAT**, frozen when the order is placed.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | Internal ID |
| `orderReference` | String | UNIQUE NOT NULL | `VP-ORD-000123`, numbered from the `order_reference_seq` sequence |
| `customerId` | UUID | FK → Customer, NULL | Null for a guest's quick order |
| `cartId` | UUID | FK → Cart, UNIQUE, NULL | The cart it was placed from; one cart never produces two orders |
| `status` | OrderStatus enum | NOT NULL, default PROCESSING | `AWAITING_CONFIRMATION` for a guest's quick order. See state machine below |
| `deliveryMethod` | DeliveryMethod enum | NOT NULL | `COURIER_OFFICE`, `COURIER_ADDRESS`, `STORE_PICKUP` |
| `carrier` | ShippingMethod enum | NULL | Chosen at checkout; null for store pickup |
| `deliverySnapshot` | JSON | NOT NULL | The destination as chosen (immutable), shape below |
| `expectedDeliveryDate` | Date | NULL | As quoted |
| `parcelWeightGrams` | Int | NULL | As quoted; null for store pickup |
| `goodsTotal` | Int | NOT NULL | Σ gross unit price × quantity |
| `deliveryPrice` | Int | NOT NULL | The carrier's quote; 0 for store pickup |
| `cashOnDeliveryFee` | Int | NOT NULL | The carrier's fee for collecting; 0 when not cash on delivery |
| `total` | Int | NOT NULL | `goodsTotal + deliveryPrice + cashOnDeliveryFee`, exact |
| `vatAmount` | Int | NOT NULL | The VAT in `total`, worked out once by `orderMoney`; net is `total − vatAmount` |
| `paymentMethod` | PaymentMethod enum | NOT NULL | `CASH_ON_DELIVERY` (card later) |
| `paymentReference` | String | NULL | The card payment's reference, later |
| `contactFirstName`, `contactLastName`, `contactPhone` | String | NOT NULL | Copied from the profile at order time, or as the guest gave them |
| `contactEmail` | String | NULL | Null when a guest ordered without one |
| `termsVersion` | String | NOT NULL | The terms the customer ordered under |
| `trackingReference` | String | NULL | Set on `OrderShipped` event |
| `vehicleTag` | String | NULL | Mechanic: vehicle registration for this job |
| `jobReference` | String | NULL | Mechanic: free-text job reference |
| `createdAt` | Timestamp | NOT NULL | |
| `updatedAt` | Timestamp | NOT NULL | |

**Indexes**: `customerId`, `status`, `orderReference` (unique), `cartId` (unique), `createdAt` (for daily summary queries)

**State machine**:
```
AWAITING_CONFIRMATION ─(call confirmed)─► PROCESSING
     └──────────────────────────────────► CANCELLED
PROCESSING → ITEMS_PREPARED → ON_THE_WAY → DELIVERED
     └──────────────────────────────────► CANCELLED
     └──────────────────────────────────► FULFILLMENT_FAILED
```

**Invariants** (enforced in `Order` aggregate):
- Only `PROCESSING` → `CANCELLED` is allowed as a customer-initiated transition
- `ITEMS_PREPARED`, `ON_THE_WAY`, `DELIVERED` transitions are only accepted from SQS events
- `FULFILLMENT_FAILED` is set by the SQS consumer if the backoffice publishes a failure event
- Once in `DELIVERED`, `CANCELLED`, or `FULFILLMENT_FAILED`, no further transitions are allowed

**`deliverySnapshot` shape** (JSON), by `deliveryMethod`:
```jsonc
// COURIER_OFFICE
{ "office": { "code": "1127", "name": "София, Изток", "address": "…" } }
// COURIER_ADDRESS: DeliveryAddressDto, named as well as located
{ "address": { "placeId": "41", "city": "София", "postCode": "1000", "street": "бул. Витоша", "streetNumber": "42", "note": "…" } }
// STORE_PICKUP
{}
```

---

### OrderItem

One article line within an order, at the live price the order was placed at.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `orderId` | UUID | FK → Order | |
| `brandId` | String | NOT NULL | TecDoc `dataSupplierId`, the other half of the article's identity |
| `articleNumber` | String | NOT NULL | |
| `brandName` | String | NOT NULL | |
| `description` | String | NOT NULL | |
| `quantity` | Int | NOT NULL, > 0 | |
| `unitPrice` | Int | NOT NULL | Live gross price including VAT, EUR cents |
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
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
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

export enum DeliveryMethod {
  COURIER_OFFICE  = 'COURIER_OFFICE',
  COURIER_ADDRESS = 'COURIER_ADDRESS',
  STORE_PICKUP    = 'STORE_PICKUP',
}

export enum PaymentMethod {
  CARD             = 'CARD',
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

## Order money: `orderMoney` in `apps/api/src/checkout/order-money.ts`

The only place in the codebase where order totals and VAT amounts are computed,
used to price and store an order and to answer the cart totals and the delivery
quote, whose figures the web shows as they come. A pure function; every amount is EUR cents **including VAT**, because the shop's
prices are the backoffice's gross prices.

```
goods      = Σ (gross unit price × quantity)        exact
total      = goods + deliveryPrice + cashOnDeliveryFee   exact
vatAmount  = total − Math.round(total / (1 + VAT_RATE))  the one rounding
```

**100% unit test coverage is mandatory** (Constitution IX), including a 1-cent
total, totals whose VAT lands on `.5`, and multi-line orders where per-line rounding
would diverge from rounding the total. Rationale in `docs/ORDERS.md` → "Money".

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
