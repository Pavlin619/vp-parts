# Orders: placing one, and what happens after

The authoritative design for turning a cart into an order. **Built:** `POST
/orders`, a guest's `POST /orders/quick`, `GET /orders/:orderReference` and
`GET /orders/guest/:orderReference` (`apps/api/src/orders/`), `GET
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

- **Signed-in customers**, whose email is verified at sign-up (AUTH.md), so an
  order's confirmation reaches the person who placed it; and **guests**, through
  a [quick order](#quick-order) the office confirms by phone, from checkout's
  "Бърза поръчка" tab.
- **Cash on delivery, and card for signed-in customers.** The API takes card
  ([PAYMENTS.md](./PAYMENTS.md)); checkout still shows it disabled,
  "Очаквайте скоро", until the payment widget is built.
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

`paymentMethod` is `CASH_ON_DELIVERY` or `CARD` (a quick order takes cash on
delivery only); anything else is `400 VALIDATION_ERROR`. A card order is
priced without the cash-on-delivery fee and waits for its payment
([Card payments](#card-payments)). The checkout page's live reads (availability, the
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
     (`PROCESSING`, `AWAITING_CONFIRMATION` for a quick order, or
     `PENDING_PAYMENT` for card; `source: 'shop'`) and the `OrderPlaced`
     outbox row, which a card order writes only once it is paid;
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
| `BOT_CHECK_FAILED` (quick order) | 400 | Says so; the next click solves a fresh challenge |

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

## Quick order

```
POST /orders/quick     @Public · x-cart-token · Cache-Control: no-store
                       5 per 10 min per address · 3 an hour per phone
{
  …the body of POST /orders,
  "contact": {
    "firstName": "Мария", "lastName": "Иванова",
    "phoneNumber": "0888 765 432", "email": "maria@example.com"   (optional)
  },
  "botCheckToken": "…"                                             the Turnstile widget's
}

201 / 200 { "orderId": "…", "orderReference": "VP-ORD-000123", "accessKey": "…" }
```

A guest orders with a name and a phone, and the office calls to confirm before
anything ships. It is a real order: the delivery is chosen and priced in
checkout, so the cash-on-delivery total is frozen and exact, and the call
confirms it and screens out fakes. **No account is created.** Clerk accounts
rest on a verified email and the phone is never verified, so an account filed
under a typed phone would let anyone attach orders to someone else's number.

- **The cart is owned through the guest's token** (`x-cart-token`, checked by
  `CartService.findGuestCart`). A signed-in customer's cart holds no token, so
  it answers `404 NOT_FOUND` here, as does a cart another token holds. The
  customer's route is `POST /orders`.
- **The contact** follows registration's rules (`quickOrderContactSchema` in
  `packages/shared`): two names, a Bulgarian mobile stored in E.164, and an
  optional email. It becomes the order's snapshot, with no `customerId`.
- **Everything else is `POST /orders`'s**: the same pricing, refusals and
  transaction (`OrdersService.placeFromCart`). The order starts
  `AWAITING_CONFIRMATION`.
- **A retry still finds its cart after the token moved.** Ordering a guest's
  cart moves its token to the cart that keeps the unselected lines, so the
  browser's cart carries on, and the ordered cart keeps it as `releasedToken`.
  A retry presents the same token, finds the ordered cart, and gets its order.
- **Limits.** A fake cash-on-delivery order costs a shipment.
  `QuickOrderRateLimitGuard` counts every attempt by the client's address (by
  the global throttler's proxy rule) and by the phone it names. Guards run
  before validation, so it reads the phone from the raw body, and a phone that
  is not a mobile counts against the address only. One phone may also hold at
  most **3 orders `AWAITING_CONFIRMATION`** (`429 RATE_LIMITED`). That is
  checked after the replay check, so a retry still finds its order, and before
  the transaction, so two concurrent orders from one phone can both pass it;
  the per-phone limit bounds that.
- **The bot check.** `botCheckToken` is a Cloudflare Turnstile token, checked
  with siteverify against `TURNSTILE_SECRET_KEY` (`TurnstileVerifier`,
  `apps/api/src/bot-check/`). A token that is invalid, expired or spent is
  `400 BOT_CHECK_FAILED`; a missing one is `400 VALIDATION_ERROR`. Our secret
  being wrong, or Cloudflare failing or unreachable, is `500` and fails closed:
  the signed-in route stays open, and an order nobody can verify is the one the
  check exists to stop. Cloudflare accepts a token **once**, so it is checked
  after the replay and version checks, which leave it unspent, and before the
  call limit and any pricing. A retry is answered with its order whatever its
  token. Any refusal after the check (the call limit, `PRICE_CHANGED`, a
  delivery refusal) has spent the token, so every click solves a challenge of
  its own. Two concurrent requests carrying one token end in one order and one
  `BOT_CHECK_FAILED`, and the button is disabled while a request is in flight.
  The visitor's address is not sent with the token: a browser can reach
  Cloudflare and us over different IP versions, and the per-address limit
  above already counts by address. Local and CI environments use Cloudflare's
  test secret `1x0000000000000000000000000000000AA`, which passes every token.
- **The access key** reads the order back with no account (see
  [Reading an order](#reading-an-order)). It is
  `HMAC-SHA256(ORDER_LINK_SECRET, orderId)` in base64url, derived rather than
  stored (`OrderAccessKeys`), so a retry is answered with the same key and an
  email sent later can carry it too.
- **In checkout** the "Бърза поръчка" tab asks for both names (the courier's
  receiver needs them), a mobile and an optional email (`QuickOrderFields`,
  held in the unpersisted `useQuickOrder` store, checked against
  `quickOrderContactSchema` with registration's messages). The payment panel
  is hidden: a quick order is paid on delivery. The button is the same "Купи
  сега" under the same terms note, since the click binds the guest as it binds
  a customer; it is enabled once the contact is valid and Cloudflare's script
  has loaded.
- **The bot check runs at the click, not when the tab opens.** The Turnstile
  widget (`QuickOrderBotCheck`) sits beside the button, rendered with
  `execution: "execute"` and `appearance: "interaction-only"`: it draws
  nothing, and runs its challenge only when "Купи сега" is clicked
  (`BotCheckChallenge`, which resets the widget before every attempt after the
  first, so each gets a fresh token). Most visitors pass unseen; one Cloudflare
  wants to see tick a box gets the box there, beside the button. One it cannot
  vouch for gets no puzzle to fall back on, so the panel says so and points to
  signing in. The site key is `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, falling back to
  Cloudflare's **invisible** test key `1x00000000000000000000BB`; its visible
  test key prints "Само за тестване" in the widget. The production widget is
  created in Cloudflare's **Managed** mode, which with `interaction-only` stays
  hidden unless it needs a click.
- **The confirmation page** opens at `/orders/VP-ORD-…#k=…` and reads the order
  with that key (`useOrderAccessKey`, `getGuestOrder`). An order
  `AWAITING_CONFIRMATION` says "Ще ви се обадим на … за потвърждение" and
  promises no email, since a guest's email is unverified. A guest is then
  offered an account (`GuestAccountInvite`), filled in with the order's name,
  phone and email through `useRegistrationDraft`. The account does not take
  this order: linking a guest's orders waits on a verified email equal to
  `contactEmail`, never the phone.

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
  rewrites an order. A guest's quick order has no `customerId`, and has no
  `contactEmail` unless the guest gave one; the snapshot is all it is known by.
- **`status`:** a customer's order starts `PROCESSING`, or `PENDING_PAYMENT`
  when paid by card. A guest's starts `AWAITING_CONFIRMATION`: the office calls
  the phone to confirm it before anything is picked or shipped.
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
| Customer confirmation | The reference, lines, totals with VAT, delivery and its expected date, "Платете X € при получаване" (or "Платено с карта"), the seller's identity, and the withdrawal right with links to the terms and the model form | Resend |
| Office notification | The order, to `ORDERS_NOTIFY_EMAIL`, so an office worker creates the Econt waybill | Resend |
| Backoffice | `OrderPlaced` on SQS `shop-events` ([below](#sqs)) | `@aws-sdk/client-sqs` |

Both emails carry an `Idempotency-Key` of `eventId:handler`, so a retried
handler never sends twice. The office email is the channel **until the
backoffice consumes `shop-events`**; it is kept or dropped then.

- **The confirmation** goes to the order's `contactEmail`, with replies going
  to `SELLER_EMAIL`. It opens with the amount to pay at the door, or
  "Платено с карта: X €" for a card order, then lists
  the lines, the money exactly as the order froze it (VAT is taken from the
  whole total), the delivery and its date, and the recipient. It links the
  order page and the legal pages (`LEGAL_PAGES`, `orderPagePath` in
  `packages/shared`, under `CORS_ORIGIN`). It ends with the model withdrawal
  wording of ЗЗП чл. 50 and the seller's identity. **[VERIFY]** the wording
  with whoever handles legal.
- **A guest's order waits for the call.** An order `AWAITING_CONFIRMATION` is
  sent no confirmation when it is placed, and the handler counts as done. The
  guest's email is unverified, so we write to it only once the call has
  confirmed the order, from the backoffice's `OrderConfirmed` on
  `fulfillment-events` (not built yet). Until then a guest gets the call and
  the paper confirmation in the parcel. That still satisfies ЗЗП чл. 49, which
  asks for the confirmation by delivery at the latest.
- **The office notice** goes to `ORDERS_NOTIFY_EMAIL`, with replies going to
  the customer when there is an email. An order `AWAITING_CONFIRMATION` is
  marked "За потвърждение:" in the subject and asks for the call before it is
  fulfilled. It holds what a waybill needs: the office code or the address
  and its note, the parcel weight, and the amount to collect. A card order says
  "Платено с карта — без наложен платеж" in its place, so no waybill collects
  cash for an order already paid. It lists the lines
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
| `ORDER_LINK_SECRET` | At least 32 characters; signs the access key in a guest's order link (`openssl rand -base64 48`) |

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
- An order read `AWAITING_CONFIRMATION` is not fulfilled until the office has
  called the customer and confirmed it, or it is cancelled. The status then
  moves on from the backoffice, with the `fulfillment-events` flow to come.
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

A guest has no account to read with, so their order is read with its access key:

```
GET /orders/guest/:orderReference    @Public · X-Order-Key: <accessKey> · no-store
```

- **The key travels in a header**, and the guest's link carries it in the URL
  fragment, `/orders/VP-ORD-000123#k=…` (`orderPagePath` in `packages/shared`).
  The browser never sends a fragment, so the key reaches no server log and no
  `Referer`.
- **A missing or wrong key is `404 ORDER_NOT_FOUND`**, the same as no order,
  and the comparison is constant-time.
- **CORS allows the header** (`ORDER_KEY_HEADER` in `main.ts`'s
  `allowedHeaders`), or the browser's preflight would refuse the read.
- **Only a guest's order is read this way.** A customer's order is read through
  the account, so the route never answers one, whatever key is presented, and
  a customer's email links to their order without a key.
- **Rotating `ORDER_LINK_SECRET` breaks every guest link already sent.** Rotate
  it only if it leaks.

## The button

- **Its words say that ordering means paying**: "Купи сега". ЗЗП чл. 49, ал. 2
  (CRD Art. 8(2)) asks for "поръчка със задължение за плащане" or an equally
  unambiguous wording; "buy" is one, as German courts accept "Jetzt kaufen".
  The common "Завърши поръчка" / "Изпрати поръчка" is not: the CJEU (C-249/21)
  and the Dutch Supreme Court (2024) rejected "complete booking" and "complete
  order", and the consumer is then not bound. Nor is a payment method on the
  button ("Плати с наложен платеж"), which reads as choosing how to pay. Under
  it, one line links the terms, the withdrawal right and the privacy notice.
- **Enabled only when** the profile is complete (for a quick order, the contact
  is valid and the bot check has passed), a delivery method is chosen and
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
- `POST /orders/quick` has no account to count against: see
  [Quick order](#quick-order) for its limits by address and by phone.
- The logs name an order by its id only. No request body, name, phone, address
  or email.

## Legal (Bulgaria / EU): confirm with the accountant

- **Cash on delivery collected by Econt** is a postal money transfer, outside
  Наредба Н-18: no fiscal receipt and no NAP registration for it.
- **The confirmation email is the durable medium** the contract has to be
  confirmed on (CRD Art. 8(7), ЗЗП Art. 49). **[VERIFY]** A quick order may
  have no email, so its written confirmation is printed and put in the parcel,
  which still reaches the consumer "at the latest at the time of delivery".
- **Pickup paid at the counter** goes through the store's own fiscal device.
- Before launch the shop needs pages for its terms, its privacy notice, and the
  14-day withdrawal right with its model form. They are the business's content.

## Card payments

Being built: [PAYMENTS.md](./PAYMENTS.md) holds the design and what is built.

- The order is created **first**, as `PENDING_PAYMENT`, and the payment
  provider's webhook confirms it (`PROCESSING`, with `OrderPlaced` written
  then). Creating it only after payment would leave a paid customer with no
  order whenever the webhook's work fails. A session that ends unpaid cancels
  the order.
- Card payments bring the shop **into Н-18**: registration with NAP (Appendix 33)
  and an electronic order document with a unique sale number (УНП) and the
  payment id. The numbering is planned then.

## Later

- "My orders" (`GET /orders`), cancellation requests, live status over SSE and the
  `fulfillment-events` consumer.
- Remembering a customer's delivery addresses (T091c).
- Quick order: the confirmation email once the office has confirmed, and
  linking a guest's orders to an account by a verified email.
