# Auth: Clerk accounts and customers

Clerk owns **who someone is** (email, password, names, sessions). Our `Customer`
row owns **what they do with us** (phone, addresses, carts, orders). They are
joined by `Customer.clerkId`, and only `CustomersService` knows that.

## Registering

```
Browser ── signUp.password (email, password, names,
                            unsafeMetadata { phoneNumber }) ──▶ Clerk
Browser ── POST /customers/me (no body) ──▶ API                 ─┐
Clerk   ── POST /webhooks/clerk  user.created ──▶ API           ─┤ either, or both
             API ── users.getUser(clerkId) ──▶ Clerk               │ email, names, metadata
             API ── INSERT Customer ──▶ Postgres
```

**No Clerk account may end up without a customer row.** Clerk's sign-up and our
insert are two systems with no shared transaction, so two paths run the same
idempotent filing (`CustomersService.register`):

- **The browser's `POST /customers/me`**, straight after sign-up. It is what a
  customer who registers in checkout and orders at once relies on: the webhook
  may arrive seconds later, after the order needed the row.
- **The `user.created` and `user.updated` webhooks** are the guarantee. Clerk
  retries until we answer `2xx`, so a closed tab, a lost response or an API that
  was down at sign-up still ends with a row. `user.updated` is what files an SSO
  user once they have given their phone (see below).

Either may land first, and a webhook can be redelivered; whichever arrives
second finds the row and returns it unchanged. Two concurrent calls resolve to
the one row the database let through (the `clerkId` unique constraint).

**What gets filed comes only from Clerk.** Email and names are Clerk's own
fields. The phone travels in Clerk's `unsafeMetadata`,
which the registration form sets at `signUp.password`, and checkout's phone
step through `user.updateMetadata` — the only carrier both paths can read. It
is *unsafe* because the browser can rewrite it at any time,
so the API reads it only when filing, never afterwards, and validates it with
the same shared schema the form uses (`registrationMetadataSchema`), which
files the phone and drops anything else the browser put there. After filing,
our row is the record: a later edit to the metadata changes nothing.

**When Clerk holds no valid phone** — no metadata, or a phone that is not a
Bulgarian mobile → `422 CUSTOMER_PHONE_REQUIRED`. That is every first sign-in
through Google or Facebook, so it is not a failure: the browser asks for the
phone (below), and the webhook logs it at `warn` and answers `200`.

**When filing cannot succeed**, retrying will not help either:

- No email or names (a user created in the Clerk dashboard without them) →
  `422 VALIDATION_ERROR`. Checkout's contact panel tells the customer to contact
  us, or to sign out and order as a guest.
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
Clerk's `<SignUp/>`, which has no place for the phone. It checks everything
against `registerCustomerSchema` before Clerk is asked, so once Clerk accepts,
filing can fail only on transport. It asks for no address: few would fill one
in before they need it, and checkout asks anyway.

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

### Signing in with Google or Facebook

Clerk's `<SignIn/>` creates a Clerk user for someone new without asking for a
phone, so filing them answers `CUSTOMER_PHONE_REQUIRED`. The session sync then
records `phone-required` in `useAccountSetupStore` instead of carrying on.
Checkout's contact panel reads it and shows who signed in with a phone field in
place of the contact card (`CompleteProfileContact`, logic in
`useCompleteProfile`); once saved, the panel turns into the ordinary card. No
dialog interrupts other pages: the phone is needed only to order, and until
then the API treats the unfiled account's cart as a guest's.

```
Browser ── POST /customers/me ──▶ API   422 CUSTOMER_PHONE_REQUIRED
Panel   ── user.updateMetadata (unsafeMetadata { phoneNumber }) ──▶ Clerk
Clerk   ── POST /webhooks/clerk  user.updated ──▶ API              ─┐ either, or both
Panel   ── POST /customers/me ──▶ API                               ─┘
Panel   ── resume() ──▶ session sync merges or loads the cart
```

The panel validates with `registrationMetadataSchema`, so filing after it can
fail only on transport, which it lets the customer retry. An account no retry
can file is handed back to the session sync, and the panel then shows
`AccountSetupFailedContact`. Nothing is filed until the phone is given; a
customer who leaves is asked again the next time they reach checkout.

Two things make the return from Google land on that step:

- Clerk turns a first SSO sign-in into a sign-up, which follows the **sign-up**
  redirect, not the sign-in one. Checkout's `<SignIn/>` therefore sets
  `signUpForceRedirectUrl` as well as `forceRedirectUrl`; without it a new
  customer is sent to `/`.
- Clerk comes back to `/checkout#/sso-callback`, which only its `<SignIn/>` can
  finish, and that is mounted only on the "Вход" tab. Checkout opens on that tab
  whenever the URL holds one of Clerk's hash routes (`initialContactMode`);
  otherwise the visitor stays signed out on "Бърза поръчка".

### The webhook endpoint

`POST /webhooks/clerk` is public; `ClerkWebhooks` verifies Clerk's signature
over the raw request body (Nest runs with `rawBody: true`) with
`CLERK_WEBHOOK_SECRET`, and a request that fails is `400`. `user.created` and
`user.updated` both run the same idempotent filing: for someone already filed it
is one read and nothing changes (an email or name changed through Clerk's account
menu is not copied yet). `user.deleted` (erasure) is accepted and ignored until
it is built.

Set it up in the dashboard under **Configure → Webhooks**: endpoint
`https://<api host>/webhooks/clerk`, events `user.created` **and
`user.updated`** (without the second, an SSO customer whose browser call is lost
after giving a phone stays unfiled until their next visit), and copy the signing
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
`placeId` is that carrier's settlement id and means nothing to another one.

Registration asks for none. A customer's addresses will be recorded from the
orders they have delivered to a door, and the most recent one offered first at
their next checkout — task T091c, built with the order endpoint. Until then no
`Address` row is written and checkout starts every customer at an empty form.

## Checkout's contact panel

Signed out, it offers three tabs: "Вход" mounts Clerk's `<SignIn routing="hash"/>`
with its own sign-up link hidden (the "Регистрация" tab sits beside it),
"Регистрация" mounts `RegistrationForm`, and "Бърза поръчка" takes a name and a
phone. Signed in, it shows the profile's name, email and phone with a way to
sign out. While the session sync is still filing a new customer, the profile
read answers `CUSTOMER_PROFILE_INCOMPLETE`; the card shows its skeleton until
the filed profile lands in the same query.

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

If filing fails with `CUSTOMER_PHONE_REQUIRED`, checkout's contact panel asks
for the phone (see "Signing in with Google or Facebook"). If it fails with
`VALIDATION_ERROR` or `EMAIL_ALREADY_EXISTS`, no retry can help, and the panel
says so and offers signing out. That is reachable only with a user created in
the Clerk dashboard or an email another customer holds.

## Clerk dashboard settings this relies on

Email required and **not verified at sign-up**; password on; first and last name
required; SSO with Google and Facebook on; phone, username, passkeys, Web3 and
MFA off; bot sign-up protection on (with no verification it is the main guard
against fake accounts).
