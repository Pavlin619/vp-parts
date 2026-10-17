# The Cart

How the cart is stored, who owns one, what happens when two of them meet, and
what becomes of one that is ordered from.

## The one rule

A cart row stores **intent** — which part, how many, whether it is to be
ordered. It never stores **valuation** — price, stock, delivery date. Every
figure on a cart surface comes from one live batch read
(`GET /catalog/articles-availability`, `no-store`), the same read the buy box
and search use, and the same one checkout will re-run fail-closed before taking
money.

This is the split Amazon, Shopify, commercetools and Medusa all make, and it is
the reason a cart can be persisted at all: intent is small, stable and safe to
keep; valuation is none of those things.

There is exactly one stored number that looks like money —
`CartItem.addedAtPriceIncVat`, the inc-VAT price when the line went in. It is
**never rendered as the price**. It exists so the cart can say "this is €4
dearer than when you added it" beside the live figure. See
`priceChangeOf` in `apps/web/src/lib/cart/cart-totals.ts`.

### The one catalogue fact a line keeps: what the part weighs

`CartItem` also stores the part's weight and packed size (`weightGrams`,
`packageLengthCm`/`WidthCm`/`HeightCm`) and whether they were estimated
(`isShippingEstimated`), so checkout can weigh the cart into a
parcel from the cart read alone, with no TecDoc call per line. This is not
valuation: it changes only with a TecDoc data release, not with stock or price.

- **The API reads it, never the client.** `CartService.addLine` takes it from
  `ShippingProfileResolver`: the supplier catalogue, then `ArticleReadCache` (usually
  cached by the page the part was added from), then the median of the part's
  cross-references, then the weight of the part's product type. The request body cannot supply it, because it decides a delivery
  price. The chain is in [DELIVERY-PROVIDERS.md](./DELIVERY-PROVIDERS.md).
- **`isShippingEstimated` is true when any half came from the cross-references or the product type.** An
  estimate is close enough to price an office parcel on, but not to promise a locker
  cell, so delivery keeps such a parcel out of lockers.
- **So an add reads the catalogue, and can fail on it.** When the supplier catalogue
  lacks a weight or box, a part TecDoc does not
  know is refused `404 ARTICLE_NOT_FOUND`, and an outage `503
  CATALOG_UNAVAILABLE`, both before any cart is minted. Nothing can be sold
  while TecDoc is down, so an add failing with it is accepted.
- **Null means no source files a value**, never "not read yet". A box is used only
  when all three sides are present.
- Re-adding a part refreshes it; a merge carries it with the line.
- It never reaches the wire: `CartLineDto` is unchanged. Delivery reads it
  through `CartService.getShippingLines`. See
  [DELIVERY-PROVIDERS.md](./DELIVERY-PROVIDERS.md).

## Ownership

A cart belongs to a guest (`Cart.token`) or to a customer (`Cart.customerId`),
never both.

Everyone gets a server cart from their first add — there is no browser-only
mode. One store, one code path, and checkout reads what is being bought from
somewhere the browser cannot rewrite.

A cart is minted on the first **write**, never on a read. `GET /cart` with no
token answers `{ id: '', version: 0, lines: [] }` without touching the
database, so a crawler that only browses leaves nothing behind.

### Why the token is a header and not a cookie

`apps/web` is on Vercel and the API on Lightsail, so from the browser's point of
view an API cookie is cross-site: `SameSite=Lax` would never be sent, and
`SameSite=None` is being phased out. The token therefore rides in an
`x-cart-token` request header and lives in `localStorage`
(`apps/web/src/lib/api/cart/cart-token.ts`), which is what headless Shopify
clients do.

The trade-off is that it is not `httpOnly`, so an XSS could read it. Accepted:
the token is 32 random bytes and names one cart, nothing more.

Two things are easy to get wrong here and both fail silently:

- the API must list the header in **`exposedHeaders`** (`apps/api/src/main.ts`),
  or the browser cannot read the token off the response that minted it;
- a token that does not match `^[A-Za-z0-9_-]{43}$` is ignored rather than
  looked up, so a malformed header cannot be used to probe for carts.

Revisit the cookie only if the API ever moves to a subdomain of the shop, where
a `Domain=.<apex>` cookie becomes same-site.

## Merging, at sign-in

`POST /cart/adopt` unites the cart a visitor filled anonymously with the one
their account already held. One transaction, server-side — a merge that can
half-fail loses parts the customer chose, and the customer is the only person
who cannot tell that it happened.

- **No account cart** → the guest cart is claimed: `customerId` set, `token`
  cleared.
- **Both** → a union (`mergeCartLines` in `apps/api/src/cart/cart-merge.ts`).
  Quantities are **summed** and clamped; a line is selected if either side
  wanted it; the account line keeps its reference price, being the older of the
  two. The guest cart becomes `MERGED` and points at where its lines went.

A union, because an addition must never be lost — that is the lesson the Dynamo
paper drew from this exact problem.

**Overflow is a real case.** A cart may hold at most `MAX_CART_LINES` (= 50)
distinct parts, because the whole cart is priced by one availability batch and
that endpoint refuses more. Two carts of 30 do not fit in one. The merge keeps
the account's lines, then the guest's oldest first, and returns the rest as
`droppedLines` so the customer can be told which parts did not make it.

## Expiry

A guest cart's `expiresAt` is pushed 30 days out on every touch, and
`CartService.sweepExpiredGuestCarts` deletes the ones nobody came back to.
Customer carts never expire — following a customer between devices is the whole
reason theirs is on the server.

## What happens when the customer buys

*(Built in `apps/api/src/orders/`. The whole request is in [ORDERS.md](./ORDERS.md).)*

A cart becomes an order by **transition, never deletion**:

1. The checkout page's live reads are the confirmation: availability and the
   delivery quote are both read server-side from the cart, by id. There is no
   separate confirm call.
2. `POST /orders` names the cart and carries back the `cartVersion` the page
   showed and the total it showed. A cart that has moved since is refused
   (`CART_STALE`), and so is a total that no longer matches the live prices
   (`PRICE_CHANGED`), because a price can move without the cart being edited.
   Together they make "the price you agreed to" enforceable rather than advisory.
3. Order creation, in one transaction with the cart row locked: check the cart is
   still `ACTIVE` at that version → copy **only the selected lines** into
   `OrderItem` with `brandId`, `articleNumber` and their price → create the
   `Order`, its first `OrderStatusHistory` and its outbox event → set the cart to
   `ORDERED` and stamp `orderId`.
4. Unselected lines move, still unselected, to a fresh `ACTIVE` cart for the
   same owner. The cart page already lets a customer pick a subset; this is what
   that implies.
5. The cart row is **never deleted**. It is the record of what was bought, and
   it is the idempotency key: a retried `POST /orders` for a cart already
   `ORDERED` by the same owner returns the existing order, two concurrent ones
   serialise on the row lock, and `Order.cartId` being `UNIQUE` lets the database
   itself refuse a second order for one cart. No idempotency header is needed.
6. An order that is refused leaves the cart `ACTIVE` and untouched.

## No stock reservation, ever

Nothing is held when a part goes into a cart. Two reasons, and the first is
decisive:

- The backoffice has **no reservation concept**, and `public.supplier_stock` is
  a projection rebuilt daily by `StockSyncTask`. There is nothing to decrement.
- Reserving on add is the classic mistake regardless: abandoned carts eat the
  inventory of customers who would have bought. Amazon does not do it either.

Safety comes from the fail-closed re-check when the order is placed plus the backoffice's own
re-check after `OrderPlaced`.

## Load

Worth writing down, because the instinct is to reach for a cache that is not
needed.

- **Writes are not the problem.** 10,000 sessions/day × ~6 cart actions ≈
  60,000 writes/day ≈ **0.7 writes/s**, each a single-row upsert on an indexed
  table. Redis write-behind here would trade durability for nothing.
- **`GET /cart`** is one indexed query returning ≤50 rows, and every mutation
  returns the whole cart, so add-to-cart costs no follow-up read.
- **The expensive read already existed**: the uncached availability batch
  against the shared backoffice database. Persisting the cart adds not one call
  to it.
- **The quantity stepper** is the only interaction that could burst, so its
  writes are debounced (`QUANTITY_WRITE_DELAY_MS`) — holding "+" is one write.

The cart is not in Redis. One entity, one store: a Redis flush is a routine
development operation in this repository, and it must not be able to destroy a
customer's cart. Redis stays the escape hatch if guest-cart row volume ever
*measures* badly.

## The browser's copy

`apps/web/src/hooks/use-cart.ts` holds a **mirror** of the server cart in
`localStorage` (`vp-cart-mirror`). The shopper sees their click land at once and
the write follows; `useCartSync` reconciles the mirror with `GET /cart`.

Two details that are not obvious:

- Writes are **queued and sent one at a time**. Not for throughput — a person
  clicks one thing at a time — but for ordering: a slow add answering after the
  removal that followed it would put the line back.
- A refused write re-reads the cart rather than guessing. The exception is a
  refused *first* write: no cart was minted, so a read would answer "empty"
  from the missing token rather than from the server and quietly undo the click.
- Every cart call carries the Clerk session as well as the guest token, so a
  signed-in customer — who holds no token — is still read and written by their
  account. The session is opt-in per call (`apiFetch({ withSession: true })`)
  because an `Authorization` header makes every cross-origin catalog read a CORS
  preflight. Calls wait for Clerk to load (up to `SESSION_WAIT_MS`); asked
  earlier, a signed-in customer would read as a guest and see an empty cart.

### Whose copy it is

The mirror persists `ownerId`: the Clerk user whose account cart it shows, or
null for a guest's. `useSessionSync` (mounted at the root beside `CartSync`)
compares it with the session on every load, not on sign-in and sign-out events,
so a reload, another tab and an expired session all land in the same place:

- **Signed in** — the customer is filed if they have no row yet (see
  [AUTH.md](AUTH.md#registering)). Then, if the device holds a guest token, the
  queued writes settle, `POST /cart/adopt` merges, the token is dropped and the
  merged cart becomes the account's mirror. With no token and a mirror that is
  not yet theirs, the account's cart is read instead. Until that merge lands,
  `CartSync` ignores its own read: the server already answers it with the
  account's cart, and taking it would replace the guest lines the merge (and
  its dropped-lines notice) still needs.
- **Signed out, or another user**, while `ownerId` names someone — the mirror,
  the remembered delivery choice and the cached profile are cleared. A write
  still in flight is discarded when it answers, so the account's lines cannot
  come back on a device that no longer belongs to anyone.
- A guest's own mirror (`ownerId` null) is kept: it is what the next sign-in
  adopts.

Parts the merge dropped (see Merging) stay in the store, not persisted, and
`CartMergeNotice` lists them on the cart page and in the drawer until dismissed.

