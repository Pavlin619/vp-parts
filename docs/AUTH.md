# Auth: Clerk accounts and customers

Clerk owns **who someone is** (email, password, names, sessions). Our `Customer`
row owns **what they do with us** (phone, addresses, carts, orders). They are
joined by `Customer.clerkId`, and only `CustomersService` knows that.

## Registering

```
Browser ── signUp.password (email, password, names,
                            unsafeMetadata { phoneNumber }) ──▶ Clerk
Browser ── verifications.sendEmailCode / verifyEmailCode ──▶ Clerk
Browser ── POST /customers/me (no body) ──▶ API                 ─┐
Clerk   ── POST /webhooks/clerk  user.created ──▶ API           ─┤ either, or both
             API ── users.getUser(clerkId) ──▶ Clerk               │ email, names, metadata
             API ── INSERT Customer ──▶ Postgres
```

**Every Clerk account with an email has a customer row.** A row needs only the
Clerk id and the email; names and phone may still be missing (see "Incomplete
profiles"). Clerk's sign-up and our insert are two systems with no shared
transaction, so two paths run the same idempotent filing
(`CustomersService.register`):

- **The browser's `POST /customers/me`**, straight after sign-up. It is what a
  customer who registers in checkout and orders at once relies on: the webhook
  may arrive seconds later, after the order needed the row.
- **The `user.created` webhook** is the guarantee. Clerk retries until we
  answer `2xx`, so a closed tab, a lost response or an API that was down at
  sign-up still ends with a row.

Either may land first, and a webhook can be redelivered; whichever arrives
second finds the row and returns it unchanged. Two concurrent calls resolve to
the one row the database let through (the `clerkId` unique constraint).

**What gets filed comes only from Clerk.** Email and names are Clerk's own
fields; a blank name is filed as `null`. The phone travels in Clerk's
`unsafeMetadata`, which the registration form sets at `signUp.password` — the
only carrier both filing paths can read. It is *unsafe* because the browser can
rewrite it at any time, so the API reads it only when filing, never afterwards,
and validates it with the same shared schema the form uses
(`registrationMetadataSchema`), which files the phone and drops anything else
the browser put there. No metadata (a Google sign-in) files a `null` phone; a
phone that is not a Bulgarian mobile does too, logged at `warn`, since only a
bypassed form leaves one. After filing, our row is the record: a later edit to
the metadata changes nothing, and details are completed or corrected through
`PATCH /customers/me`.

**When filing cannot succeed**, retrying will not help either:

- No email (a user created in the Clerk dashboard without one) →
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

### Incomplete profiles

`isProfileComplete` in `packages/shared` defines it: first name, last name and
phone all present. A customer filed from the registration form is complete from
the start, because the form requires all three. A Google sign-in is not: Google
sends no phone, and a Google account need not have a last name.

An incomplete customer is still a customer — their cart is the account's from
the first sign-in, merged and shared across devices. The details are required
only where they are used:

- **Every route that needs contact details (placing an order, applying as a
  mechanic) must call `CustomersService.requireCompleteProfile` server-side.**
  It answers `422 CUSTOMER_DETAILS_REQUIRED` for an incomplete profile and
  returns the complete one otherwise. The UI's completion step is a
  convenience, never the guard.
- **Every page that needs them renders the completion step** —
  `CompleteProfileContact`, logic in `useCompleteProfile` — which asks only for
  what is missing and saves through `PATCH /customers/me`.

`PATCH /customers/me` sets only the fields it is given (`CompleteProfileBodyDto`
validates each with the same field schema as registration and stores the phone
in E.164), may
overwrite fields already present so an account page can reuse it, and answers
`404 CUSTOMER_PROFILE_INCOMPLETE` for someone not filed yet, as `GET` does.

### The registration form

`/sign-up` and checkout's "Регистрация" tab render our `RegistrationForm`, not
Clerk's `<SignUp/>`, which has no place for the phone. It checks everything
against `registerCustomerSchema` before Clerk is asked, so once Clerk accepts,
filing can fail only on transport. It asks for no address: few would fill one
in before they need it, and checkout asks anyway.

It needs the Clerk instance set up to match (**Configure → User & authentication**):
email and password on, first and last name on **but not required**, Clerk's own
phone field off. Required names would make Clerk stop a Google sign-up without a
last name at `/sign-up/continue`, with no session; the form requires them
itself, so its customers are still filed complete. Bot protection renders into
`<div id="clerk-captcha">`.

**Every email is verified before the account exists.** An order's confirmation
goes to that address, and a cash-on-delivery order placed under someone else's
email would send them our mail. Clerk leaves the sign-up `missing_requirements`
with `email_address` unverified; the form then sends a 6-digit code
(`signUp.verifications.sendEmailCode`) and shows `EmailCodeStep` in place of
the fields, with a resend after a cooldown and a way back to change the email.
Once `verifyEmailCode` succeeds the sign-up is `complete` and `finalize()` runs
as before. A sign-up left incomplete for anything else is shown as a generic
failure and logged. The session goes live only at `finalize()`, so checkout's
tab turns into the signed-in card at the same moment either way, and Clerk
sends `user.created` only after the code. A Google sign-up comes back verified
and never sees the code step.

The filing call sends the fresh session's token explicitly
(`fileCustomer(token)`): straight after `finalize()`, `SessionTokenBridge` may
not have registered the new session yet. If that call fails anyway the form
still completes — the account exists, and the session sync or the webhook files
it. Clerk's error codes are put into Bulgarian in `lib/auth/clerk-errors.ts`;
`bgBG` localizes only Clerk's own components.

### Registering with Google

`RegistrationForm` opens with "Регистрация с Google" (`GoogleSignUpButton`), so
`/sign-up` and checkout's tab both get it. It calls `signUp.sso` with
`oauth_google`; of its two URLs, `redirectCallbackUrl` is where Google comes back
(`/sign-up/sso-callback`) and `redirectUrl` is the final destination — the
panel's `redirect_url`, or `/checkout` from checkout, kept on this site by
`sameOriginPath`. The callback URL carries the destination too, because the
page that finishes the flow decides where to go.

`/sign-up/sso-callback` renders `SignUpSsoCallback`, a wrapper around Clerk's
`HandleSSOCallback` (the signals-API counterpart of `signUp.sso`;
`AuthenticateWithRedirectCallback` belongs to the older `authenticateWithRedirect`).
With names not required, a new Google user always ends with a session there; a
Google account that already exists is transferred to a sign-in. A flow that needs
more (a factor, a failed bot check) is sent to `/sign-in` or `/sign-up` with the
same `redirect_url`. A flow `HandleSSOCallback` cannot place — cancelled at
Google, or the page opened with no flow at all — gets no navigation from it, so
after a few seconds the page offers a link back to `/sign-up`. The customer is then filed by the session sync, perhaps
incomplete, and checkout asks for what is missing — the same path as signing in
with Google below.

`/sign-up` stays a plain route, not Clerk's catch-all: nothing of Clerk's is
mounted under it, so `sso-callback` is its own static segment.

### Signing in with Google

Clerk's `<SignIn/>` creates a Clerk user for someone new without asking for a
phone, and perhaps with no last name. The session sync files them at once, with
those left `null`, and then claims the guest cart as it would for anyone. Checkout's
contact panel sees an incomplete profile and shows `CompleteProfileContact` in
place of the contact card; once saved, the profile query holds the complete
profile and the panel turns into the ordinary card. No dialog interrupts other
pages: the details are needed only to order.

```
Browser ── POST /customers/me ──▶ API   201 { lastName: null, phoneNumber: null }
Browser ── POST /cart/adopt ──▶ API     guest cart becomes the account's
Panel   ── PATCH /customers/me { lastName?, phoneNumber } ──▶ API   200 complete
```

The panel validates with `completeProfileSchema`, so saving can fail only on
transport, which it lets the customer retry. A customer who leaves is asked
again the next time they reach checkout, on any device.

Two things make the return from Google land on that step:

- Clerk turns a first SSO sign-in into a sign-up, which follows the **sign-up**
  redirect, not the sign-in one. Checkout's `<SignIn/>` therefore sets
  `signUpForceRedirectUrl` as well as `forceRedirectUrl`; without it a new
  customer is sent to `/`.
- Clerk comes back to `/checkout#/sso-callback`, which only its `<SignIn/>` can
  finish, and that is mounted only on the "Вход" tab. Checkout opens on that tab
  whenever the URL holds one of Clerk's hash routes (`initialContactMode`);
  otherwise no tab is preselected. The completion step does not depend on the
  tab: signed in, the panel shows it whatever was picked.

### The webhook endpoint

`POST /webhooks/clerk` is public; `ClerkWebhooks` verifies Clerk's signature
over the raw request body (Nest runs with `rawBody: true`) with
`CLERK_WEBHOOK_SECRET`, and a request that fails is `400`. `user.created` runs
the idempotent filing: for someone already filed it is one read and nothing
changes. Every other event is accepted and ignored — `user.updated` has nothing
to file, since filing needs nothing Clerk could add later (an email or name
changed through Clerk's account menu is not copied yet), and `user.deleted`
(erasure) waits until it is built.

Set it up in the dashboard under **Configure → Webhooks**: endpoint
`https://<api host>/webhooks/clerk`, event `user.created`, and copy the signing
secret (`whsec_…`) into `CLERK_WEBHOOK_SECRET`. To receive it locally, expose
the API through a tunnel (`ngrok http 3001`) and register that URL on the
development instance. Without one, local development still works: the
browser's call files every customer on its own.

## The phone

A Bulgarian **mobile**, stored in E.164 (`+359888123456`). Required to order
(the shop calls customers about orders), though not to be filed — see
"Incomplete profiles".

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

Signed out, it offers two tabs: "Вход" mounts Clerk's `<SignIn routing="hash"/>`
with its own sign-up link hidden (the "Регистрация" tab sits beside it), and
"Регистрация" mounts `RegistrationForm`. A third, "Бърза поръчка", takes a name
and a phone; it is hidden behind `IS_QUICK_ORDER_OFFERED` (`contact-modes.ts`)
until the guest order has its own design (ORDERS.md → "Later"). Signed in, it shows the profile's name, email and phone with a way to
sign out — or, for an incomplete profile, the completion step. While the
session sync is still filing a new customer, the profile read answers
`CUSTOMER_PROFILE_INCOMPLETE`; the card shows its skeleton until the filed
profile lands in the same query.

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
help: the session sync records it in `useAccountSetupStore`, and the panel says
so (`AccountSetupFailedContact`) and offers signing out. That is reachable only
with a user created in the Clerk dashboard or an email another customer holds.

## Clerk dashboard settings this relies on

Email required and **verified at sign-up with an email code**, not a link (the
form has no link flow, and a link opened on another device would strand
checkout); password on; first and last name on but **not required** (see "The
registration form"); SSO with Google on and Facebook off; phone, username,
passkeys, Web3 and MFA off; bot sign-up protection on. The "Verification code"
email template is written in Bulgarian and keeps `{{otp_code}}`. Webhook:
`user.created` only. On the production instance, the shop's domain must be an
allowed redirect origin so Google can return to `/sign-up/sso-callback` and the
destination after it, Clerk's email DNS records (**Configure → Domains**) must
be verified so codes are not sent from Clerk's domain into spam, and test mode
must be off.

On the development instance, test mode lets an address with `+clerk_test`
(`ivan+clerk_test@example.com`) sign up with the code `424242`, and no email is
sent.
