# Auth: Clerk accounts and customers

Clerk owns **who someone is** (email, password, names, sessions). Our `Customer`
row owns **what they do with us** (phone, addresses, carts, orders). They are
joined by `Customer.clerkId`, and only `CustomersService` knows that.

## Registering

```
Browser ── useSignUp (email, password, names) ──▶ Clerk      account + session
Browser ── POST /customers/me { phone, address? } ──▶ API
             API ── users.getUser(clerkId) ──▶ Clerk         email + names
             API ── one INSERT: Customer (+ default Address) ──▶ Postgres
```

- **Email and names are read from Clerk, never from the body.** The body
  carries only what Clerk does not hold: the phone and an optional address. The
  DTO refuses `email`/`firstName`/`lastName` outright (`forbidNonWhitelisted`).
- **Safe to retry.** A user already filed is returned unchanged, and two
  concurrent calls resolve to the one row the database let through (the
  `clerkId` unique constraint). A lost response never turns into an error.
- **A Clerk account with no customer row** is possible: the sign-up succeeded and
  `POST /customers/me` never landed. `GET /customers/me` answers
  `404 CUSTOMER_PROFILE_INCOMPLETE`, and the web app asks for the phone again.
  The same path will serve any sign-in method that brings no phone (Google).
- **An email another customer already holds** is `409 EMAIL_ALREADY_EXISTS`.
  Reachable only when a Clerk user was deleted and recreated without our row
  following it.

### Why not the `user.created` webhook

The webhook would create the row asynchronously, seconds after sign-up. It
cannot, because the phone is mandatory and Clerk never sees it; and if it could,
a customer who registers in checkout and orders straight away would race it.
The webhook still has a job — `user.updated` (an email or name changed through
Clerk's account menu) and `user.deleted` (erasure) — and is not built yet.

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
- The DTO normalises before it validates, so what is checked is exactly what is
  stored, however the customer typed it.
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

## Clerk dashboard settings this relies on

Email required and **not verified at sign-up**; password on; first and last name
required; phone, username, passkeys, Web3, MFA and SSO off; bot sign-up
protection on (with no verification it is the main guard against fake
accounts).
