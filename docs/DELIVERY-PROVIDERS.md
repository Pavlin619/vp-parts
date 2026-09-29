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
an empty parcel is never weighed or priced. When a selected part has no known
weight, `/parcel` answers `weightGrams: null` and names the parts in
`unmeasuredArticles`, and `/quote` answers `422 DELIVERY_PARCEL_UNMEASURED` (see
[below](#a-part-with-no-weight-is-not-guessed)).

## The office picker in the web checkout

`apps/web/src/components/checkout/delivery/offices/office-picker.tsx` mounts under
"Доставка с куриер до офис". It reads `/delivery/offices`, `/delivery/places` and
`/delivery/parcel`, and does not quote yet.

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

## Parcel weight and size come from TecDoc, and mostly are not there

The backoffice stores no dimensions. TecDoc files them as article criteria, read on
the single-article call we already cache (`includeArticleCriteria`, so no new flag).

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

### A part with no weight is not guessed

There is no per-category or global default weight. A default was tried and dropped:
two parts in one category differ too much in weight and size (a small and a large
brake disc, a bumper with or without its grille), so a default misquotes in both
directions and we cannot tell which way.

Instead, a parcel holding any part with no weight is **unmeasured**. A part TecDoc
does not list cannot be added to the cart at all (`404 ARTICLE_NOT_FOUND`). The checkout tells the customer that delivery will be priced
by phone. Staff measure the part in the warehouse, call with the price, and record
the measurement so the part is known next time. Where that measurement is stored, and
how an order is placed with an open delivery price, land with orders.

### InterCars package data — the next source

The InterCars ProductInformation file carries packed weight and box size per part.
A local copy is in the `intercars` database, table `intercars_product_information`
(measured 2026-09-25):

| Column | Unit | Example (KNECHT `OX 389/1D`) |
|---|---|---|
| `PACKAGE_WEIGHT` | kg, decimal comma | `0,068` |
| `PACKAGE_LENGTH` / `_WIDTH` / `_HEIGHT` | cm, decimal comma | `12,0` / `7,5` / `7,5` |
| `TEC_DOC_PROD` | TecDoc `dataSupplierId` (BOSCH = 30) | `34` |
| `TEC_DOC` | TecDoc article number | `OX 389/1D` |

Of 7,043,670 rows, 2,066,290 have a weight and 1,816,173 a full box. These are
*packed* figures, closer to what Econt charges on than TecDoc's net weight, so when
added they should be read before TecDoc, at the same moment: when a part is added to
the cart. **[VERIFY]** that `TEC_DOC_PROD` equals
`dataSupplierId` for every brand, not just the samples checked; if it does not, the
lookup misses silently. The backoffice already imports this file into
`supplier_product_catalog` but drops the package columns.

## Locker eligibility (Econtomat)

A parcel may go to a locker only if every line has a real package size, and the set
fits the largest cell:
- every unit fits by sides, longest to longest;
- the summed volume is within cell volume × `ECONT_LOCKER_FILL_FACTOR`;
- the weight is within `ECONT_LOCKER_MAX_WEIGHT_GRAMS`.

One unmeasured line keeps the whole parcel out, so a courier never meets a box that
does not fit. The quote refuses a locker for an ineligible parcel with `422
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
