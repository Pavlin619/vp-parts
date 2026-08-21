# API Contracts: Autoparts Shop NestJS API

**Branch**: `002-autoparts-shop-spec` | **Date**: 2026-06-05

Base URL: `https://api.vpparts.bg` (production) / `http://localhost:3001` (local dev)

All request and response types are defined in `packages/shared/src/dto/`. All error responses conform to `ApiErrorResponse` from `packages/shared/src/errors.ts`: `{ statusCode: number, errorCode: AppErrorCode }`.

**Authentication**: Clerk-issued Bearer JWT in `Authorization` header on all protected endpoints. Public endpoints are marked `[PUBLIC]`. Internal endpoints (called by the Spring Boot backoffice) use a shared-secret bearer token (`INTERNAL_API_TOKEN`) and are only reachable from the Lightsail private network.

> **Money convention**: All monetary values in requests and responses are **integer EUR cents**. `1500` = €15.00. The frontend uses `formatPrice(cents)` from `@vp-parts-shop/shared` for all display formatting. The backend never returns floats or decimal strings for monetary fields.

---

## Catalog Module

### Manufacturers

**`GET /catalog/manufacturers`** `[PUBLIC]`

Returns all available vehicle manufacturers for the selected country (BG).

Response `200`:
```json
[
  { "id": "16", "name": "Volkswagen" },
  { "id": "5", "name": "BMW" }
]
```
Cache: Redis, 7 days.

---

### Model Series

**`GET /catalog/manufacturers/:manufacturerId/model-series`** `[PUBLIC]`

Returns model series for a specific manufacturer.

Path params: `manufacturerId` — TecDoc manufacturer ID

Response `200`:
```json
[
  { "id": "16_2", "manufacturerId": "16", "name": "Golf" },
  { "id": "16_3", "manufacturerId": "16", "name": "Passat" }
]
```
Cache: Redis, 7 days.

---

### Vehicle Variants

**`GET /catalog/model-series/:seriesId/variants`** `[PUBLIC]`

Returns year/engine variants for a model series.

Response `200`:
```json
[
  {
    "vehicleId": "V10042",
    "seriesId": "16_2",
    "name": "Golf VII",
    "yearFrom": 2012,
    "yearTo": 2020,
    "engine": "2.0 TDI",
    "powerKw": 110,
    "fuelType": "Diesel",
    "bodyType": "Hatchback"
  }
]
```
Cache: Redis, 7 days.

---

### Assembly Groups (Categories)

**`GET /catalog/vehicles/:vehicleId/categories`** `[PUBLIC]`

Returns the top-level assembly group tree for the selected vehicle. Only groups that have at least one compatible article are returned.

Response `200`:
```json
[
  { "id": "1001", "name": "Brakes", "parentId": null },
  { "id": "1002", "name": "Engine", "parentId": null },
  { "id": "2001", "name": "Brake Discs", "parentId": "1001" }
]
```
Cache: Redis, 7 days.

---

### Article Listing

**`GET /catalog/vehicles/:vehicleId/categories/:categoryId/articles`** `[PUBLIC]`

Returns the **cacheable catalog metadata** (TecDoc) for all articles compatible
with the vehicle in the given assembly group. It carries **no** live inventory:
the grid caches this and hydrates it with a separate live availability read
(`GET /catalog/articles-availability` below), mirroring the article detail page's
cached-metadata / live-availability split so a cached page never serves a stale
delivery date. Shape: `PaginatedCatalogArticlesDto`.

Query params:
- `page` (default 1), `pageSize` (default 20, max 50)

Response `200`:
```json
{
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "items": [
    {
      "articleNumber": "WL6340",
      "brandId": "268",
      "brandName": "WIX",
      "description": "Oil Filter",
      "thumbnailUrl": "https://cdn.example.com/img/WL6340.jpg"
    }
  ]
}
```

---

### Bulk Availability

**`GET /catalog/articles-availability?numbers=WL6340,OC123`** `[PUBLIC]`

Live, never-cached (`Cache-Control: no-store`) price/availability for a batch of
article numbers, keyed by number. The cached listing grid calls this per request
to hydrate its metadata rows with fresh price + per-warehouse delivery data, and
it is the single availability read every list surface (grid, search, substitutes)
shares. **Fails closed**: a stock-DB read error returns `503` /
`INVENTORY_UNAVAILABLE` so a whole grid never renders as falsely out of stock.
A requested number with genuinely no stock resolves to `available: false` and is
still present in the map. Shape: `ArticlesAvailabilityDto`
(`Record<string, ArticleInventoryDetailDto>`).

Response `200`:
```json
{
  "WL6340": {
    "available": true,
    "bestPriceExVat": 1250,
    "bestPriceIncVat": 1500,
    "availabilityByWarehouse": [
      { "warehouseId": "CENTRAL", "quantity": 6, "deliveryWorkDays": 0, "orderCutoffTime": "18:00", "cutoffAt": "…", "pickup": { "earliestAt": "…", "granularity": "HOUR" }, "courier": { "earliestAt": "…", "granularity": "DAY" } }
    ],
    "computedAt": "2026-07-05T09:00:00.000Z"
  }
}
```

---

### Article identity

A TecDoc article number is **not** unique: two data suppliers can file the same
one for different parts. An article is identified by `(brandId, articleNumber)`,
where `brandId` is TecDoc's `dataSupplierId` — the same id `GET /catalog/brands`
is keyed by, carried on every article row as `brandId`.

This splits the article routes in two, and the split is deliberate rather than a
naming inconsistency:

- Endpoints that **resolve one specific part** are nested under the brand:
  `/catalog/brands/:brandId/articles/:articleNumber…`. Without the brand the
  lookup returns whichever supplier the catalogue sorted first, so the response
  can describe a different company's part.
- Endpoints that **search by a number** stay flat at
  `/catalog/articles/:articleNumber/…`. Cross-reference (comparable-number)
  lookups take a number as their query, not as an identity, and answer with
  parts from every brand; adding a brand segment would narrow the answer to the
  one brand the caller already has.

---

### Article Detail

**`GET /catalog/brands/:brandId/articles/:articleNumber`** `[PUBLIC]`

Full article detail. Includes cross-references, images, specs, compatible vehicles.

Path params:
- `brandId` — TecDoc `dataSupplierId`. Required: see *Article identity* above. A
  non-numeric value is a `400` / `VALIDATION_ERROR`.

Query params:
- `vehicleId` (optional) — if provided, adds `fitsVehicle: boolean` to the response.
- `include` (optional, default `details,availability`) — selects which halves to assemble:
  - `details` — stable TecDoc catalog metadata (cacheable, carries `fitsVehicle`);
  - `availability` — live price/stock (never cached; skips the TecDoc lookup);
  - `details,availability` — both, in one round trip.

  The frontend fetches `details` for the cached page shell and `availability`
  for the streamed buy box. This is the single availability read for all
  clients — there is no separate inventory endpoint.

Response `200`:
```json
{
  "articleNumber": "WL6340",
  "brandId": "268",
  "brandName": "WIX",
  "description": "Oil Filter, Manual Transmission",
  "images": ["https://cdn.example.com/img/WL6340-1.jpg"],
  "technicalSpecs": [
    { "key": "Height (mm)", "value": "87" },
    { "key": "Outer Diameter (mm)", "value": "76" }
  ],
  "oemNumbers": [
    {
      "articleNumber": "06L115561",
      "manufacturerName": "VW",
      "interchangeability": null
    },
    {
      "articleNumber": "06L115562",
      "manufacturerName": "AUDI",
      "interchangeability": "Interchangeable, but different scope of supply"
    }
  ],
  "fitsVehicle": true,
  "available": true,
  "bestPriceExVat": 1250,
  "bestPriceIncVat": 1500,
  "availabilityByWarehouse": [
    {
      "warehouseId": "CENTRAL",
      "quantity": 4,
      "deliveryWorkDays": 0,
      "orderCutoffTime": "18:00",
      "cutoffAt": "2026-06-25T15:00:00.000Z",
      "pickup": { "earliestAt": "2026-06-25T08:00:00.000Z", "granularity": "DAY" },
      "courier": { "earliestAt": "2026-06-26T10:00:00.000Z", "granularity": "DAY" }
    }
  ],
  "computedAt": "2026-06-25T07:00:00.000Z"
}
```

Note: a single locked sell price (`bestPriceExVat` / `bestPriceIncVat`) is returned for all callers — there are no role-specific trade-price fields (per-mechanic discounts are applied separately later). Availability is expressed entirely by `available` plus the per-warehouse `availabilityByWarehouse` breakdown (quantity + pickup/courier dates); there is no `stockStatus` or `estimatedDeliveryDays` field — the frontend derives the delivery label per warehouse from the breakdown. All price fields are integer EUR cents.

Cache: catalog metadata (TecDoc) is Redis-cached 24h under a brand-scoped key
(`tecdoc:article-detail:{brandId}:{articleNumber}:{vehicleId|none}`), so two
brands sharing a number never share an entry; price/availability is read live
from the shared DB per request and embedded into this response.

---

### Alternative Numbers

**`GET /catalog/articles/:articleNumber/alternative-numbers`** `[PUBLIC]`

The numbers other parts brands sell the same article under. Its **own** endpoint
because, unlike the OE numbers it is displayed beside, no list response carries
them: TecDoc only resolves them through a comparable-number search. The
alternative-numbers section of a catalog row fetches this when a visitor opens
it, so an unopened section costs nothing. Shape: `AlternativeNumberDto[]`.

Keyed on the number alone — see *Article identity* above. Rows are deduplicated
on each result's own `(brandId, articleNumber)`, so two brands answering with the
same number are kept as the two cross-references they are.

This is the same TecDoc comparable-number set that backs
`GET /catalog/articles/:articleNumber/substitutes` (`getArticles`,
`searchType: 3`), projected down to number + brand and sharing one Redis entry —
opening either surface warms the other. The section renders chips, so the
substitutes' catalog metadata (description, thumbnail, specs) is deliberately
projected away rather than shipped to every expanded row. Capped at 20 numbers
(`SUBSTITUTES_LIMIT`); a part with no cross-references is a `200` with `[]`.

Response `200`:
```json
[
  { "articleNumber": "OC 115", "brandName": "MANN-FILTER" },
  { "articleNumber": "WL7090", "brandName": "WIX Filters" }
]
```

Cache: Redis, 24h on a hit / 1h on an empty result — shared with the substitutes
endpoint (key `tecdoc:substitutes:{articleNumber}`).

---

### Substitutes

**`GET /catalog/articles/:articleNumber/substitutes`** `[PUBLIC]`

The same cross-references as the endpoint above, as whole catalog rows rather
than numbers: identity, brand, description, thumbnail and specs, so the
substitutes section of a catalog row can render each one as a row a visitor can
price and buy. Shape: `ArticleSummaryDto[]` — the same row shape the listing and
search return, so every list surface shares one row component.

Keyed on the number alone, and capped at 20 (`SUBSTITUTES_LIMIT`), for the same
reasons as *Alternative Numbers*. A part with no cross-references is a `200`
with `[]`.

Catalog metadata only — **no** price or stock, like every other cacheable
catalog read. The section hydrates the rows client-side through
`GET /catalog/articles-availability?numbers=…`, so a substitute's delivery date
is never served from a cache. Vehicle-independent by design: if the viewed part
fits the selected vehicle then its comparables do too, so no per-substitute fit
check is made.

Response `200`:
```json
[
  {
    "articleNumber": "OC 115",
    "brandId": "77",
    "brandName": "MANN-FILTER",
    "brandLogoUrl": "https://cdn.example.com/brands/77.png",
    "description": "Маслен филтър",
    "thumbnailUrl": "https://cdn.example.com/img/OC115.jpg",
    "technicalSpecs": [{ "key": "Височина", "value": "79 mm" }],
    "oemNumbers": [],
    "fitsVehicle": null
  }
]
```

Cache: Redis, 24h on a hit / 1h on an empty result — one entry shared with the
alternative-numbers endpoint (key `tecdoc:substitutes:{articleNumber}`), so
opening either section warms the other.

---

### Applicable Vehicles

Two sibling endpoints disclosing the vehicles an article fits: the makes, then
every vehicle of one make. A common service part is linked to thousands of
modifications, so the section opens with makes alone and hydrates one make at a
time. An unopened section costs nothing, and an opened make costs one response.

Both are brand-scoped, because linkages are per part: see *Article identity*
above. Reading `OX 982D` under the wrong brand lists the other supplier's
vehicles. Both start the same way — brand + number has to resolve to the
article's `legacyArticleId`s, cached on a key of their own. A brand/number pair
TecDoc does not know is a `404` / `ARTICLE_NOT_FOUND`; a part with no catalogued
linkages is a `200` with `[]`.

That lookup is normally already answered. The catalog listing is an `includeAll`
read, so every row it returns carries its own `genericArticles` — and with them
the `legacyArticleId`s — which the listing pins onto the same memo key as it
maps the page. A visitor who reaches the section through the catalog therefore
opens it without any `getArticles` of its own; `getLegacyArticleIds` remains as
the fallback for a part reached some other way. Rows TecDoc files no generic
article against are skipped rather than pinned as an empty list, so "no roles"
keeps the shorter miss TTL the read path gives it.

The TecDoc chain is the one the Functions guide documents under *Article direct
search → "Find linked vehicles, motors, axles and linked vehicle, motor, axle
details"*: `getArticleLinkedAllLinkingTargetManufacturer2` for the makes, then
`getArticleLinkedAllLinkingTarget4` (scoped with `linkingTargetManuId`) for the
linkage target ids, then a hydration call to turn those ids into rows. The
hydration response carries `modId` and `modelName` on every row, so the
model-series grouping is done here rather than asked of TecDoc separately —
which is why a series can carry its vehicles instead of a count that might
disagree with them.

For that third step the guide names `getArticleLinkedAllLinkingTargetsByIds3`
and we use **`getVehicleByIds4` instead**, deliberately. The recommended
function is article-scoped, which is genuinely nicer, but its record
(`ArticleLinkedVehiclesById2Record`) files neither fuel type nor motor codes —
two of the five columns the section shows — and its rows are keyed per
article-link rather than per vehicle, so they could not be cached across the
articles that share a vehicle. It also brings no relief on request size: its
Service Index entry caps `linkedArticlePairs` at 25 items, exactly as
`getVehicleByIds4` caps `carIds` at "List of Vehicle ID's (max 25)". Batching is
required either way.

So hydration splits a make into batches of 25 and merges them in the order the
ids were given. A batch that fails fails the whole read: a part fits every
vehicle on its list or the list is wrong, and a partial answer is
indistinguishable on screen from a part that fits fewer cars. The layer warns
when fewer vehicles come back than were asked for — ordinary on its own, since
TecDoc retires vehicles, but the only signal that a make is quietly listing
short.

At most four of those batches travel at once, and that limit lives here rather
than in `TecDocTransport`. Hydration is the only read in the catalogue that fans
out — every other one is a call or two — so it is the only read with anything to
pace. A process-wide cap was tried and removed: TecAlliance publishes no rate
limit, so any figure is a guess, and a cap has to queue what it holds back. That
queue then needs a deadline of its own or a slow TecDoc becomes unbounded
latency; and that deadline sheds ordinary single-call reads as `CATALOG_UNAVAILABLE`
as soon as more visitors browse at once than the guessed cap allows, while a wide
make sheds its own tail waiting behind itself. If TecAlliance ever starts
rejecting us, a transport-level cap is the answer, sized to what they tell us.

Every call still carries its own deadline (`TECDOC_TIMEOUT_MS`, 10 s), which
covers the body read as well as the connection.

Hydrated vehicles are then cached per `carId`, not per article. A vehicle record
belongs to no part — it is TecDoc master data — so the twenty brake pads on one
category page all resolve the same E90 modifications, and keying them by article
would buy the same rows twenty times. Only the ids with no memo are sent, and the
list is rebuilt from the ids afterwards so a cached row keeps its position. A
`carId` TecDoc no longer holds is simply never memoised and rides along in the
next batch; no tombstone, since it would outlive the vehicle coming back.

The key carries a version segment (`tecdoc:vehicle:v1:<carId>`) because the row's
shape is decided by things the `carId` says nothing about: the fields the mapper
reads, the detail blocks the request asks for, and the language the names come
back in. Change any of those and bump the segment; otherwise the old shape is
served for a full day, and a second caller wanting different detail blocks would
collide with the first outright.

Scope: passenger cars (`linkingTargetType: 'P'`), across **every**
generic-article role the part is filed under. TecDoc keys linkages by role, and
a part catalogued as both an oil filter and a filter set has its vehicles split
across the two, so both endpoints fan out per role and merge — de-duplicating by
make id and by linkage target id respectively.

`'P'` does **not** mean the same thing to both API generations, and this is now
settled rather than assumed. The Service Index documents `linkingTargetType` on
the linkage functions as "P: Passenger car, O: Commercial vehicle, M: Motor, A:
Axles, K: Body type", noting that P and O "may be combined" — the Functions
guide spells the combination `'PO'`. The newer generation (`getArticles`,
`getLinkageTargets`) reads the same `'P'` as passenger cars, motorcycles and
LCVs together, splitting the narrow senses out as `'V'`, `'B'` and `'L'`. The
two sets are therefore named apart in code (`LinkageFunctionTargetType` vs
`LinkageTargetType`), since sending one where the other belongs is accepted in
silence. Passenger cars are this shop's deliberate scope; widening the section
to commercial vehicles is a change to `'PO'`, not a change of function.

Kit membership is out of scope: `getArticleLinkedAllLinkingTarget4` is sent
`withMainArticles: false`, so a component's vehicles are the ones filed against
the component. TecDoc will also report the vehicles filed against the *parent*
article a part belongs to — the timing-belt kit a tensioner pulley ships in —
under a separate `mainArticleLinkages` collection. Turning the flag on alone
would achieve nothing: the makes call
(`getArticleLinkedAllLinkingTargetManufacturer2`) has no equivalent option, so a
make reachable only through the parent never appears at the level a visitor
opens. Inheriting kit applicability means resolving the parent through
`getArticles` (`mainArticle`) and running the whole §8.4 chain against it — a
feature, and one that should label the result rather than merge it, since "this
kit fits your car" is a weaker claim than "this part does".

The trade-off is real either way: a component only ever catalogued as a kit
member currently shows an empty section despite demonstrably fitting cars.

**`GET .../linked-vehicles/manufacturers`** `[PUBLIC]` → `LinkedVehicleManufacturerDto[]`

The makes the part fits, sorted by name. Read when the section opens. No count
rides along: the documented call answers with names and ids only, and numbering
them would mean hydrating every vehicle of every make before a visitor has asked
for any of them.

```json
[
  { "manufacturerId": "5", "name": "BMW" },
  { "manufacturerId": "16", "name": "MERCEDES-BENZ" }
]
```

**`GET .../linked-vehicles?manufacturerId={id}`** `[PUBLIC]` → `LinkedVehicleSeriesDto[]`

Every vehicle of one make, grouped into model series and sorted by name at both
levels. Read when that make is opened. `manufacturerId` is required — without it
the answer is every vehicle the part fits, which is the unbounded list this
section exists to avoid — so an absent or unparseable value is a `400`.

A vehicle row repeats neither its make nor its series; both are on the parent,
and a make can hold several hundred rows. Every field TecDoc files as optional is
nullable, so a sparsely catalogued vehicle still lists rather than being dropped;
`yearTo: null` means the model is still in production, and `engineCodes` holds
**every** code on file, since a mechanic matching the one stamped on the block
against a shortened list would conclude the part does not fit.

```json
[
  {
    "seriesId": "8506",
    "manufacturerId": "5",
    "name": "3 Series (E90)",
    "vehicles": [
      {
        "vehicleId": "10020",
        "name": "320d",
        "yearFrom": 2005,
        "yearTo": 2011,
        "powerKw": 130,
        "powerHp": 177,
        "fuelType": "Diesel",
        "engineCodes": ["N47 D20 C"]
      }
    ]
  }
]
```

Cache: Redis, 24h on a hit / 1h on an empty result for all three keys below. Pure
TecDoc data with no inventory in it, and the shorter miss TTL keeps a part
briefly missing its linkages from being remembered as vehicle-less for a whole
day.

- `tecdoc:article-legacy-ids:{brandId}:{articleNumber}` — shared by both
- `tecdoc:linked-makes:{brandId}:{articleNumber}`
- `tecdoc:linked-vehicles:{brandId}:{articleNumber}:{manufacturerId}`

---

## Search Module

### Part Number Search

**`GET /search?q={query}&vehicleId={id}&page={n}&pageSize={n}&brandIds={id}&categoryNodeId={id}&attr={criteriaId}:{value}&exact={bool}`** `[PUBLIC]`

Searches the TecDoc catalogue. There is **no up-front number-vs-text
classification** (that heuristic is unreliable, and the number and free-text
result sets are near-disjoint, so it is unnecessary). Instead the query always
runs the **number lane first, then falls back to free-text**:

1. **Number lane** — `getArticles` `searchType: 10` (any number: article / OE /
   trade / comparable / EAN), `searchMatchType: prefix_or_suffix` so partial
   numbers still resolve. A **leading or trailing brand token** is stripped first
   (e.g. `"WA5432 WIX"` → `"WA5432"`) using a brand dictionary from TecDoc
   `getBrands()` — only the brand token, never punctuation inside the number. The
   brand-stripped query runs first; the raw query is retried only if it differs
   (the "brand" token may have been part of the number).
2. **Free-text fallback** — if the number lane returns nothing, one
   `searchType: 99` full-text call over the **raw** query (brand kept — a brand
   in a descriptive query like `"oil filter bosch"` is valuable free-text signal).

The first call with a non-empty total wins. Worst case is 3 calls (2 number + 1
free-text); a real part number resolves on the first. All calls are Redis-cached.

**Exact toggle** — `exact=true` (FE "Търси по точна фраза") is a separate bucket:
it runs `searchType: 10` / `searchMatchType: exact` over the same
brand-stripped→raw candidates, with **no** free-text fallback (an exact-phrase
request is a precise number lookup).

`[VERIFY-TC]` `searchType: 99` (free-text) is implemented from the Pegasus 3.0
docs but not yet verified against the Test Client — confirm its response shape
matches the number-search shape (see the plan's verification checklist).

**Native order, no ranking:** results are returned in TecDoc's native `getArticles`
order — there is no client-side re-ranking. `[VERIFY-TC]` Re-evaluate against the
Test Client before adding any internal sort (see the Phase 3.5 plan checklist).

**No redirects:** the search endpoint always returns a result list — even for a
single hit — so the user stays on the search screen. (A single part number
typically fans out to several results anyway, because `searchType: 10` matches
the supplier number plus its OE / trade / comparable numbers.) Navigation to an
article detail page happens from the **autocomplete** dropdown, not from this
endpoint.

Query params:
- `exact` (optional boolean, `true`/`1`) turns on exact-phrase matching
  (`EXACT` mode). Absent/other values mean off.
- `vehicleId` (optional) scopes every call to that vehicle so TecDoc returns
  only fitting parts.
- `page` (default 1) and `pageSize` (default 20, max 50) paginate broad queries
  like `WA`.
- `brandIds` (optional, repeatable) narrows to the selected brand facet values —
  maps to TecDoc `dataSupplierIds`. Send each id as a repeated param
  (`?brandIds=4&brandIds=30`).
- `categoryNodeId` (optional, **single**) narrows to the selected category
  navigation node — maps to TecDoc `assemblyGroupNodeIds: [id]`. Category
  navigation is a single-path drill-down (one node at a time, deeper until a
  leaf), so this is a scalar, not a repeatable param like `brandIds`.
- `categoryHasChildren` (optional boolean, `true`/`false`) is not a filter but
  the way a client **opts in to the `attributes` (dimension) block**. It echoes
  back the `hasChildren` the client already holds for that node, and only an
  explicit **`false`** — "this node is a leaf" — asks for dimensions. `true`, an
  absent value, or an unparseable one all mean "do not fetch them": the API then
  never asks TecDoc for the criteria block, so a mid-level node never pays for
  one computed across its whole subtree. It is never trusted for correctness
  either — the leaf gate on the response (below) still decides whether
  `attributes` are actually returned, so a client that wrongly claims a leaf gets
  no `attributes`, just a wasted upstream computation.

  **Consequence:** a category-scoped URL that omits this param gets no
  `attributes`, even at a leaf. Clients that render dimension filters must send
  it — including on a deep link or a restored/bookmarked search URL, so keep it
  in the URL rather than in component state.
- `attr` (optional, repeatable) narrows to a technical attribute value as a
  `criteriaId:rawValue` pair (`?attr=20:106.4&attr=44:Отпред`), split on the
  first colon; maps to TecDoc `criteriaFilters`.
- Up to 50 values per param.

Every response with results carries three narrowing blocks, all computed by
TecDoc over the whole match set (not just the current page) and absent on a
zero-result response:
- **`facets`** — the brand group only. Each value has an `id` (sent back as
  `brandIds`), a `label`, a `count`, and an `imageUrl` logo joined from
  `getBrands()`.
- **`attributes`** — technical-attribute (criteria) groups (width, mounting
  position, brake system…). Each group has a `criteriaId` `id`, `label`, `unit`,
  `type` (`N` numeric, `A` alphanumeric, `K` key/lookup), `isInterval`,
  `values` (each a `{ value, label, count }`; send `value` back via `attr`), and
  an optional **`role`** — a semantic hint (`fitting-position`, `axle`, `side`)
  assigned on the backend from a known criteriaId map (`[VERIFY-TC]` for the
  exact ids) so the client can render a bespoke control (e.g. a front/rear car
  diagram) instead of a plain value list; `null`/absent means "render normally".
  **Only present once the search has landed on a leaf category** (the single
  `categoryNodeId` node has no children) **and the client asked for them** via
  `categoryHasChildren=false`: criteria are defined per product type, so a broad,
  multi-category result omits them; the client drills the category navigation to a
  leaf first, then the dimension filters appear. Both conditions must hold — the
  request is never made without the opt-in, and the block is never returned when
  TecDoc reports the node has children.
  **Only sent on page 1.** Unlike `facets` and `categoryNavigation`, this block
  is not re-requested from TecDoc while paginating — it describes the whole match
  set, so every later page would carry an identical copy. The client keeps the
  page-1 `attributes` for the lifetime of the result set.
  Filtering is fully server-side: a facet click re-issues the search with the
  selected `brandIds` + `categoryNodeId` + `attr`, and TecDoc returns the
  narrowed set and recomputed facets.
- **`categoryNavigation`** — the category (assembly-group) facet as
  **single-level navigation**, not a full tree. The client drills one step at a
  time (like InterCars): a broad search returns only the top-level roots, the
  user clicks one, the search is re-issued with that `categoryNodeId`, and the
  next level comes back re-scoped — so the whole subtree is never shipped and
  deep counts are always computed against the current scope. There is **no
  breadcrumb**: each drill level is a distinct search URL, so the browser back
  button handles "go up". Two fields:
  - **`options`** — the level to choose from: the top-level roots when no
    `categoryNodeId` is selected, otherwise the selected node's immediate
    children (empty once at a leaf). Each is `{ id` (sent back as
    `categoryNodeId`)`, label, count` (**null** when TecDoc omits it —
    `[VERIFY-TC]`)`, hasChildren }`.
  - **`current`** — the selected node (same shape as an option), or `null` on a
    broad/unscoped search. Its `hasChildren` drives the leaf gate for
    `attributes`; its `label`/`count` feed the results heading. `[VERIFY-TC]`
    whether the match-scoped facet returns the selected node so `current` can be
    resolved for a deep selection.

  The whole-catalogue tree is `GET /catalog/assembly-groups`'s job; this block is
  strictly match-scoped.

Returns cacheable TecDoc **metadata + fit + facets — no live inventory**,
mirroring the listing grid / article detail split. `available` and price are not
on the search response; the client fetches live price/availability for the
result article numbers via `GET /catalog/articles-availability` and merges it
in. This keeps a search from triggering a stock-DB read per TecDoc call attempt
— availability is read once, client-side, for the final result set.

Response `200` — matches, scoped to a leaf category (e.g.
`?q=brake%20pad&categoryNodeId=200`), so `attributes` are present:
```json
{
  "query": "brake pad",
  "results": [
    {
      "articleNumber": "0 986 494 104",
      "brandId": "30",
      "brandName": "BOSCH",
      "description": "Brake Pad Set",
      "thumbnailUrl": null,
      "fitsVehicle": true
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "facets": [
    {
      "id": "brands",
      "label": "Производител",
      "values": [
        { "id": "4", "label": "BOSCH", "count": 18, "imageUrl": "https://.../bosch.png" },
        { "id": "30", "label": "ABE", "count": 12, "imageUrl": "https://.../abe.png" }
      ]
    }
  ],
  "attributes": [
    {
      "id": "20",
      "label": "Ширина",
      "unit": "мм",
      "type": "N",
      "isInterval": false,
      "values": [
        { "value": "106.4", "label": "106.4", "count": 24 },
        { "value": "120", "label": "120", "count": 8 }
      ]
    }
  ],
  "categoryNavigation": {
    "current": {
      "id": "200",
      "label": "Накладки",
      "count": null,
      "hasChildren": false
    },
    "options": []
  }
}
```

Response `200` — no matches (no facets / attributes / category navigation):
```json
{ "query": "XXXX999", "results": [], "total": 0, "page": 1, "pageSize": 20 }
```

---

### Autocomplete

**`GET /search/autocomplete?q={query}`** `[PUBLIC]`

Returns up to 8 suggestions for queries of 3+ characters.

Response `200`:
```json
[
  { "articleNumber": "WL6340", "brandId": "268", "brandName": "WIX", "description": "Oil Filter" },
  { "articleNumber": "WL6341", "brandId": "268", "brandName": "WIX", "description": "Oil Filter Heavy Duty" }
]
```
Cache: Redis, 15 min for suggestions and 5 min for empty results.

---

## Inventory Module

There is **no standalone inventory HTTP endpoint.** Client-facing availability is
served through the catalog endpoint `GET /catalog/articles-availability?numbers=…`
(`no-store`), which reads `public.autoparts` + `public.supplier_stock` directly and
live (no Redis).

There is **one** read behind every surface — `InventoryService.getAvailability(numbers)`,
exposed via `CatalogService.getArticlesAvailability` — which toggles only the DB
query by input size (single-row vs batch) and **always fails closed**: on a read
error it throws `InventoryUnavailableException` (`INVENTORY_UNAVAILABLE`, 503) rather
than reporting stock as unavailable. Every surface fetches cached metadata separately
and hydrates it with this read client-side (the product-page buy box, listing grid,
search, and substitutes), and each shows a scoped "try again" state on the 503 rather
than a silently wrong "unavailable" or a grid of false "out of stock" rows. (An
article that genuinely has no stock still resolves to `available: false`; only a read
*failure* throws.)

The **binding pre-checkout re-validation** uses the same fail-closed read
(`InventoryService.getAvailability(cart numbers)`), called **in-process** by
`CheckoutService` during the confirm step so a DB error aborts the order rather than
selling stale stock. It is not exposed over HTTP: NestJS services read the shared DB
directly, with no internal REST hop.

---

## Cart Module

> **Anonymous cart note**: Anonymous visitors manage their cart entirely client-side (browser localStorage via Zustand). These API endpoints are only called for **logged-in users**. When an anonymous visitor logs in, the frontend reads the local cart and calls `POST /cart/items` for each item to merge it into the server-side account cart, then clears local storage. All cart endpoints therefore remain `(Protected)`.

### Get Active Cart

**`GET /cart`** (Protected)

Returns the customer's active cart with current prices refreshed.

Response `200`:
```json
{
  "id": "cart-uuid",
  "items": [
    {
      "articleNumber": "WL6340",
      "brandName": "WIX",
      "description": "Oil Filter",
      "thumbnailUrl": "https://cdn.example.com/img/WL6340.jpg",
      "quantity": 2,
      "unitPriceExVat": 1250,
      "unitPriceIncVat": 1500,
      "lineTotalIncVat": 3000,
      "available": true
    }
  ],
  "subtotalExVat": 2500,
  "vatAmount": 500,
  "totalIncVat": 3000,
  "itemCount": 2
}
```

---

### Add Item to Cart

**`POST /cart/items`** (Protected)

Request body:
```json
{ "articleNumber": "WL6340", "quantity": 2 }
```

Response `200`: updated cart (same shape as `GET /cart`)

Errors: `404 ARTICLE_NOT_FOUND`, `422 ARTICLE_UNAVAILABLE`

---

### Update Cart Item Quantity

**`PATCH /cart/items/:articleNumber`** (Protected)

Request body: `{ "quantity": 3 }`

Response `200`: updated cart

Errors: `404 CART_ITEM_NOT_FOUND`, `422 QUANTITY_EXCEEDS_STOCK`

---

### Remove Cart Item

**`DELETE /cart/items/:articleNumber`** (Protected)

Response `200`: updated cart

---

### Validate Cart (Pre-Checkout)

**`POST /cart/validate`** (Protected)

Performs a live availability check on every item in the cart. Returns which items (if any) are no longer available or have changed price.

Response `200`:
```json
{
  "valid": true,
  "changedItems": [],
  "unavailableItems": []
}
```

Response `200` (with issues):
```json
{
  "valid": false,
  "changedItems": [
    {
      "articleNumber": "WL6340",
      "oldPriceIncVat": 1500,
      "newPriceIncVat": 1650,
      "difference": 150
    }
  ],
  "unavailableItems": [
    { "articleNumber": "OC123", "description": "Oil Filter MANN" }
  ]
}
```

---

### Save Cart (Mechanic only)

**`POST /cart/save`** (Protected, `MECHANIC` role)

Request body: `{ "name": "Job — Lada Niva, July service" }`

Response `201`: `{ "savedCartId": "uuid", "name": "Job — ..." }`

---

### List Saved Carts (Mechanic only)

**`GET /cart/saved`** (Protected, `MECHANIC` role)

Response `200`:
```json
[
  { "id": "uuid", "name": "Job — Lada Niva, July service", "itemCount": 4, "updatedAt": "..." }
]
```

---

## Checkout & Orders Module

### Pre-Payment Confirmation

**`POST /orders/checkout/confirm`** (Protected)

Final live-price check immediately before payment is initiated. MUST be called immediately before creating a payment intent. Uses the exact same live backoffice call as `/cart/validate` but is a separate endpoint to make the call site explicit and auditable.

Request body: `{ "cartId": "uuid" }`

Response `200`:
```json
{
  "confirmed": true,
  "confirmedItems": [
    { "articleNumber": "WL6340", "confirmedPriceExVat": 1250, "quantity": 2 }
  ],
  "subtotalExVat": 2500,
  "vatAmount": 500,
  "totalIncVat": 3000
}
```

Response `422 PRICE_CHANGED` or `422 ARTICLE_UNAVAILABLE` if anything has changed since the last cart validate.

---

### Create Order (Post-Payment)

**`POST /orders`** (Protected)

Called after payment is confirmed (myPOS IPN has been processed). Creates the order record and publishes `OrderPlaced` to SQS.

Request body:
```json
{
  "cartId": "uuid",
  "addressId": "uuid",
  "shippingMethod": "ECONT",
  "paymentMethod": "MYPOS",
  "paymentReference": "pi_abc123",
  "vehicleTag": "CB1234AB",
  "jobReference": "Golf service Jul-2026"
}
```

Response `201`:
```json
{
  "orderId": "uuid",
  "orderReference": "VP-20260605-00001",
  "status": "PROCESSING"
}
```

---

### Order History

**`GET /orders`** (Protected)

Query params: `page` (default 1), `pageSize` (default 20)
Mechanic additional params: `vehicleTag`, `jobReference` (filter)

Response `200`:
```json
{
  "total": 5,
  "orders": [
    {
      "orderId": "uuid",
      "orderReference": "VP-20260605-00001",
      "createdAt": "2026-06-05T10:00:00Z",
      "itemCount": 3,
      "totalIncVat": 8500,
      "status": "ON_THE_WAY"
    }
  ]
}
```

---

### Order Detail

**`GET /orders/:orderId`** (Protected)

Response `200`:
```json
{
  "orderId": "uuid",
  "orderReference": "VP-20260605-00001",
  "status": "ON_THE_WAY",
  "createdAt": "2026-06-05T10:00:00Z",
  "items": [
    {
      "articleNumber": "WL6340",
      "brandName": "WIX",
      "description": "Oil Filter",
      "quantity": 2,
      "unitPriceIncVat": 1500,
      "lineTotalIncVat": 3000
    }
  ],
  "deliveryAddress": { "fullName": "Ivan Petrov", "city": "Sofia", "..." : "..." },
  "shippingMethod": "ECONT",
  "shippingCostIncVat": 600,
  "subtotalExVat": 6500,
  "vatAmount": 1300,
  "totalIncVat": 8400,
  "paymentMethod": "MYPOS",
  "courierName": "Econt",
  "trackingReference": "1234567890",
  "vehicleTag": "CB1234AB",
  "jobReference": "Golf service Jul-2026",
  "statusHistory": [
    { "status": "PROCESSING", "occurredAt": "2026-06-05T10:00:00Z" },
    { "status": "ON_THE_WAY", "occurredAt": "2026-06-06T09:15:00Z" }
  ]
}
```

Errors: `404 ORDER_NOT_FOUND` if the order doesn't belong to the requesting customer.

---

### Order Status SSE Stream

**`GET /orders/:orderId/status`** (Protected)

Server-Sent Events stream. Emits a message whenever the order status changes.

Event format:
```
data: {"orderId":"uuid","status":"ITEMS_PREPARED","occurredAt":"2026-06-05T14:30:00Z"}
```

The stream is held open until the order reaches a terminal state (`DELIVERED`, `CANCELLED`, `FULFILLMENT_FAILED`) or the client disconnects.

---

### Cancel Order Request

**`POST /orders/:orderId/cancel`** (Protected)

Only available for orders in `PROCESSING` status.

Response `202`: `{ "message": "Cancellation request received. You will be notified by email." }`

Errors: `409 ORDER_CANNOT_BE_CANCELLED` if status is not `PROCESSING`.

---

## Payments Module

### myPOS — Initiate Payment

**`POST /payments/mypos/initiate`** (Protected)

NestJS calls the myPOS Checkout API server-side and returns the hosted payment URL to the frontend.

Request body: `{ "cartId": "uuid", "confirmedTotal": 8400 }`

Response `200`:
```json
{
  "checkoutUrl": "https://checkout.mypos.com/pay/session_abc123"
}
```

Frontend redirects the customer's browser to `checkoutUrl`. The myPOS hosted page handles card entry and 3DS authentication.

---

### myPOS — IPN (Instant Payment Notification)

**`POST /payments/mypos/ipn`** `[PUBLIC]`

myPOS calls this endpoint server-to-server after payment completes (success or failure). NestJS verifies the HMAC-SHA256 signature using the merchant secret key. On success, triggers order creation and `OrderPlaced` SQS event. Returns `200` to myPOS.

Note: The customer's browser is separately redirected to the success/cancel return URL configured at checkout initiation — the IPN and the browser redirect are independent flows.

---

### COD — Confirm Order

**`POST /payments/cod/confirm`** (Protected)

Creates a COD order directly (no payment gateway). Only allowed when order total ≤ `COD_MAX_ORDER_TOTAL_CENTS` (configured threshold, default 20000 = €200.00).

Request body: `{ "cartId": "uuid", "addressId": "uuid", "shippingMethod": "SPEEDY" }`

Response `201`: `{ "orderId": "uuid", "orderReference": "VP-20260605-00001" }`

Errors: `422 COD_THRESHOLD_EXCEEDED`

---

## Clerk Webhook

### Clerk User Event

**`POST /webhooks/clerk`** `[PUBLIC — Clerk signature required]`

Receives lifecycle events from Clerk. Verifies the `svix-id`, `svix-timestamp`, and `svix-signature` headers using the `CLERK_WEBHOOK_SECRET` environment variable via the `svix` library.

**Handled events**:
- `user.created` — creates a `Customer` record in Postgres (`clerkId`, `email`, `firstName`, `lastName`; `phoneNumber` left blank until onboarding step)
- `user.updated` — syncs `email`, `firstName`, `lastName` changes from Clerk to Postgres

Response `200`: `{ "received": true }`

Returns `400` if signature verification fails.

---

## Customers Module

### Get Current Customer

**`GET /customers/me`** (Protected)

**`GET /customers/me`** (Protected)

Response `200`: Customer profile + mechanic profile status if applicable.

---

### Update Profile

**`PATCH /customers/me`** (Protected)

Request body: subset of `{ firstName, lastName, phoneNumber }`.

Response `200`: updated profile.

---

### Addresses

**`GET /customers/me/addresses`** — list saved addresses

**`POST /customers/me/addresses`** — add address

**`PATCH /customers/me/addresses/:id`** — update address

**`DELETE /customers/me/addresses/:id`** — delete address

---

### Mechanic Application

**`POST /customers/mechanic-application`** (Protected)

Request body:
```json
{
  "businessName": "AutoService Petrov",
  "eik": "123456789",
  "vatNumber": "BG123456789",
  "businessAddress": "ul. Industrialna 5, Sofia 1000",
  "businessPhone": "+35929123456"
}
```

Response `201`: `{ "status": "PENDING", "message": "Application submitted. You will be notified by email." }`

Errors: `409 MECHANIC_APPLICATION_ALREADY_EXISTS`

---

### Saved Vehicles (Mechanic only)

**`GET /customers/me/saved-vehicles`** — list (max 10)

**`POST /customers/me/saved-vehicles`** — save vehicle
Request: `{ "tecdocVehicleId": "V10042", "manufacturer": "VW", "modelSeries": "Golf VII", "variant": "2.0 TDI 110kW" }`

**`DELETE /customers/me/saved-vehicles/:id`** — remove

---

## Shipping Module

### Calculate Shipping Rate

**`GET /shipping/rates`** `[PUBLIC]`

Query params: `method` (`ECONT` or `SPEEDY`), `city`, `postcode`, `weightGrams`

Response `200`:
```json
{
  "method": "ECONT",
  "costIncVat": 6.00,
  "estimatedDeliveryDays": 1
}
```

---

## Configuration Module

### Checkout Config

**`GET /config/checkout`** `[PUBLIC]`

Returns runtime configuration values the frontend needs at checkout.

Response `200`:
```json
{
  "codMaxOrderTotal": 20000,
  "vatRate": 0.20
}
```

---

## Internal Endpoints (called by Spring Boot backoffice — not exposed to browser)

### Approve Mechanic

**`POST /internal/mechanic-approve/:customerId`** (Service-to-service: `InternalGuard` — shared-secret bearer token, private network only)

Called by the backoffice when the operator approves a mechanic application.

Request body: `{ "approvedBy": "operator-id" }`

Response `200`: `{ "success": true }`

---

### Reject Mechanic

**`POST /internal/mechanic-reject/:customerId`** (Service-to-service: `InternalGuard` — shared-secret bearer token, private network only)

Request body: `{ "rejectedBy": "operator-id", "reason": "EIK could not be verified" }`

Response `200`: `{ "success": true }`

---

## Error Codes (`AppErrorCode` enum in `packages/shared/src/errors.ts`)

| Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Input failed Zod/DTO validation |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Authenticated but insufficient role |
| `ARTICLE_NOT_FOUND` | 404 | Article number not in TecDoc catalogue |
| `ARTICLE_UNAVAILABLE` | 422 | Article has no stock at checkout |
| `PRICE_CHANGED` | 422 | Price changed since cart was built |
| `ORDER_NOT_FOUND` | 404 | Order doesn't exist or belongs to another customer |
| `ORDER_CANNOT_BE_CANCELLED` | 409 | Order is past the cancellation window |
| `CART_ITEM_NOT_FOUND` | 404 | Item not in cart |
| `QUANTITY_EXCEEDS_STOCK` | 422 | Requested quantity exceeds available stock |
| `EMAIL_ALREADY_EXISTS` | 409 | Email is already registered |
| `MECHANIC_APPLICATION_ALREADY_EXISTS` | 409 | Customer already has a pending/approved application |
| `COD_THRESHOLD_EXCEEDED` | 422 | Order total too high for cash on delivery |
| `INVENTORY_UNAVAILABLE` | 503 | Live availability read (direct DB) could not complete — checkout blocked |
| `PAYMENT_FAILED` | 402 | Payment gateway declined or returned error |
