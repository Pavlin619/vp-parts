# Card payments: Dominaite hosted checkout

How a card order is paid. **Built:** the Dominaite adapter (`apps/api/src/payments/`):
opening and reading a checkout session, and checking a webhook's signature; the
`PENDING_PAYMENT` status and the `CardPayment` and `PaymentWebhookEvent` tables.
**Not yet:** placing a card order, the session route, the webhook route, the
sweep, and the web's payment widget. Placing an order is [ORDERS.md](./ORDERS.md),
which stays the authority for everything up to the order's commit.

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
  paid.** The widget's browser events (`[bp]:deposit`) are feedback for the page,
  never proof: a customer can close the tab the moment they pay.
- **A failed card can be retried while the session is open.** A session that ends
  unpaid (`abandoned`, `cancelled`, expired) cancels the order and puts its lines
  back in the customer's cart.

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
  Dominaite answers `ALREADY_PROCESSED` (paid) or `PRIOR_ATTEMPT_FAILED`, which
  the gateway throws as `CheckoutKeySpentError`. A new session is then the next
  attempt, which is why `CardPayment` counts them.
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

## Open questions `[VERIFY-DOM]`

- **Can an open session take another card after a decline?** Assumed yes: the
  guide says a failed attempt leaves the order open. If not, a decline ends the
  session and "retry" means opening attempt 2 at once, rather than re-showing the
  widget.
- **When is `payment.abandoned` sent:** at `expiresAt`, or when the widget is
  closed? The sweep cancels only on Dominaite's own terminal status, so either
  works. Only how long a cart stays locked depends on it.

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

Verified on staging on 2026-10-23 with a 1.00 € session paid from a plain
localhost page: the key signs, the widget renders, and `payment.succeeded`
arrived through ngrok about ten minutes after opening (the time it took to pay),
its signature verifying with our `whsec_` secret.

Test payments go to a simulator; no money moves. The storefront whitelist is
enforced in Production only (`STOREFRONT_NOT_WHITELISTED`), so localhost works in
Test.

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
