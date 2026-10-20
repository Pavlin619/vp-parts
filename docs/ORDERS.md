# Orders: placing one, and what happens after

The authoritative design for turning a cart into an order. **Built:** `POST
/orders`, `GET /orders/:orderReference` (`apps/api/src/orders/`), `GET
/checkout/totals` and the quote's money (`apps/api/src/checkout/`), and in the
web the order button (`use-place-order.ts`), the cart and checkout summaries
reading the API's money, and the confirmation page `/orders/[orderReference]`
(`components/orders/`); the outbox and its relay (`apps/api/src/events/`) and
the two order emails (`apps/api/src/orders/emails/`, sent by
`apps/api/src/email/`); `OrderPlaced` on SQS (`orders/order-placed.publisher.ts`
through `events/sqs.publisher.ts`) and the queues (`infra/aws/messaging.yml`).
**Not yet:** the terms, withdrawal and privacy pages the button and the emails link to
(`LEGAL_PAGES` in `packages/shared`). The cart side of the transition is in
[CART.md](./CART.md), the delivery price in
[DELIVERY-PROVIDERS.md](./DELIVERY-PROVIDERS.md), and who a customer is in
[AUTH.md](./AUTH.md).

## What is in scope

- **Signed-in customers only.** Their email is verified at sign-up (AUTH.md),
  so an order's confirmation reaches the person who placed it. A guest "quick
  order" is hidden until it has its own design (see [Later](#later)).
- **Cash on delivery only.** Card is shown disabled, "Очаквайте скоро", with
  no fee badge. [Card payments](#card-payments-later) below says what changes.
- **Three ways to receive it:** an Econt office (or Econtomat), an address by
  Econt, or pickup from our store.

## The request

```
POST /orders                     JwtGuard · Cache-Control: no-store · 5/min per customer
{
  "cartId": "…",
  "cartVersion": 7,
  "expectedTotalCents": 15432,
  "paymentMethod": "CASH_ON_DELIVERY",
  "delivery":
      { "method": "COURIER_OFFICE",  "carrier": "ECONT", "officeCode": "1127" }
    | { "method": "COURIER_ADDRESS", "carrier": "ECONT", "address": { …DeliveryAddressDto } }
    | { "method": "STORE_PICKUP" }
}

201 { "orderId": "…", "orderReference": "VP-ORD-000123" }     a new order
200 { "orderId": "…", "orderReference": "VP-ORD-000123" }     the same cart again (replay)
```

The browser sends **no lines, weights or prices**. It sends which cart, which
version of it the customer looked at, and the total it showed them. The server
reads everything else itself, and refuses the order if what it reads is not what
the customer saw.

- **`cartVersion`** moves on every edit to the cart (CART.md). It catches an
  edit made in another tab or on another device.
- **`expectedTotalCents`** catches what the version cannot: a **live price that
  moved with no edit to the cart**. Without it, "the price you agreed to" could
  not be enforced. A price rise between the checkout page loading and the click
  would order at a total the customer never saw.
- **`cartId`** makes a retry safe (see [Idempotency](#idempotency-is-the-cart)).
  Resolving "the customer's active cart" instead would, on a retry after
  success, find the *new* cart holding the unselected lines.

`paymentMethod` accepts only `CASH_ON_DELIVERY` for now; anything else is
`400 VALIDATION_ERROR`. The checkout page's live reads (availability, the
quote) already are the confirmation, so there is no separate
`POST /checkout/confirm`.

## What the server does

All external reads (inventory, Econt) happen **before** the transaction, so no
row lock is ever held across an HTTP call.

1. **Who.** `CustomersService.requireCompleteProfile(clerkId)` returns the name,
   phone and email to snapshot, or `422 CUSTOMER_DETAILS_REQUIRED`.
2. **The cart.** Read by `cartId`; another owner's cart, or none, is
   `404 NOT_FOUND`, never `403`.
   - `ORDERED` → return its order, `200` (a replay).
   - `MERGED`, or `version ≠ cartVersion` → `409 CART_STALE`.
3. **The lines.** The cart's selected lines (none is `422 CART_EMPTY`), priced
   by `CheckoutService.priceOrder` (`apps/api/src/checkout/`), the one path
   `GET /checkout/totals` and `POST /checkout/quote` also take; the order is
   only stricter. Their live availability (`InventoryService.getAvailability`)
   fails closed with `503 INVENTORY_UNAVAILABLE`. A line out of stock, short of
   its quantity or unpriced is `422 ARTICLE_UNAVAILABLE` (`priceLines`,
   `inventory/orderable-price.ts`), where the totals leave it out and the quote
   answers no money.
4. **The delivery.** `DeliveryService.price`, which the quote calls too:
   destination check, parcel ready date, then the price and the
   cash-on-delivery fee. The order's price is binding, so an address is also
   validated with the carrier, alongside the pricing rather than after it, and
   `INVALID` is refused. Pickup costs nothing and
   has no carrier. Econt down is `503 DELIVERY_UNAVAILABLE` and **no order is
   written**: the amount collected at the door must be exact, so there is no
   flat-rate fallback.
5. **The money** ([below](#money)). `total ≠ expectedTotalCents` →
   `409 PRICE_CHANGED`.
6. **One transaction:**
   - lock the cart (`SELECT … FOR UPDATE`) and check again that it is `ACTIVE`
     at `cartVersion`. If it became `ORDERED` meanwhile, return that order;
   - insert the `Order`, its `OrderItem`s, the first `OrderStatusHistory` row
     (`PROCESSING`, `source: 'shop'`) and the `OrderPlaced` outbox row;
   - set the cart `ORDERED` with its `orderId`, and raise its version;
   - move the unselected lines, still unselected, to a fresh `ACTIVE` cart for
     the customer. None is opened when every line was ordered.
7. `201 { orderId, orderReference }`.

### Refusals and where the customer acts on them

| Code | Status | Checkout does |
|---|---|---|
| `PRICE_CHANGED` | 409 | Refetches availability and the quote; says "цената е променена" with the old and new totals |
| `CART_STALE` | 409 | Resyncs the cart |
| `ARTICLE_UNAVAILABLE` | 422 | Shows the blocked-lines notice |
| `CUSTOMER_DETAILS_REQUIRED` | 422 | Shows the completion step |
| `DELIVERY_*` (office, address, locker) | 422 | Points at the delivery panel |
| `INVENTORY_UNAVAILABLE`, `DELIVERY_UNAVAILABLE` | 503 | Offers a retry |
| `RATE_LIMITED` | 429 | Asks to wait |

## Idempotency is the cart

A double click, a network retry, or two tabs submitting at once must end in
**one** order. The cart's own id is the key, so no `Idempotency-Key` header is
needed:

- A request for a cart that is already `ORDERED` by this customer returns that
  order. The client cannot tell a replay from the first success, and need not.
- Two concurrent requests serialise on the cart's row lock. The second finds the
  cart `ORDERED` once the first commits, and returns the same order.
- `Order.cartId` and `Cart.orderId` are `UNIQUE`, so even a bug in the above
  cannot write a second order for one cart.
- Every cart write (a line edit, a sign-in merge) takes the same row lock
  before it touches a line, and refuses a cart that is no longer `ACTIVE` with
  `CART_STALE`. An edit that raced the order therefore cannot change the
  record of what was bought, and the two cannot deadlock.

## Money

Every amount is **EUR cents including VAT**. The shop sells at final prices:
`gross_price` comes from the backoffice as is (ARCHITECTURE.md), and it is what
the customer sees, what the total adds up and what Econt collects at the door.

**The gross price is the fact; the net price and the VAT are derived from it.**
That is the whole rule, and it has three parts.

1. **The total is an exact sum, with no rounding at all.**
   ```
   lineTotal  = gross unit price × quantity
   goods      = Σ lineTotal                         over the selected lines
   total      = goods + deliveryPrice + cashOnDeliveryFee
   ```
   Every term is already in whole cents, so the total is exactly what the
   customer was shown, line by line. It can never move by a cent.
2. **VAT is worked out once, from the total, at the one rate** (20%), with
   ordinary half-up rounding:
   ```
   vatAmount  = total − round(total / (1 + VAT_RATE))
   netAmount  = total − vatAmount
   ```
   This is the only rounding in an order, and it moves only how the total splits
   into net and VAT, never the total. Delivery and the fee are charged by us as
   part of the same sale, so the one rate covers the whole total
   (**[VERIFY]** with the accountant).
3. **Nothing is ever summed from net prices.** A net unit price (`bestPriceExVat`,
   for the trade customer's VAT toggle) is a display of one unit. Multiplying and
   adding rounded net prices, or adding VAT onto them, is what produces a total a
   cent off the gross one. That is why `common/price-calculator.ts`, which adds
   VAT onto a net subtotal, is removed with the order model.

For example, two parts to an Econt office, cash on delivery. Every price
includes VAT:

| What | Price | From |
|---|---|---|
| Part A, €12.99 × 2 | 25.98 | backoffice gross price |
| Part B, €7.49 × 3 | 22.47 | backoffice gross price |
| Delivery | 3.78 | Econt's quote |
| Cash-on-delivery fee | 0.81 | Econt's quote |
| **Total** | **53.04** | the sum: no rounding |
| Net | 44.20 | round(5304 / 1.2) = round(4420.0) |
| **VAT in it** | **8.84** | 53.04 − 44.20 |

Delivery and the fee need nothing of their own: Econt's prices include VAT like
the parts', we charge the customer that amount as part of the sale, and the one
division over the total takes the VAT out of all of it (€0.63 of the €3.78).

Dividing each part first instead gives 12.99 / 1.2 = 10.83 × 2 and
7.49 / 1.2 = 6.24 × 3, net 40.38, plus 20% = **48.46** for parts shown at
48.45. A cent off with two lines, and it grows with every line.

### The server computes it; the web only shows it

The figures come from **one pure function in the API**,
`apps/api/src/checkout/order-money.ts` (`orderMoney`), spec'd first with the
rounding edge cases. Its one caller is `CheckoutService`, which prices the cart
totals, the quote and the order, through `OrderMoneyCalculator`, which holds the
one configured `VAT_RATE` so no caller can pass another. The web does **no money arithmetic**: every total and VAT figure it
shows comes from one of these responses, all computed by `orderMoney` from the
live prices:

| Response | Shows | Used by |
|---|---|---|
| `GET /checkout/totals` | Parts total, its net and its VAT, and the `cartVersion` priced | The cart page; checkout before a delivery is chosen, and with store pickup |
| `POST /checkout/quote` | `money`: the same, plus the delivery price, the fee, the order total and the VAT in the whole total. `null` while a selected line cannot be ordered | The checkout summary once a courier delivery is quoted |
| `POST /orders` | Stores them on the order | The confirmation page and email |

The button sends back the `total` the summary showed as `expectedTotalCents`.
The order recomputes it the same way and refuses any difference
(`PRICE_CHANGED`), so what the customer saw and what the order holds come from
the same function on the same prices.

### How the large platforms do it, and why this matches

- **Magento / Adobe Commerce** offers three methods: round each unit's tax, each
  row's, or only the **total's**. Only the last rounds once.
- **WooCommerce** has "Round tax at subtotal level, instead of rounding per
  line" for prices entered including tax, because per-line rounding drifts.
- **Shopify** rounds tax per line for EU stores. With tax-included prices the
  total stays the gross sum, and the rounding shows up as cent differences in the
  reported tax, which merchants reconcile by hand.
- **EU and Bulgarian rules.** The CJEU (C-484/06, Koninklijke Ahold) left the
  rounding level to each member state. Bulgaria's law does not fix it, and its
  practice is VAT rounded to the cent and calculated **per invoice, by rate**.
  Spain and Portugal derive the base from the inclusive total by dividing by
  (1 + rate). Fiscal receipts under Н-18 also total VAT per tax group, not per
  item.

Rounding once, on the total, is the method that never drifts, and it is what a
receipt or an invoice for the order would show anyway.

### Later: discounts and invoices

- **A discount** (the mechanic's trade price) is applied to each line's **gross**
  unit price, in whole cents, before the sum. The total then stays an exact sum
  of what the customer was shown. A percentage off the total spread back over the
  lines would bring the rounding back.
- **An invoice** (ЗДДС Art. 114, for a business that asks for one) shows a net
  unit price per line and the tax base and VAT per rate. The base and the VAT are
  the order's `netAmount` and `vatAmount`; the per-line net prices are
  informative and may not add up to the base to the cent. **[VERIFY]** with the
  accountant that this is acceptable on an invoice, or whether it should balance
  per line instead.

### The quote is binding

The delivery price, the cash-on-delivery fee, the expected delivery date and the
parcel weight are **frozen on the order**. If Econt charges something different
when the waybill is made (a re-weighed parcel, a tariff change), the shop
absorbs the difference; the customer pays at the door exactly what the
confirmation says. The quote may come from the 5-minute quote cache, because
that cached figure is what the customer was shown.

## What an order stores

- **Identity:** `orderReference` (`VP-ORD-000123`, from the Postgres sequence
  `order_reference_seq`), `customerId`, `cartId`. A rolled-back order still
  spends its number, so references can skip one; that is fine for an order
  number, and the gapless invoice number is the backoffice's.
- **Delivery:** `deliveryMethod` (`COURIER_OFFICE`, `COURIER_ADDRESS`,
  `STORE_PICKUP`); `carrier` (`null` for pickup);
  `deliverySnapshot` with the destination as the customer chose it: office code,
  name and address, or the address lines and note; `expectedDeliveryDate`;
  `parcelWeightGrams`.
- **Money:** `goodsTotal`, `deliveryPrice`, `cashOnDeliveryFee`, `total`,
  `vatAmount`, as `orderMoney` returns them. The net is `total − vatAmount` and
  is not stored.
- **Who it is for:** `contactFirstName`, `contactLastName`, `contactPhone`,
  `contactEmail`, copied from the profile, so a later profile edit never
  rewrites an order. With the snapshot, a guest order later only needs
  `customerId` to drop `NOT NULL`.
- **`termsVersion`:** which terms the customer ordered under: `TERMS_VERSION`
  in `orders.service.ts`, raised whenever the terms page changes.
- **Lines:** `OrderItem` with `brandId` *and* `articleNumber`, brand name,
  description, `quantity`, `unitPrice` and `lineTotal`, both including VAT.

The backoffice reads `Order`, `OrderItem` and `OrderStatusHistory` with a
`SELECT` grant from `infra/db/01-shop-provisioning.sql`, given when the script
is run with `backoffice_db_user` after the shop's migrations.

## After the commit: the outbox

Publishing straight after the commit is a dual write: a crash between the two
leaves an order nobody hears about. So the event is a row, `OutboxEvent`,
written **in the order's transaction**, and a relay sends it on.

- `OutboxRelay` (`apps/api/src/events/`) runs every 5 seconds on a
  `@nestjs/schedule` interval. It **leases** up to 10 due events in one
  `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`: the statement pushes
  each row's `availableAt` 5 minutes ahead and counts the attempt, so several
  API instances never take one event at once, and no row lock is held while a
  handler calls out. If an instance dies mid-batch, its lease runs out and
  another instance takes the event.
- Every claim also sets a fresh `claimToken`, and each later write for the
  event (a handler done, the retry, the delete) names that token. If a slow
  instance's lease ran out and another claimed the event meanwhile, its writes
  match no row: it stops, logs at `warn`, and moves on with its batch, leaving
  the event to the claim that took it over.
- Each event goes to **every** handler of its type, and one handler failing
  does not stop the others. Each handler that succeeds is added to the row's
  `completedHandlers`, and a retry runs only the handlers not yet in it. Once
  all have succeeded the row is **deleted**: nothing reads a delivered event,
  so the table holds only work still to do. The wait between attempts doubles
  from 30 seconds up to an hour, and `lastError` names the handler and the
  status, never the response body.
- **After 10 attempts** (about three hours) the relay logs the event at
  `error` and stops claiming it. A person fixes the cause, then sets its
  `attempts` back to 0 to send it again; a handler that already succeeded is
  not run again. An event that no handler takes counts as a failure, so a
  missing registration cannot drop it.
- Delivery is **at least once**. Every handler is idempotent on `eventId`,
  because a send that timed out may still have gone out, or the relay may
  have died before it recorded the handler as done. The ten attempts stay
  well inside the 24 hours Resend keeps an idempotency key.
- Handlers register with the relay at start-up (`OutboxRelay.register`), so
  the events module knows no feature. The order emails are in
  `apps/api/src/orders/emails/` and read the order by its id; the SQS
  publisher is `apps/api/src/orders/order-placed.publisher.ts`.

### `OrderPlaced`

```json
{ "eventType": "OrderPlaced", "eventId": "…", "orderId": "…", "occurredAt": "2026-10-16T08:32:00Z" }
```

A **thin** event: the consumer reads the order from `shop."Order"` and
`shop."OrderItem"`. No name, phone, address or email sits in a queue, a DLQ or a
log line, and the event can never disagree with the row.

Its handlers:

| Handler | Sends | Through |
|---|---|---|
| Customer confirmation | The reference, lines, totals with VAT, delivery and its expected date, "Платете X € при получаване", the seller's identity, and the withdrawal right with links to the terms and the model form | Resend |
| Office notification | The order, to `ORDERS_NOTIFY_EMAIL`, so an office worker creates the Econt waybill | Resend |
| Backoffice | `OrderPlaced` on SQS `shop-events` ([below](#sqs)) | `@aws-sdk/client-sqs` |

Both emails carry an `Idempotency-Key` of `eventId:handler`, so a retried
handler never sends twice. The office email is the channel **until the
backoffice consumes `shop-events`**; it is kept or dropped then.

- **The confirmation** goes to the order's `contactEmail`, with replies going
  to `SELLER_EMAIL`. It opens with the amount to pay at the door, then lists
  the lines, the money exactly as the order froze it (VAT is taken from the
  whole total), the delivery and its date, and the recipient. It links the
  order page and the legal pages (`LEGAL_PAGES`, `orderPagePath` in
  `packages/shared`, under `CORS_ORIGIN`). It ends with the model withdrawal
  wording of ЗЗП чл. 50 and the seller's identity. **[VERIFY]** the wording
  with whoever handles legal.
- **The office notice** goes to `ORDERS_NOTIFY_EMAIL`, with replies going to
  the customer. It holds what a waybill needs: the office code or the address
  and its note, the parcel weight, and the amount to collect. It lists the lines
  with the article number in its own column, for picking.
- Both are built from one list of blocks (`email/email-document.ts`) that
  renders the HTML part and the plain-text part. Every value is escaped,
  because names and part descriptions come from customers and suppliers.

### Email

Resend, through its HTTP API (`EmailSender`, `apps/api/src/email/`), with
`RESEND_API_KEY` and `EMAIL_FROM`. A failed send records Resend's status and
error name, never its message, which can quote the recipient. The free tier
allows 3,000 emails a month and 100 a day; move to the paid plan before orders
approach 100 a day.

Configuration, all required at start-up:

| Variable | What it is |
|---|---|
| `ORDERS_NOTIFY_EMAIL` | The office inbox for new orders |
| `SELLER_NAME`, `SELLER_COMPANY_ID` (ЕИК), `SELLER_ADDRESS`, `SELLER_EMAIL`, `SELLER_PHONE` | The seller's identity that every confirmation states (ЗЗП чл. 47) |
| `CORS_ORIGIN` | The web origin, which the emails' links start from |

**Before the first real email**, the sending domain has to be set up:

1. In Resend, add the domain of `EMAIL_FROM` under Domains.
2. Add the records Resend shows, the SPF `TXT` and `MX` on its `send.`
   subdomain and the DKIM `TXT` (`resend._domainkey`), at the DNS host, then
   verify them in Resend.
3. Add a DMARC record, `_dmarc` `TXT` `v=DMARC1; p=none; rua=mailto:<inbox>`.
   Raise it to `p=quarantine` once the reports show only our own mail.

The e2e suites replace `EmailSender` with a recorder
(`test/helpers/recording-email-sender.ts`), so no test reaches Resend. The
orders suite stops the relay's interval and relays by hand.

### SQS

Two standard queues, defined in `infra/aws/messaging.yml` (CloudFormation):
`shop-events`, which we publish to and the backoffice consumes, and
`fulfillment-events`, the other way, for the status flow to come. Each has a
DLQ that takes a message after 5 receives; all four keep a message 14 days, the
most SQS allows, and are encrypted with SSE-SQS, which needs no KMS key or
permission. Consumers long-poll (20 seconds).

`OrderPlacedPublisher` (handler `shop-events-publisher`) sends each
`OrderPlaced` with `SqsPublisher` (`apps/api/src/events/`): the body is the
thin event [above](#orderplaced), and an `eventType` message attribute lets a
consumer route without parsing the body. `occurredAt` is when the outbox row
was written, in the order's transaction. A failed send is retried by the relay
like any handler, without resending either email, and is recorded as SQS's
status and error name. The client gives up on a connection after 5 seconds and
on a request after 10, so a hung send cannot hold the relay's batch.

**The backoffice's contract:**

- Delivery is **at least once**: a send whose answer was lost is sent again,
  and SQS itself may deliver a message twice. Deduplicate on `eventId`.
- The event carries no order data. Read the order from `shop."Order"`,
  `shop."OrderItem"` and `shop."OrderStatusHistory"` with the `SELECT` grant;
  the row is committed before the event exists, so it is always there.
- Delete a message once it is handled. One received 5 times without a delete
  moves to `shop-events-dlq`.
- Order is not guaranteed between events.

**Credentials.** The Lightsail container cannot assume a role, so it runs as
the IAM user `vp-parts-shop-api`, allowed only `sqs:SendMessage` on
`shop-events` and receive, delete and change-visibility on
`fulfillment-events`. Its access key is made outside the stack, so the secret
never appears in a template output or the stack's events, and it goes into the
container's environment as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`,
which the start-up validation requires in production. The backoffice needs
its own user, to consume `shop-events` and publish `fulfillment-events`; it is
added with the backoffice's consumer.

**Deploying the stack** (needs `CAPABILITY_NAMED_IAM` because it names the user):

```bash
aws cloudformation deploy --region eu-central-1 \
  --stack-name vp-parts-messaging \
  --template-file infra/aws/messaging.yml \
  --capabilities CAPABILITY_NAMED_IAM

# The queue URLs, for SQS_EVENTS_QUEUE_URL and SQS_FULFILLMENT_QUEUE_URL
aws cloudformation describe-stacks --region eu-central-1 \
  --stack-name vp-parts-messaging --query 'Stacks[0].Outputs'

# The first access key
aws iam create-access-key --user-name vp-parts-shop-api
```

**Rotating the key.** A user may hold two keys, so the new one goes live before
the old one stops working:

```bash
aws iam create-access-key --user-name vp-parts-shop-api
# Put the new pair in the container's environment and deploy it, then check
# that an order still reaches shop-events.
aws iam update-access-key --user-name vp-parts-shop-api \
  --access-key-id <old key id> --status Inactive
# A day later, with nothing broken:
aws iam delete-access-key --user-name vp-parts-shop-api --access-key-id <old key id>
```

**Looking at the queues.** `aws sqs get-queue-attributes --queue-url <url>
--attribute-names ApproximateNumberOfMessages` counts what waits, without
touching it. `aws sqs receive-message` does touch it: every receive counts
toward the 5 that send a message to the DLQ, so do not read a live queue the
backoffice consumes. After fixing a consumer, `aws sqs start-message-move-task
--source-arn <DLQ ARN>` moves the DLQ's messages back to their queue.

Locally, `SQS_EVENTS_QUEUE_URL` can be a placeholder: the publisher's handler
then fails and is retried until it gives up, and the emails are not held up.
The e2e suites replace `SqsPublisher` with a recorder
(`test/helpers/recording-sqs-publisher.ts`), so no test reaches AWS.

## Reading an order

`GET /orders/:orderReference` answers only the owner; anyone else gets
`404 ORDER_NOT_FOUND`, never `403`, so a guessed reference reveals nothing. The
URL carries the reference rather than the id because the customer reads it out
to support; the sequence it comes from is already on the confirmation page. `no-store`, like every order route. After
placing, checkout clears its delivery and payment choices, resyncs the cart (the
new one holds the unselected lines) and replaces the page with
`/orders/[orderReference]`: the reference, lines, totals with VAT, delivery and its
date, and the amount to pay at the door.

## The button

- **Its words say that ordering means paying**: "Купи сега". ЗЗП чл. 49, ал. 2
  (CRD Art. 8(2)) asks for "поръчка със задължение за плащане" or an equally
  unambiguous wording; "buy" is one, as German courts accept "Jetzt kaufen".
  The common "Завърши поръчка" / "Изпрати поръчка" is not: the CJEU (C-249/21)
  and the Dutch Supreme Court (2024) rejected "complete booking" and "complete
  order", and the consumer is then not bound. Nor is a payment method on the
  button ("Плати с наложен платеж"), which reads as choosing how to pay. Under
  it, one line links the terms, the withdrawal right and the privacy notice.
- **Enabled only when** the profile is complete, a delivery method is chosen and
  its quote has loaded (or it is pickup), cash on delivery is selected,
  availability has loaded, and no line is blocked or unpriced. While the request
  is pending it is disabled, and once it succeeds checkout shows "Поръчката е
  приета" until the confirmation page replaces it.
- **It sends what the summary shows.** `cartVersion` and `expectedTotalCents`
  come from the response the summary's total came from: the quote's for a
  courier, `GET /checkout/totals`' for a pickup. While an edit is re-priced the
  summaries keep the last figures, dimmed, so the button also waits until that
  response's `cartVersion` is the one the browser holds. `placeOrderRequestOf`
  (`lib/checkout/place-order.ts`) builds nothing while the total on screen
  leaves the delivery out.
- **A refusal re-reads what it names** (`use-place-order.ts`): a changed price
  re-reads availability and the quote and says the old and the new total; a
  stale cart resyncs it; a delivery refusal re-asks the quote, so the delivery
  panel names the problem, and its notice goes once another office or address
  is chosen; an outage changes nothing and the button stays enabled for a
  retry. Every other notice stands until the next attempt.

## Limits and logs

- `POST /orders` is throttled at **5 a minute per customer** by
  `PlaceOrderRateLimitGuard`, a route guard that runs after `JwtGuard` and
  counts in the throttler's storage under the verified customer id. The global
  `ThrottlerGuard` stays first and counts by address: it runs before any token
  is verified, so a flood of bad tokens is refused before each costs a
  verification, and nothing trusts an unverified token's subject. Both count
  in Redis (`RedisThrottlerStorage`), so every API instance shares one
  allowance; it fails open, so a Redis outage stops nobody from ordering.
- The logs name an order by its id only. No request body, name, phone, address
  or email.

## Legal (Bulgaria / EU): confirm with the accountant

- **Cash on delivery collected by Econt** is a postal money transfer, outside
  Наредба Н-18: no fiscal receipt and no NAP registration for it.
- **The confirmation email is the durable medium** the contract has to be
  confirmed on (CRD Art. 8(7), ЗЗП Art. 49).
- **Pickup paid at the counter** goes through the store's own fiscal device.
- Before launch the shop needs pages for its terms, its privacy notice, and the
  14-day withdrawal right with its model form. They are the business's content.

## Card payments, later

- The order is created **first**, as `PENDING_PAYMENT`, and the payment
  provider's webhook confirms it (`PROCESSING`, with `OrderPlaced` written
  then). Creating it only after payment would leave a paid customer with no
  order whenever the webhook's work fails. How a cart comes back after a failed
  or abandoned payment is decided with that design.
- Card payments bring the shop **into Н-18**: registration with NAP (Appendix 33)
  and an electronic order document with a unique sale number (УНП) and the
  payment id. The numbering is planned then.

## Later

- "My orders" (`GET /orders`), cancellation requests, live status over SSE and the
  `fulfillment-events` consumer.
- Remembering a customer's delivery addresses (T091c).
- Guest quick order: `customerId` loses `NOT NULL`, plus limits by phone and IP,
  a bot check, and an operator confirming by phone.
