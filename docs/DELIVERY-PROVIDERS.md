# Delivery providers — Econt, and how a cart becomes a parcel

What the courier APIs actually do, measured, and the rules `apps/api/src/delivery/`
is built on. Office delivery only so far; delivery to an address, cash-on-delivery
fees, label creation and Speedy are not built yet.

## The endpoints

| Route | Answers | Cache |
|---|---|---|
| `GET /delivery/offices?carrier=ECONT` | Every Econt office and Econtomat, carrier-neutral (`DeliveryOfficeDto`) | Redis 24 h, in-process 1 h, `public, max-age=3600` |
| `GET /delivery/places?carrier=ECONT` | The settlements a customer can collect a parcel for, each naming its serving office when it has none of its own (`DeliveryPlaceDto`) | Econt's list in Redis 24 h; matched to the offices in-process, 1 h; `public, max-age=3600` |
| `GET /delivery/parcel?carrier=ECONT` | What the requester's **selected** cart lines weigh as one parcel, and whether that carrier's locker takes it | `no-store` |
| `POST /delivery/quote` `{ carrier, officeCode }` | Econt's price for that parcel to that office, the expected date, and the cart version priced | Redis 5 min by carrier, office, weight, box and send date; 20 requests/min per client |

The quote reads the cart on the server. The client sends only the office, never
lines, weights or prices. Order creation must refuse a quote whose `cartVersion` is
not the cart's current version. That check lands with orders.

Both `/parcel` and `/quote` answer `422 CART_EMPTY` when no cart line is selected, so
an empty parcel is never weighed or priced. Every selected part has a weight (measured
or estimated, see [below](#a-part-with-no-weight-of-its-own-is-estimated-from-its-equivalents)),
so `/parcel` always answers a `weightGrams`.

## The office picker in the web checkout

`apps/web/src/components/checkout/delivery/offices/office-picker.tsx` mounts under
"Доставка с куриер до офис". It reads `/delivery/offices`, `/delivery/places` and
`/delivery/parcel`. The quote is read beside it, for the order summary (below).

- **A place comes first, then its offices.** A region dropdown and a settlement search
  sit above the office search. The settlement search covers the whole country, or one
  region once one is chosen. It matches a name or the start of a post code, and shows
  region and post code so that two places with one name can be told apart. Picking a
  place fills in its region.
  - **A region filled in from a place goes with the place.** Only a region the customer
    picked survives clearing the place; otherwise the next search would stay in a
    region they never chose. Choosing a region the place is not in drops the place.
  - **A place lists its own offices, a village's serving office, and every office
    within 15 km,** nearest first. A village's nearest office is usually in the next
    town. Places carry no coordinates, so a place stands at the middle of its offices,
    or at its serving office, which is then marked "Обслужва …".
  - **The picker starts in a place when it can guess one.** In order: the office chosen
    before (its place); then where the request seems to come from; then nothing. A
    saved address will come between the two once accounts exist (T138b in `tasks.md`).
  - **The guess comes from Vercel's geo headers,** read by the site's own
    `GET /api/approximate-location`, since the API runs off Vercel and never sees them.
    It answers only for Bulgaria, and only with a city: without one the database answers
    the middle of the country. The picker takes the place of the nearest office, and
    only if that office is within 25 km. A note says the place is a guess, and any
    choice the customer makes ends it. Off Vercel, locally included, there is no guess.
    **[VERIFY]** How often a Bulgarian mobile connection is placed in Sofia whatever the
    customer's town; the note and a two-click correction are the answer until measured.
  - **With nothing chosen, the list asks for a place.** Typing in the office search
    still searches every office, and the map shows all of them.
  - **A place the search cannot find** gets a pointer to the nearest town or to "Близо
    до мен", since Econt lists only about a fifth of Bulgaria's villages (see below).

- **The list is the control; the map is a second view of it.** Search matches every
  word against city, name, address and post code, so `софия люлин` finds a district.
  The list shows the first 50 matches. The map works for neither keyboard nor screen
  reader, so nothing can be chosen only there.
- **Choosing takes two steps.** Clicking a row or a pin opens that office in place of
  the list — name, address with a Google Maps link, working hours and "Вземи от този
  офис" — and turns its pin brand orange. Only that button picks the office; "Назад" or
  any change to the search returns to the list, scrolled where it was. A pin and its row
  carry the same icon — a parcel for an office, a locker grid for an Econtomat — in the
  carrier's colour (`--carrier-econt`, Econt's own `#234182`), which the clusters share,
  and hovering either one highlights the other.
- **The list is sorted by closeness to a point.** Each row shows its straight-line
  distance, and the map frames the point with the eight offices nearest it. The point
  is one of three things:
  - **The chosen place.**
  - **The office already chosen,** when the customer comes back to change it. The
    browser starts in that office's place, even when the office is a locker the parcel
    no longer fits.
  - **The device's position, after "Близо до мен".** The browser is asked only on that
    click, because a prompt that no click led to is blocked quietly. The position stays
    in the browser and is not stored. It fills in the nearest office's place. A refused
    or failed lookup says so and changes nothing.

  A chip names an office or device point and removes it, which sorts by the place
  again. While the customer types in the office search, the map frames what the search
  finds, not the point.
- **The office search suggests offices anywhere.** Picking one opens it, in its place.
  The only other filter is kind (office or locker). An office shows its working hours,
  not whether it is open right now.
- **A locker is choosable only once `/parcel` says the parcel fits.** While the parcel
  is being weighed, or when that fails, lockers are listed disabled with the reason and
  kept off the map. Staffed offices take any parcel. A parcel with no weight shows the
  "priced by phone" notice.
- **The choice stays in the browser** (`use-checkout-delivery`, `localStorage`): the
  method and `{ carrier, officeCode }`, nothing that names the customer. The API first
  hears of it with the order, which must check it again. A remembered office the carrier
  no longer lists, or a locker the parcel no longer fits, is ignored on arrival.

### The order summary weighs and prices the parcel

`useDeliverySummary` (`hooks/use-delivery-summary.ts`) feeds the summary's weight and
delivery rows from the same `/parcel` read the picker uses (`useParcelCheck`) and from
`/quote`, both keyed by cart and cart version.

- **A quote is asked only for an office delivery with an office chosen and a parcel
  is selected.** There is no unweighed parcel to hold the call back.
- **A refused office asks for another.** `DELIVERY_OFFICE_REFUSED`,
  `DELIVERY_LOCKER_INELIGIBLE` and `DELIVERY_OFFICE_NOT_FOUND` read "Изберете друг офис";
  the picker meanwhile drops a locker the parcel no longer fits. Any other failure reads
  "Не може да се изчисли". A refusal is never retried; an outage is, twice.
- **The total adds the price only once it is quoted,** and says "Без цената на доставката"
  until then. Net and VAT rows describe the goods alone: the quote is VAT-inclusive
  (see the **[VERIFY]** above), so there is no delivery share to split out.
- **Delivery to an address is not priced** until that form exists; its row reads "—".
- **The date is the carrier's `expectedDeliveryDate`,** shown as "Очаквана доставка".

### Map tiles

MapLibre GL with [OpenFreeMap](https://openfreemap.org)'s `positron` style: free,
commercial use allowed, no key, no view limit. Its terms ask only for the OpenStreetMap
attribution, which MapLibre shows. It is one volunteer's service with no SLA, which
is acceptable because the list works without the map. A style that fails to load
replaces the map with a pointer to the list.

- **The fallback is one env value.** `NEXT_PUBLIC_MAP_STYLE_URL` overrides the style.
  To leave OpenFreeMap, serve a Protomaps PMTiles extract of Bulgaria from S3 or R2 and
  point this at its style. Cluster counts are drawn in `Noto Sans Bold`, so a new style
  must serve that font or `LABEL_FONT` in `office-map.tsx` changes with it.
- **Not OSM's own tiles:** their policy lets them withdraw a commercial site without
  notice. MapTiler's and Stadia's free tiers are non-commercial, and Google needs a
  billing account.
- `maplibre-gl` publishes only an ESM entry. The component imports it lazily, so it
  stays out of the checkout bundle, and its spec mocks it as a virtual module.
- **Its worker is served from `public/vendor/maplibre/`.** MapLibre looks for the
  worker beside its own module, which a Turbopack chunk is not. A `new URL(…,
  import.meta.url)` reference emits the worker file but not the
  `maplibre-gl-shared.mjs` it imports. So `scripts/copy-map-worker.mjs` copies both on
  `predev` and `prebuild`, and the map calls `setWorkerUrl`.
- **MapLibre's stylesheet makes its container `position: relative`**, so the container
  is sized with a height, never stretched with `absolute inset-0`, which collapses it
  to 0 px.

## Adding a carrier

Every route goes through the `DeliveryCarrier` port (`delivery-carrier.ts`), and
`DeliveryService` picks the adapter named by the request's `carrier`. A new courier
is a folder beside `econt/` with a class implementing the port, added to the
`DELIVERY_CARRIERS` factory in `DeliveryModule` and to `SUPPORTED_CARRIERS` in
`delivery.dto.ts`. A carrier's `lockerLimits` describe its largest cell, or are `null`
when it has no lockers; the service checks a parcel against them, so eligibility is
per carrier.

## Econt's API

- **JSON over POST:** `{base}/{Service}.{method}.json`, basic auth. OpenAPI spec at
  `https://ee.econt.com/services/openapi.yaml`.
- **Demo:** `https://demo.econt.com/ee/services` with the public shared login
  `iasp-dev` / `1Asp-dev`. You can also register your own at
  `https://login-demo.econt.com/register/`. Production is `https://ee.econt.com/services`
  with our e-Econt account.
- **Errors come back as HTTP 517** with an error tree
  (`{type, message, innerErrors[]}`). The useful message sits several levels down,
  wrapped in blank ones; `EcontTransport` flattens it into the log. Bad credentials
  are 517 too (`Невалидно потребителско име и/или парола.`). A refusal is
  `INTERNAL_ERROR` unless a caller recognises it; `429` is `DELIVERY_UNAVAILABLE`.
- **A refused receiver is named only by a message prefix.** Measured on the demo on
  2026-09-25: an unknown receiver office and an unknown sender office answer the same
  types (`ExInvalidParam` → `ExInvalidCity`), and only the wrapper message differs,
  `получател: ` against `подател: `. `refusesReceiver` reads that prefix, and the quote
  turns it into `422 DELIVERY_OFFICE_REFUSED` so the customer can pick another office.
  A sender refusal is our configuration and stays `INTERNAL_ERROR`.
- **Bodies are checked, not trusted.** `EcontTransport` answers `unknown`; the guards
  in `econt/econt-response.ts` check the fields we read. A quote without a usable
  price, or an office list that is missing or leaves no pickup point, is `503
  DELIVERY_UNAVAILABLE` and is never cached. A single malformed office row is skipped
  and counted in a warning.

### Offices come from production, even in development

- **Production `getOffices` answers without credentials.** On 2026-09-24 it returned
  633 Bulgarian offices: 43 `isAPS` (Econtomat), 23 `isMPS`, and all with coordinates.
  **The demo copy is incomplete:** 586 offices, none flagged APS. That is why
  `ECONT_OFFICES_BASE_URL` defaults to production while `ECONT_BASE_URL` points at the
  demo.
- **MPS (mobile stations) are left out** of our list. They stand somewhere on a
  schedule, which is not a place to send a customer. What remains is 610 rows,
  ~190 KB uncompressed.
- **Econt Drive (`isDrive`) is left out too.** It refuses anything over 20 kg or
  90×90×90 cm (`Пратката Ви може да бъде с тегло до 20 кг, респективно размери до 90 х
  90 х 90 см.`), and a multi-part parcel has no box we could check against that.
  Production has one, Видин (3730), on 2026-09-26.
- **`shipmentTypes` on an office does not say what it accepts.** On the demo, offices
  whose list lacks `cargo` still priced a 60 kg cargo parcel. We do not read it.
- **Opening hours are instants on an arbitrary day** (`normalBusinessHoursFrom/To`,
  `halfDayBusinessHoursFrom/To`). Only the Bulgarian clock time means anything, and
  lockers read 00:00–23:59. `halfDay` is taken to be Saturday: offices read 09:00–15:00
  there, lockers the full day. **[VERIFY]** Confirm with Econt; nothing in the spec
  names the day, and Sunday has no field at all.
- **A closed day is an empty window, never `null`.** Econt sends `From` equal to `To`
  (both 00:00) rather than leaving the fields out; production had no `null` hours on any
  of its 633 offices on 2026-09-27. We read an empty window as closed. The one office
  then was Еконт Точка София Дружба - Книжна борса (10016), closed on Saturday.

### Places come from `getCities`, matched to the office list

`getCities` is a nomenclature too, read from production without credentials. On
2026-09-27 it returned 1,093 Bulgarian places, far fewer than Bulgaria's ~5,250
settlements. **[VERIFY]** Ask Econt why: Бов, Долно Камарци, Нови Хан, Черни Осъм and
even the town Бяла Черква are missing. Until then, a customer whose village is absent
picks the nearest town.

- **A place links to its offices by id.** Each office carries its place in
  `address.city.id`, sent to the web as `placeId`. Match by id, never by name: 1,093
  places share 1,053 names, and two places called Искър are both in Плевен.
- **A village's own office is named in `servingOffices`,** under `servingType:
  "to_office_courier"`. Ясен (Плевен) names Плевен Метро (5817). Of the places we keep
  that have no office of their own, every one names exactly one listed office, and
  none of those is a locker.
- **Most serving offices cannot be collected from.** Econt names mobile stations (the
  `route` half of an MPS code such as `27018@2660`) and 92 codes `getOffices` does not
  list at all, such as 70088 for Иваново (Русе). So the serving office is looked up in
  our own office list, and a place with no office of its own and no listed serving
  office is left out.
- **A place without `regionName` is left out.** The 53 there are holiday areas and
  localities inside a city (`Бяла нива (вилна зона) Сoфия`) and one `Мобилен РЦ`, none
  of them a settlement.
- **Two regions are renamed.** Econt files the capital's region as `София` and the one
  around it as `София Област`; the API answers `София-град` and `Софийска област`, the
  names customers know, so the web shows `region` as it comes.
- **What that leaves,** on 2026-09-27: 485 places, 190 with an office of their own and
  295 served from one nearby. Dropped: 461 whose serving office is not listed, 94 that
  name none, and 53 with no region. The list is ~68 KB uncompressed.
- **Places carry no coordinates** (`location` is always `null`). The web positions a
  place from its offices, or from its serving office.

### `calculate` is the quote

- **`LabelService.createLabel` with `mode: "calculate"` prices a label without
  creating it.** The minimum it accepts is `senderOfficeCode`, `receiverOfficeCode`,
  `shipmentType: "pack"` (the spec's enum is lowercase), `packCount`, `weight` (kg)
  and a payment side. No sender or receiver client is needed until a real label is
  created.
- **Sender pays:** `paymentSenderMethod: "cash"` works on the demo. `"credit"` is
  refused without a contract client number (`Посочили сте грешен клиентски номер за
  платец подател`), so the method is config (`ECONT_SENDER_PAYMENT_METHOD`) and becomes
  `credit` once the contract exists.
- **It answers** `totalPrice`, `currency` (`EUR`), `services[]` and
  `expectedDeliveryDate`. The date is Bulgarian midnight of the delivery day, so we
  pass it on as a `YYYY-MM-DD` date, not an instant.
- **The demo refuses production Econtomat codes** (`получател: Невалиднo населено
  място`), so a locker quote cannot be tried end to end before production credentials.
- **Above 50 kg Econt prices the parcel as `cargo`**, whatever `shipmentType` we
  sent: 50 kg answered `pack`, 50.01 kg `cargo` ("карго-експрес"). Any office took
  it except an Econtomat, which refuses cargo (`Не може да подготвяте карго пратки
  от/до Еконтомат!`), so `ECONT_LOCKER_MAX_WEIGHT_GRAMS` is capped at 50 kg. A quote
  whose answered `shipmentType` differs from the one sent is logged as a warning, as
  is a non-empty `delayedDeliveryWarning`.
- **These office-and-parcel refusals cannot be told from our own mistakes.** They are
  a flat `ExInvalidParam`, the same shape as bad credentials or a bad payer, with no
  `получател:` prefix. So we avoid sending them rather than recognise them, and one
  that slips through stays `INTERNAL_ERROR`.
- **[VERIFY] Whether `totalPrice` includes VAT.** We treat it as VAT-inclusive. The
  cents conversion in `econt-quotes.ts` is the one place to change if not.

### Weight and size both change the price

Demo tariff, office-to-office quotes:

| Parcel | Price |
|---|---|
| ≤ 1 kg | €4.55 |
| ≤ 5 kg | €7.14 |
| ≤ 10 kg | €10.61 |
| > 20 kg | €21.06 |
| 3 kg at 120×40×40 cm | €13.74 ("чрез коефициент заета площ") |
| 2.3 kg from office 1127 to 9035 | €4.13 |

These are from the sender-address and sender-office variants. Contract rates will
differ, so nothing in code holds a price.

### `sendDate` dates the delivery from the day we hand the parcel over

Econt counts its expected date from `sendDate`, and defaults to today without it. The
price does not change with it. Demo, 1127 → 9035, 2 kg, measured 2026-09-26:

| `sendDate` | `expectedDeliveryDate` |
|---|---|
| Fri 25 Sep | Sat 26 Sep. Saturday is a delivery day |
| Sat 26 Sep | Mon 28 Sep |
| Sun 27 Sep | Tue 29 Sep. Sunday counts as handed over on Monday |
| Wed 23 Dec | Sat 26 Dec |
| Thu 24 Dec | Tue 29 Dec. It skips the Christmas days and the 28 Dec substitute |
| Thu 31 Dec | Fri 1 Jan. **[VERIFY]** a public holiday; may be the demo calendar |
| Sun 20 Sep, past | Wed 23 Sep. A past date is accepted, not refused |

A malformed `sendDate` (`2026-09-2x`) is ignored without an error, and the date is
then counted from today.

**We send the day the parcel is ready at the shop**, `parcelReadyDate`: for each
selected line the warehouse its quantity has to reach (`selectWarehouseForQuantity`,
shared with the web), that warehouse's pickup day, and the latest of them. The
warehouse cut-offs and shop calendar behind that day are in
[DELIVERY-LOGIC.md](./DELIVERY-LOGIC.md). When a line cannot be dated, because it is
out of stock or short, the quote still carries a price but no date.
**[VERIFY]** that a parcel ready on a day still reaches Econt that day. A Poland part
ready late in the afternoon may only leave the next morning.

## Parcel weight and size: supplier catalogue, TecDoc, equivalents, then product type

Four sources, read in this order when a part is added to the cart
(`ShippingProfileResolver`). Each half (weight, box) is taken from the first source
that has it. TecDoc is not called at all when the supplier catalogue already knows
both, and equivalents are not asked for when the part's own data has a weight.

1. **`public.supplier_product_catalog`** (backoffice, read-only),
   `SupplierCatalogRepository.findPackageProfile`. Packed kilograms and centimetres from
   the InterCars file, looked up by `(tecdoc_number, tecdoc_supplier_id)`. The 6 M-row
   table already has `idx_spc_tecdoc` on exactly that pair (backoffice migration 040),
   so no index is needed. A part filed by several suppliers has several rows; the one
   with the most measurements wins, so a weight and its box come from one record.
   `NULL` means not measured, never zero. The shop role is granted only the seven columns
   it reads (`infra/db/01-shop-provisioning.sql`, 3c).
2. **TecDoc logistics and article criteria**, below.
3. **The parts that replace it**, when neither knows the weight; see
   [below](#a-part-with-no-weight-of-its-own-is-estimated-from-its-equivalents).

Measured on the InterCars file (2026-09-25): 2,066,290 of 7,043,670 rows have a weight and
1,816,173 a full box. These are *packed* figures, closer to what Econt charges on than
TecDoc's net weight. Example, KNECHT `OX 389/1D` (`tecdoc_supplier_id` 34): 0.068 kg,
12 × 7.5 × 7.5 cm.

**[VERIFY]** that `tecdoc_supplier_id` equals TecDoc's `dataSupplierId` for every brand
and `tecdoc_number` is spelled as TecDoc spells it (exact match, spaces included); a
mismatch misses silently and falls through to TecDoc.

### TecDoc

TecDoc files them in two places on the single-article call we already cache: the
logistics table (`includeArticleLogisticsCriteria`), which describes the *packed* part,
and the article criteria (`includeArticleCriteria`), which are mostly the *bare* part.
Each half is taken from logistics first.

**They are read once, when a part is added to the cart, and stored on the line**
(`CartItem.weightGrams`, `packageLengthCm`/`WidthCm`/`HeightCm`; see
[CART.md](./CART.md#the-one-catalogue-fact-a-line-keeps-what-the-part-weighs)).
Weighing a cart is then one cart read, `CartService.getShippingLines`, with no TecDoc
call and no Redis read per line. That matters because checkout weighs the cart often:
on landing, on every carrier change, and again on every office picked for a quote.
Reading per line at checkout instead cost up to 50 cold TecDoc reads for a cart filled
from search results, whose rows are cached under a different key than the detail read.

| Criterion | Meaning | Unit |
|---|---|---|
| `3852` | нетно тегло | g |
| `683` | тегло | g |
| `2612` | нето тегло | kg |
| `212` | Тегло | kg |
| `1620` / `1621` / `1622` | package length / width / height | cm |
| `3870` (logistics) | packed weight | g |
| `4197` / `4198` / `4199` (logistics) | packed length / width / height | **mm** |

We read `rawValue`, never `formattedValue`. The raw value is a bare number with a
decimal comma or point (`'7,50'`, `'12,00'`, `'0,109'`, measured 2026-09-25), while the
formatted one is for display and has been seen carrying a unit (`47 грам`). A raw
value that is not a bare number is ignored. Weight ids are tried in the order above.
A package size counts only with all three sides.

**Coverage is patchy.** Measured on 2026-09-24 over 100-row free-text samples per
category:

| Category | Weight present | Package size present |
|---|---|---|
| Brake discs | 0% | 0% |
| Shock absorbers | 0% | 0% |
| Bumpers | 0% | 0% |
| Batteries | 0% | 0% |
| Brake pads | 47% (`212`, mostly SAMPA/AUGER) | 0% |
| Exhausts | 17% (`2612`, DINEX) | 0% |
| Oil filters | 3% | 0% |

Package size does exist on some brands: KNECHT `OX 389/1D` carries `3852` and
`1620–1622`.

So the rule is:
1. **Weight:** each line's own weight from TecDoc, × quantity, summed.
2. **Size-coefficient pricing:** the box size is sent to Econt only when the parcel is
   a single unit, where it is exact.
3. **TecDoc down** fails the add to cart as retryable `503 CATALOG_UNAVAILABLE`, so a
   line is never stored unweighed because of an outage. Staff would otherwise be sent
   to measure a part TecDoc describes. Weighing itself never calls TecDoc.

### A part with no weight of its own is estimated from its equivalents

When neither the catalogue nor TecDoc weighs a part, the parts that replace it are
weighed instead: the cross-reference candidate set (the same cached
`tecdoc:crossrefs:*` entry the substitutes tab reads; see
[CROSS-REFERENCES.md](./CROSS-REFERENCES.md)), looked up in the supplier catalogue in
one query (`findPackageProfiles`). `estimateFromEquivalents` takes **the median weight
of every equivalent that has one**, even a single one, rounded up to a gram, and the
median of each box side (sorted longest first) across equivalents with a full box.
It does not know or care what the part is.

A line estimated this way is stored with `isShippingEstimated = true`, and never goes
to a locker (below). An estimate is meant to land in the right Econt price step, not
to be exact: a quote that is a step off costs the shop or the customer a couple of
euros, which the business accepts.

**Measured** on 2026-10-07 over 1,800 random in-stock parts (1,598 listed in TecDoc),
plus a targeted sample of 420 brake discs, shock absorbers and wiper blades. Each
part with its own catalogue weight was estimated from its equivalents alone and
compared with that weight:

| Rule | Parts estimated | Right Econt step | 2+ steps off | Unweighed parts it weighs |
|---|---|---|---|---|
| Median, ≥2 equivalents agreeing 75% on a step, disc-pair rule | 664 | 98.5% | 0% | 335 / 558 |
| **Median of all weighed equivalents (shipped)** | **832** | **96.6%** | **0%** | **434 / 558** |
| Median per piece, using TecDoc's `quantityPerPackage` | 832 | 95.9% | 0.1% | 434 / 558 |
| Median, p75 when p75/p25 > 2 | 832 | 96.3% | 0% | 434 / 558 |

- **Brake discs are not special.** Equivalents mix single discs and two-disc packs, but
  singles are the majority, so the median lands on a single disc: 44 of 45 discs in
  the right step, against 33 of 34 the dedicated pair rule estimated at all.
- **A single equivalent is enough:** right step in 151 of 157 such parts.
- **Most misses sit on a step boundary** (0.98 kg estimated at 1.00 kg). The real
  ones are a cart line that is itself a pair estimated from singles (a 20.5 kg disc
  pair at 10.5 kg). No rule over the equivalents can see that.
- **`quantityPerPackage` is not usable for this.** It is filled on about 90% of
  articles but is almost always `1`, and contradicts the weights where it is not:
  12.3 kg disc pairs filed as 1, 6.2 kg single discs as 2, a spark plug "per 10"
  weighing one plug. Normalising by it made every result worse (30 of 45 discs).

**[VERIFY]** the weight steps (1 / 5 / 10 / 20 kg) used for scoring are the demo
tariff's; check them against the contract tariff.

### The last resort: what the part's product type weighs

A part with no weight of its own and no weighed equivalent (124 of 558 above) gets the
weight of its product type, from the shop-owned `ProductTypeParcelProfile` table, keyed
by the article read's first `genericArticleIds` entry. A line weighed this way is
`isShippingEstimated`, and never goes to a locker. A part whose type has no row, or that
TecDoc gives no type, gets `UNKNOWN_PRODUCT_TYPE_PROFILE`: 960 g and no box, the p75 of
every sample the builder read (2026-10-08 run). Only the missing weight is filled from
the table; a box the part already has is kept. A part TecDoc does not list cannot be added
to the cart at all (`404 ARTICLE_NOT_FOUND`).

Measured over the spike's parts: product-type medians landed in the right Econt step
for 87% (leave-one-out), and cover about 4.3% of parts, stock-weighted.

**Aggregation** (`aggregateProductTypeProfile`): one weighed sample is enough, because a
part of the same type is closer than any default. The weight is the median, or the p75
for a wide type (p75/p25 > 2, from 4 samples up) so a quote errs high. The box is the
median per sorted side.

**The builder** (`npm run parcel-profiles:build` in `apps/api`) fills the table from
TecDoc and our catalogue. It lists the product types of the brands we stock, reads each
small type (up to 1000 articles) in one call, and for each big type reads the 10 brands
our catalogue weighs most, then weighs the articles from `supplier_product_catalog`.
`replaceAll` swaps the table in one transaction after the last type.
- Pace is 1 request per second; the 2026-10-08 run made 13,422 calls in about 3.7 h with
  no retries. It retries `429`, `5xx` and timeouts with doubling waits from 5 s, and stops
  after 3 failures in a row.
- `--resume` continues from the checkpoint file; `--fresh`, `--dry-run`, `--only`,
  `--limit`, `--interval-ms`, `--checkpoint` and `--report` are in `run-arguments.ts`.
- The report (`parcel-profiles-report.json`) lists every type left without a weight,
  largest first. The 2026-10-08 run wrote 4,406 of 8,571 types; the unweighed 4,165 are
  led by exhaust systems (68,822 articles), wheel hubs and windscreens. Filling a bulky
  one by hand needs an override that `replaceAll` keeps, which is not designed yet.
- Run it before launch and off-hours afterwards: the shop's own traffic shares the
  TecDoc key. TecAlliance publishes no rate limit, so ask for the quota on our key.

## Locker eligibility (Econtomat)

A parcel may go to a locker only if every line has a real package size, no line was
estimated from its equivalents, and the set fits the largest cell:
- every unit fits by sides, longest to longest;
- the summed volume is within cell volume × `ECONT_LOCKER_FILL_FACTOR`;
- the weight is within `ECONT_LOCKER_MAX_WEIGHT_GRAMS`.

One estimated line keeps the whole parcel out, so a courier never meets a
box that does not fit. That rules out about 11% of parts, conservative by design.
`fitsLocker` itself only checks geometry and weight; `DeliveryService` adds the
estimation rule. The quote refuses a locker for an ineligible parcel with `422
DELIVERY_LOCKER_INELIGIBLE`.

**[VERIFY] The limits.** A search summary gives the largest cell as 61×44×37 cm with
a 50 kg maximum; Econt's own tariff PDF could not be read to confirm it. The config
defaults to 61×44×37 cm and a conservative 20 kg. The fill factor is our own margin,
not an Econt figure. Confirm the cell and weight with `support_integrations@econt.com`
before launch.

Econt does not check the cell for us. The demo's one Econtomat, `950002` (`Еконтомат
Русе Виртуален`), priced 70×50×40 cm and 49 kg without complaint and refused only
cargo. Whether a production Econtomat refuses an oversized parcel at `create` is the
other question for Econt.
