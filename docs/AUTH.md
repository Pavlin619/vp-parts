# Auth: Clerk accounts and customers

Clerk owns **who someone is** (email, password, names, sessions). Our `Customer`
row owns **what they do with us** (phone, addresses, carts, orders). They are
joined by `Customer.clerkId`, and only `CustomersService` knows that.

## Registering

```
Browser ── signUp.password (email, password, names,
                            unsafeMetadata { phoneNumber, address? }) ──▶ Clerk
Browser ── POST /customers/me (no body) ──▶ API                 ─┐
Clerk   ── POST /webhooks/clerk  user.created ──▶ API           ─┤ either, or both
             API ── users.getUser(clerkId) ──▶ Clerk               │ email, names, metadata
             API ── one INSERT: Customer (+ default Address) ──▶ Postgres
```

**No Clerk account may end up without a customer row.** Clerk's sign-up and our
insert are two systems with no shared transaction, so two paths run the same
idempotent filing (`CustomersService.register`):

- **The browser's `POST /customers/me`**, straight after sign-up. It is what a
  customer who registers in checkout and orders at once relies on: the webhook
  may arrive seconds later, after the order needed the row.
- **The `user.created` webhook** is the guarantee. Clerk retries until we answer
  `2xx`, so a closed tab, a lost response or an API that was down at sign-up
  still ends with a row.

Either may land first, and a webhook can be redelivered; whichever arrives
second finds the row and returns it unchanged. Two concurrent calls resolve to
the one row the database let through (the `clerkId` unique constraint).

**What gets filed comes only from Clerk.** Email and names are Clerk's own
fields. The phone and the optional address travel in Clerk's `unsafeMetadata`,
which the registration form sets at `signUp.password` — the only carrier both
paths can read. It is *unsafe* because the browser can rewrite it at any time,
so the API reads it only when filing, never afterwards, and validates it with
the same shared schema the form uses (`registrationMetadataSchema`). After
filing, our row is the record: a later edit to the metadata changes nothing.

**When filing cannot succeed**, retrying will not help either:

- No email, names or valid metadata (a user created in the Clerk dashboard, or
  tampered metadata) → `422 VALIDATION_ERROR`. There is no "complete your
  profile" form; the web app tells the customer to contact us.
- An email another customer already holds → `409 EMAIL_ALREADY_EXISTS`.
  Reachable only when a Clerk user was deleted and recreated without our row
  following it.

The webhook logs both at `error` and answers `200`, so Clerk stops retrying a
delivery that would fail the same way forever. Any other failure answers `5xx`
and Clerk retries. A signed-in user with no row yet gets
`404 CUSTOMER_PROFILE_INCOMPLETE` from `GET /customers/me`, and the browser
files them.

### The registration form

`/sign-up` and checkout's "Регистрация" tab render our `RegistrationForm`, not
Clerk's `<SignUp/>`, which has no place for the phone or the address. It checks
everything against `registerCustomerSchema` before Clerk is asked, so once Clerk
accepts, filing can fail only on transport. The address is optional and closed
by default; one given becomes the profile's default.

It needs the Clerk instance set up to match (**Configure → User & authentication**):
email and password on, first and last name on and required, Clerk's own phone
field off. **Email verification at sign-up must be off**: the form has no code
step, so a sign-up Clerk leaves `missing_requirements` is shown as a generic
failure and logged. Bot protection renders into `<div id="clerk-captcha">`.

The filing call sends the fresh session's token explicitly
(`fileCustomer(token)`): straight after `finalize()`, `SessionTokenBridge` may
not have registered the new session yet. If that call fails anyway the form
still completes — the account exists, and the session sync or the webhook files
it. Clerk's error codes are put into Bulgarian in `lib/auth/clerk-errors.ts`;
`bgBG` localizes only Clerk's own components.

### The webhook endpoint

`POST /webhooks/clerk` is public; `ClerkWebhooks` verifies Clerk's signature
over the raw request body (Nest runs with `rawBody: true`) with
`CLERK_WEBHOOK_SECRET`, and a request that fails is `400`. Only `user.created`
is handled. `user.updated` (an email or name changed through Clerk's account
menu) and `user.deleted` (erasure) are accepted and ignored until they are
built.

Set it up in the dashboard under **Configure → Webhooks**: endpoint
`https://<api host>/webhooks/clerk`, event `user.created`, and copy the signing
secret (`whsec_…`) into `CLERK_WEBHOOK_SECRET`. To receive it locally, expose
the API through a tunnel (`ngrok http 3001`) and register that URL on the
development instance. Without one, local development still works: the
browser's call files every customer on its own.

## The phone

A Bulgarian **mobile**, stored in E.164 (`+359888123456`). Required: the shop
calls customers about orders.

- **Never verified by SMS** at launch, because verification costs per message.
  It is checked instead against Google's numbering metadata through
  `libphonenumber-js/mobile` (`toBulgarianMobile` in `packages/shared`): a
  landline, a foreign number, a wrong length or a prefix no operator holds is
  refused. Google's BG mobile ranges are `87`–`89` and `98` with seven more
  digits, plus a few eight-digit machine-to-machine ranges (`43x`, `996`, `999`)
  it also files as mobile; we accept its verdict rather than hand-tune it.
- The schema normalises before it validates, so what is checked is exactly what
  is stored, however the customer typed it.
- A mechanic's **business** phone stays looser (`bulgarianPhoneSchema`): a
  business line may be a landline.

## Addresses

`Address` is shaped like the carrier's address (`DeliveryAddressDto`), because
`placeId` is that carrier's settlement id and means nothing to another one. It
is optional at registration; one given there becomes the default. The carrier
is not asked to validate it on save — every quote re-validates the destination.

## Tokens

`JwtGuard` verifies every Clerk session token with `authorizedParties` set to
`CORS_ORIGIN`, so a token Clerk minted for another origin on the same instance
is refused. The mechanic role travels in the token as `publicMetadata.role`,
which needs this claim in the dashboard (**Sessions → Customize session
token**):

```json
{ "publicMetadata": "{{user.public_metadata}}" }
```

The browser sends that token only where a call asks for it — the cart and
`/customers/me` — through `withSession` in `apps/web/src/lib/api/index.ts`.
`SessionTokenBridge` hands Clerk's `getToken` to that module-level client,
because the cart's write queue runs outside React. Server Components send no
session yet: none makes an authenticated read, and `auth()` cannot be called
inside `'use cache'`.

If filing fails with `VALIDATION_ERROR` or `EMAIL_ALREADY_EXISTS`, no retry can
help, and `SessionSync` blocks the page with a notice that offers only signing
out. That is reachable only with tampered metadata or a user created in the
Clerk dashboard.

## Clerk dashboard settings this relies on

Email required and **not verified at sign-up**; password on; first and last name
required; phone, username, passkeys, Web3, MFA and SSO off; bot sign-up
protection on (with no verification it is the main guard against fake
accounts).
