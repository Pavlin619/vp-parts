# Card payments: Dominaite hosted checkout

How a card order is paid. **Built:** the Dominaite adapter (`apps/api/src/payments/`):
opening and reading a checkout session, and checking a webhook's signature; the
`PENDING_PAYMENT` status and the `CardPayment` and `PaymentWebhookEvent` tables;
placing a card order, opening its session, and the webhook that confirms it
(`apps/api/src/orders/card-payment/`), with the emails' card wording.
**Not yet:** the sweep, cancelling a card order, and the web's
[order page](#the-order-page-not-yet-built). Placing an order is
[ORDERS.md](./ORDERS.md), which stays the authority for everything up to the
order's commit.

## Who does what

Card data never reaches us. Dominaite's widget takes the card inside its own
iframes, runs 3-D Secure and offers Apple Pay and Google Pay; our server sees ids
and amounts only.

```
POST /orders (CARD)        order PENDING_PAYMENT, cart ORDERED, nothing announced
POST /orders/:ref/payment  we open a session for the order's total → cashierKey, cashierToken
order page                 the widget pays it
webhook payment.succeeded  order PROCESSING, OrderPlaced written → emails, SQS
sweep                      reads every open session; the safety net for a lost webhook
```

- **Card is for signed-in customers only.** A quick order stays cash on delivery,
  confirmed by phone.
- **Only `payment.succeeded`, or the sweep reading `succeeded`, marks an order
  paid** ([the webhook](#the-webhook)). The widget's browser events (`[bp]:deposit`) are feedback for the page,
  never proof: a customer can close the tab the moment they pay.
- **A declined card is retried in a new session.** A decline ends its session
  ([measured](#what-dominaite-does-measured)), so another card is the next
  attempt, up to five. An order that ends unpaid (out of time, out of attempts,
  or the customer chose another way to pay) is cancelled, and its lines go back
  in the customer's cart.

## Placing a card order

`POST /orders` with `"paymentMethod": "CARD"` takes the path every order takes
(ORDERS.md), with two differences. Checkout prices it with no cash-on-delivery
fee, and it starts `PENDING_PAYMENT` with **no `OrderPlaced`**, so no email, SQS
message or office notice goes out until it is paid. The cart closes `ORDERED`
as for any order, so a retry is answered with the same order. A quick order
refuses card (`QuickOrderBodyDto`): a guest pays at the door.

## Opening the payment

```
POST /orders/:orderReference/payment     JwtGuard · no-store · 10/min per customer

200 { "cashierKey": "ck_…", "cashierToken": "…", "expiresAt": "2026-10-23T12:00:00.000Z" }
```

The order page calls it to start the widget, and again on every reload. It
sends no amount: the session is opened for the order's `total` as stored.

- **Which attempt** (`CardPaymentService`, over the order's latest `CardPayment`):
  none yet is attempt 1; an `OPEN` one inside its `expiresAt` is asked for
  again, and Dominaite answers its session; after a `FAILED` one it is the next.
- **Dominaite says the key is spent.** `ALREADY_PROCESSED` is a payment not yet
  confirmed: `409 ORDER_PAYMENT_PROCESSING`, and the webhook or the sweep will
  confirm it. `PRIOR_ATTEMPT_FAILED` marks the attempt `FAILED` and opens the
  next one.
- **`409 ORDER_NOT_PAYABLE`** for an order that is not `PENDING_PAYMENT`, whose
  last session has ended unpaid, or whose fifth attempt has failed
  (`MAX_PAYMENT_ATTEMPTS`). It is cancelled, never paid late. Each decline buys a
  fresh two-hour session, so without a limit one order could stay open for good,
  and take card after card, which is how stolen cards are tested.
- **`404 ORDER_NOT_FOUND`** for another customer's order, or none.
- **`503 PAYMENT_UNAVAILABLE`** when Dominaite cannot be reached, with nothing
  recorded. The call is made outside any transaction.
- The rate limit is its own bucket (`order-payment`), apart from placing
  orders, because each call reaches Dominaite, which throttles us in turn.

The e2e suite (`apps/api/test/orders-card.e2e-spec.ts`) replaces the SDK's
client with `test/helpers/dominaite-fake.ts`, which replays a key's session and
refuses a key whose payment ended, as Dominaite does.

## The webhook

```
POST /payments/dominaite/webhook     @Public · no rate limit · X-Webhook-Signature
```

`DominaiteWebhookController` checks the signature over the raw body
(`DominaiteWebhooks.verify`), then `PaymentOutcomeService` applies the event.
Dominaite redelivers anything not answered `2xx`, so the route answers `400`
only for a delivery it did not sign (a bad or missing signature, or one more
than 300 s old), `200` for everything it reads, and lets a failure to apply the
event (the database down) surface as `500`, to be delivered again. The
signature guards the route, so the global rate limit does not apply.

| Event | The attempt | The order |
|---|---|---|
| `payment.succeeded` | `SUCCEEDED` | `PENDING_PAYMENT` → `PROCESSING`, `paymentReference` = the `transactionId`, a history row with `source: 'dominaite'`, and `OrderPlaced` written, so the two emails and the SQS message follow through the outbox |
| `payment.failed` | `FAILED` | unchanged: the next session opens attempt n+1 |
| `payment.abandoned`, `payment.cancelled` | `ABANDONED`, `CANCELLED` | unchanged for now; cancelling it is the sweep's work, not built yet |
| anything else, or a `transactionId` not ours | — | — |

- **Exactly once.** The delivery's id goes into `PaymentWebhookEvent` in the
  same transaction as the change, so a redelivery changes nothing. Each change
  is also guarded by the status it moves from (the attempt `OPEN`, the order
  `PENDING_PAYMENT`), so two deliveries of one outcome under different ids, or
  the sweep and the webhook together, still write one `OrderPlaced`.
- **Only the whole total pays the order.** A success whose `amount` (what we
  are paid, surcharge excluded) is not the order's `total`, or whose currency is
  not `EUR`, is logged at `error` and leaves the order unpaid.
- **A success for an order already `CANCELLED`** marks the attempt
  `SUCCEEDED` and is logged at `error`, for a refund by hand until refunds are
  built.
- **The emails.** A card order's confirmation says "Платено с карта: X €" in
  place of the amount to pay at the door, and the office notice says "Платено
  с карта — без наложен платеж", so no waybill collects cash for it.

The e2e suite posts deliveries signed with the test environment's
`DOMINAITE_WEBHOOK_SECRET` and relays the outbox by hand, so it checks the
order, the attempt, both emails and the SQS message.

## The adapter

`PaymentsModule` is Dominaite and nothing else; the order's state machine stays
in `orders/`, which imports this module's barrel. The webhook route therefore
lives in `orders/` too: putting it here would need payments → orders, and orders
already needs payments to open a session.

- `DominaiteGateway` wraps `@dominaite/merchant-sdk`'s `DominaiteClient`, built
  by `createDominaiteClient` (10 s timeout, the SDK's two retries). The SDK
  signs every request, unwraps the response envelope and retries only what is
  safe to retry.
  - `openCheckoutSession` sends the order's total in euro cents, its reference,
    the payer's name, email and phone, and `language: 'bg'`.
  - `readCheckoutSession` answers the status with the SDK's `isPaid` and
    `isTerminal`. A status the SDK does not know is neither, so it keeps an order
    open rather than closing a live one.
- **The idempotency key** is `orderIdempotencyKey` with scope
  `checkout-{attempt}`: `checkout-1-VP-ORD-000123-5304-EUR`. The same order,
  attempt and amount replay the same open session, so a reload or a retry after
  a timeout never opens a second payment. A key whose payment ended is spent:
  Dominaite answers `ALREADY_PROCESSED` (paid) or `PRIOR_ATTEMPT_FAILED`
  (declined, or an expired session Dominaite has closed), which the gateway
  throws as `CheckoutKeySpentError`. A new session is then the next attempt,
  which is why `CardPayment` counts them.
- **An expired key is not spent at once.** From a few minutes past `expiresAt`,
  the same key answers a **fresh** session, with a new `transactionId`, until
  Dominaite closes the attempt about an hour later (the SDK's README). That is
  why the session route refuses an expired attempt without asking: asking
  would reopen an order that is to be cancelled.
- **Failures.** A network error, a 5xx, a 429, `PAYMENT_PROCESSING_UNAVAILABLE`
  and `DUPLICATE_REQUEST` are `503 PAYMENT_UNAVAILABLE`, to retry. Wrong
  credentials, a bad signature, a storefront not whitelisted or a refused body are
  ours to fix, and surface as `500`.
- `DominaiteWebhooks.verify` checks `X-Webhook-Signature` (`t=…,v1=…`,
  HMAC-SHA256 over `t + "." + rawBody`, compared in constant time) over the raw
  body, and refuses a timestamp more than 300 seconds from our clock in either
  direction, so a captured delivery cannot be replayed. Only then does it parse.
  Everything it refuses is `InvalidWebhookError`.

Both are pinned by Dominaite's offline vectors (`dominaite.gateway.spec.ts`,
`dominaite-webhooks.spec.ts`), so an SDK upgrade that changed the recipe fails a
test, not a payment.

## What is stored

- **`Order.status` `PENDING_PAYMENT`**: a card order not yet paid. No
  `OrderPlaced`, so no email, no SQS message and no office notice.
- **`Order.paymentReference`**: the `transactionId` that paid it, for the sale
  document Н-18 asks for.
- **`CardPayment`**: one row per session. `attempt` counts from 1 per order,
  `transactionId` is Dominaite's id, `amount` is the order's total, and
  `expiresAt` (two hours after opening) is when the sweep may give up on it.
- **`PaymentWebhookEvent`**: the id of every delivery handled. Dominaite
  delivers at least once, retrying after 1 min, 5 min, 30 min, 2 h and 12 h,
  and the delivery's id, not the `transactionId`, is what repeats.

## Configuration

| Variable | What it is |
|---|---|
| `DOMINAITE_KEY_ID` | `dmk_…`, the API key's id |
| `DOMINAITE_SECRET` | `dms_…`, shown once when the key is generated |
| `DOMINAITE_BASE_URL` | `https://api.staging.dominaite.com/payments` (Test) or `https://api.dominaite.com/payments` (Production) |
| `DOMINAITE_WEBHOOK_SECRET` | `whsec_…`, shown once when the webhook endpoint is added |

A key works only against the environment that issued it: a Test key against
Production is `INVALID_API_KEY`. Regenerating a key stops the old one at once. The
secrets go from the dashboard straight into the server's environment, never
into chat, email or git. Requests must be signed within 300 seconds of
Dominaite's clock, so the server keeps NTP time.

## What Dominaite does, measured

On staging, 2026-10-23, with a 1.00 € session paid from a localhost page:

| What happened | What we saw |
|---|---|
| The card is declined (**Неуспех**) | The widget says "Транзакцията беше отказана" and offers no retry. The status reads `failed` (terminal, `declineClass: soft_other`) at once, and the same key answers `PRIOR_ATTEMPT_FAILED`. `payment.failed` arrives about 16 s later. |
| The page is reloaded on the declined session | The widget says "Сесията е затворена или изтекла! Моля, започнете отначало!" and emits `[bp]:error`. It cannot be paid again. |
| Attempt 2 is opened with the next key | A new `transactionId` and an empty form, payable. |
| It is paid (**Успех**) | The widget says "Поздравления!" and emits `[bp]:deposit`. For about 15 s the status still reads `pending` and the same key still answers the **open session**; then `payment.succeeded` arrives, the status reads `succeeded`, and the key answers `ALREADY_PROCESSED`. |
| The page is reloaded in those 15 s | "Сесията е затворена или изтекла", as for a declined session. |

So:

- **A decline ends the session.** Marking the attempt `FAILED` on
  `payment.failed` is safe: the declined session cannot be paid, so the next
  attempt never leaves two payable sessions open.
- **Nothing on the server says "paid" for the first seconds after a payment.**
  Only the browser knows, from `[bp]:deposit`. The order page must take over from
  the widget then ([below](#the-order-page-not-yet-built)), or a customer who has
  just paid reloads into "start over", and may order and pay again.
- **`[bp]:deposit` carries its outcome in `detail.type`** (`approved`,
  `declined`, `pending`), not in `detail.status` as the guide says.

## Open questions `[VERIFY-DOM]`

- **When is `payment.abandoned` sent:** at `expiresAt`, or when Dominaite closes
  the attempt about an hour later? The sweep cancels only on Dominaite's own
  terminal status, or once a grace period past `expiresAt` has run out (a
  payment approved just before `expiresAt` can still read `pending` after it).
  Only how long a cart stays locked depends on the answer.

## Testing on localhost

1. In the Dominaite dashboard (Test), regenerate the API key and put
   `DOMINAITE_SECRET` in `apps/api/.env`. Add the website as an online store.
2. Expose the API on its `PORT` (3001 in `apps/api/.env`):
   `ngrok http --url=<domain> 3001`, with ngrok's free static domain, so the URL
   survives a restart.
3. Under Webhooks, add `https://<domain>/payments/dominaite/webhook` with
   `payment.succeeded`, `payment.failed`, `payment.abandoned` and
   `payment.cancelled`, and put its `whsec_…` in `DOMINAITE_WEBHOOK_SECRET`.
4. Pay with **4444 4444 4444 4448**, any future expiry and any CVV, and choose
   **Успех** or **Неуспех** on the 3-D Secure page. The dashboard's webhook
   delivery log shows each delivery and our answer.

Verified on staging on 2026-10-23 with 1.00 € sessions paid from a plain
localhost page: the key signs, the widget renders, and `payment.succeeded` and
`payment.failed` arrive through ngrok, their signatures verifying with our
`whsec_` secret.

Before go-live, run the whole flow through the shop on staging:

- pay, and check the order moves to `PROCESSING`, both emails arrive and
  `OrderPlaced` reaches SQS;
- pay and reload within 15 s: the page says the payment is being confirmed,
  never "start over";
- decline, retry with another card, pay;
- decline five times: the order is cancelled and its lines are back in the cart;
- leave unpaid, come back within two hours and pay from the unpaid-order banner;
- leave unpaid past the session: the sweep cancels the order;
- stop ngrok during a payment: the sweep alone marks the order paid.

Test payments go to a simulator; no money moves. The storefront whitelist is
enforced in Production only (`STOREFRONT_NOT_WHITELISTED`), so localhost works in
Test.

## The order page (not yet built)

After "Купи сега" with card, checkout goes to `/orders/VP-ORD-…`. While the order
is `PENDING_PAYMENT` that page is the last step of checkout, laid out as one,
under "Плащане". It never says "Поръчката е приета" before the payment is
confirmed.

| State | The page shows | The customer can |
|---|---|---|
| To pay | "Остава само плащането", the order and its total, the widget, and "Поръчката е запазена до 12:14" | pay; or choose "Друг начин на плащане" |
| Confirming | "Потвърждаваме плащането…", re-reading the order every 2–3 s; after about 60 s, "Обработваме плащането. Можете да затворите страницата — ще получите имейл, щом бъде потвърдено." | nothing: no second payment is offered |
| Declined | "Картата беше отказана. Не е изтеглена сума." | "Опитай с друга карта" (the next attempt, in a fresh widget); or "Друг начин на плащане" |
| Paid | The confirmation, with "Платено с карта" in place of the amount to pay at the door | |
| Ended unpaid | "Времето за плащане изтече. Поръчката е отказана, продуктите са върнати в количката." | "Към количката" |

- **Confirming** starts on `[bp]:deposit` with `approved` or `pending`, on
  `[bp]:error`, and on `409 ORDER_PAYMENT_PROCESSING`. The widget's own "start
  over" message is never left on screen.
- **Declined** starts on `[bp]:deposit` with `declined`; trying again calls the
  session route, which opens the next attempt.
- **"Друг начин на плащане"** cancels the order the way the sweep does, and
  returns the customer to checkout with the lines back in the cart.
- The states are announced through an `aria-live` region.
- **An unpaid order can be found again.** The cart is empty once its lines are
  ordered, and there is no "My orders" yet, so the cart and checkout pages show
  "Имате неплатена поръчка VP-ORD-000123 — Плати до 12:14" while the customer
  has a card order `PENDING_PAYMENT`. Without it, a customer who closed the tab
  orders again.

This is the order-first flow of a hosted payment page (WooCommerce's and
Magento's "pending payment" orders, and the Borica and ePay shops): the order
exists before the payment, so a reload, a closed tab or a retry always has an
order to come back to.

## Before Production

- A key from the **Production** dashboard, and `DOMINAITE_BASE_URL` set to it.
- The shop's domain sent to Dominaite for the whitelist, and the Production
  webhook endpoint added.
- **No card surcharge** in the dashboard. The webhook carries `surchargeAmount`,
  and a surcharge on a consumer card is not allowed in the EU (PSD2). The order's
  total must be what is charged.
- Н-18: registration with NAP and the sale document (УНП), settled with the
  accountant before the first real card sale (ORDERS.md → "Card payments").
- A page with a strict Content-Security-Policy must allow
  `https://bp-checkout.dominaite.com` in `script-src` and `frame-src`. The web
  sends no CSP today.
