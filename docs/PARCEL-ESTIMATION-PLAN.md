# Plan: every cart line gets a parcel weight (cross-references + product-type fallback)

**Status: phase 1 implemented (2026-10-07); phase 2 planned (builder redesigned 2026-10-07), not started.** Delete this file once both phases ship and their findings are folded into `DELIVERY-PROVIDERS.md`, `TECDOC.md`, `CROSS-REFERENCES.md` and `CART.md`.

## Context

Checkout must always show a delivery price close to what the customer will pay, so card
payment never blocks. The business ruled out a flat fee (too high for a single filter) and
pay-on-delivery (surprise prices, phone calls). Today a line with no weight leaves the
parcel "unmeasured", and the checkout shows "priced by phone".

Two spikes measured the fix (`apps/api/scripts/cross-reference-dimensions-probe.mjs`,
`parcel-estimate-coverage-probe.mjs`), over 2,250 random in-stock parts, weighted by stock
share. Among parts TecDoc lists:

| Source | Share of parts | Right Econt price step |
|---|---|---|
| Measured (InterCars catalogue, TecDoc) | 89% | taken as exact |
| Cross-references | 6.7% | 99% (793/801) |
| Product-type median (fallback) | 4.3% | 87% (leave-one-out) |

The resolution chain at add-to-cart becomes: InterCars catalogue → TecDoc logistics + article
criteria → cross-reference consensus → product-type fallback. Weight learned from Econt
shipments is out of scope for now.

The plan is two phases, each shippable on its own.

---

## Phase 1: estimate from cross-references (and read TecDoc's logistics table)

### 1.1 TecDoc logistics criteria
- `apps/api/src/catalog/articles/articles.tecdoc.ts`: add `includeArticleLogisticsCriteria: true`
  to `getArticleDetails`.
- `apps/api/src/tecdoc/shipping-profile.ts`: read `articleLogisticsCriteria` too. Weight `3870`
  is in g, and the box `4197`/`4198`/`4199` is in **mm**, so convert it to cm. Logistics figures
  are *packed* and the article criteria are mostly *net*, so prefer logistics for each half
  separately. Reuse `parsePositiveNumber`/`numericCriteriaOf`.
- Add `articleLogisticsCriteria?` to `TecDocArticleRecord` (`tecdoc/article-mapper.ts`).
- The `tecdoc:article-read:*` payload changes shape, so flush Redis on deploy (CLAUDE.md: no
  shims).

### 1.2 Batch catalogue lookup
- `apps/api/src/inventory/supplier-catalog.repository.ts`: add
  `findPackageProfiles(identities: ArticleIdentityDto[]): Promise<ShippingProfile[]>`. It picks
  one row per identity (`DISTINCT ON`) with the same ranking as `findPackageProfile`, through
  `unnest` arrays in a single `Prisma.sql` query, and uses `idx_spc_tecdoc`. Reuse
  `toShippingProfile`. Unmatched identities are simply absent.

### 1.3 Expose the cached candidate set
- `CrossReferencesService` (`catalog/articles/cross-references/cross-references.service.ts`):
  add a public `getCandidates(brandId, articleNumber)` that returns the private
  `loadCrossReferences`. It's the same 24 h `tecdoc:crossrefs:*` entry the substitutes tab
  warms, so it needs no new key.
- `catalog/catalog.module.ts`: export `CrossReferencesService` next to `ArticleReadCache`.

### 1.4 Pure estimator: `apps/api/src/cart/shipping-profile/equivalents-estimate.ts`
`estimateFromEquivalents(profiles: ShippingProfile[]): ShippingProfile | null`
- The median weight of every equivalent with a weight (one is enough), and the median of
  each box side across equivalents with a full box. Null when none is weighed.
- No part-type rules and no agreement gate: a 2026-10-07 re-measurement showed the plain
  median handles brake-disc pairs on its own and weighs a third more parts. The figures
  are in `docs/DELIVERY-PROVIDERS.md`.

### 1.5 Resolver, extracted from `CartService`
New `apps/api/src/cart/shipping-profile/shipping-profile.resolver.ts`
(`ShippingProfileResolver`, injectable). It owns the chain that `CartService.shippingProfileOf`
holds today, so `CartService` only calls `resolver.resolve(identity)`:
1. `SupplierCatalogRepository.findPackageProfile`. If fully measured, return it.
2. `ArticleReadCache.read` → `shippingProfile` (criteria + logistics); merge with
   `preferMeasured` (`cart/cart-shipping.ts`).
3. If the weight is still null: `CrossReferencesService.getCandidates` →
   `findPackageProfiles` → `estimateFromEquivalents`, filling only the missing halves.
- Returns `ResolvedShippingProfile = ShippingProfile & { isEstimated: boolean }`, where
  `isEstimated` is true when any half came from step 3 or later.
- A TecDoc outage keeps today's behaviour: the add fails with `503 CATALOG_UNAVAILABLE`,
  and a line is never stored unweighed because of an outage.

### 1.6 Store whether a line is estimated, and keep estimated lines out of lockers
- `prisma/schema.prisma` `CartItem`: add `isShippingEstimated Boolean @default(false)`, with a
  migration. Carry it through `toShippingColumns`/`fromShippingColumns`, `cart.mapper.ts`
  (`CartShippingLine`) and the repository writes. `CartService.addItem` stores it.
- `delivery/parcel/parcel-estimate.ts`: `ParcelLine` and `Parcel` carry `hasEstimatedUnits`.
  `delivery.service.ts` `toParcelEstimateDto` sets `isLockerEligible: false` when any line is
  estimated. `fitsLocker` stays pure.

### Phase 1 tests
- `equivalents-estimate.spec.ts`:
  - one weight is enough; none gives null;
  - a minority of two-packs does not pull the median;
  - box median.
- `shipping-profile.resolver.spec.ts`, with mocked repo, cache and cross-references:
  - the short-circuit at each step;
  - only the missing halves are filled;
  - `isEstimated`;
  - no cross-reference call when TecDoc already has the weight;
  - TecDoc failure propagates.
- `shipping-profile.spec.ts`: logistics parsing, mm→cm, precedence over article criteria.
- `supplier-catalog.repository.spec.ts`: the batch query.
- Update the `cart.service.spec.ts`, `cart-shipping.spec.ts` and `delivery.service.spec.ts`
  locker cases.
- e2e: add-to-cart of a part measured only through cross-references stores a weight, and
  `/delivery/parcel` reports it locker-ineligible.

---

## Phase 2: product-type fallback (the last resort)

### 2.1 Table (shop schema, shop-owned)
```prisma
model ProductTypeParcelProfile {
  genericArticleId Int      @id
  productTypeName  String
  weightGrams      Int
  packageLengthCm  Float?
  packageWidthCm   Float?
  packageHeightCm  Float?
  sampleSize       Int
  computedAt       DateTime
}
```
Repository `cart/shipping-profile/product-type-parcel-profile.repository.ts`:
`findByGenericArticleId`, and `replaceAll(rows)`, which deletes and inserts in one
transaction.

### 2.2 Aggregation (pure): `cart/shipping-profile/product-type-profile.ts`
`aggregateProductTypeProfile(samples)` takes `{ weightGrams, packageCm }[]` and returns a
profile, or null when no sample has a weight.
- **No minimum sample size.** One weighed part of the same type is closer than the global
  default, which is the deviation this table exists to avoid (a bumper must never fall back
  to a filter's weight).
- **Weight:** the median. For wide types (p75/p25 > 2, such as clutch kits, wheel-bearing kits
  and discs), use p75 instead, so we overcharge slightly rather than undercharge. A spread is
  only meaningful with at least 4 samples; below that, use the median.
- **Box:** the median per sorted side, over the samples that have a full box; null when none
  does.

### 2.3 Builder: a manual script (user's choice)
`apps/api/src/cli/build-product-type-parcel-profiles.ts` is a Nest standalone application
context, run with a new `npm run parcel-profiles:build`. It reuses `TecDocTransport`,
`SupplierCatalogRepository.findPackageProfiles` and the repositories.

It asks TecDoc which articles belong to each product type, restricted to **the brands we
stock**, and weighs those articles from our own catalogue. TecDoc returns the type, and the
catalogue returns the weight. It never walks our ~686k in-stock identities one by one, because
no TecDoc call takes a list of article numbers.

1. **Our brands (DB, no TecDoc):** the distinct numeric `tecdoc_supplier_id`s with stock
   (`supplier_stock.availability > 0`, `autoparts.available_quantity > 0`). That is 896 brands
   locally. For each brand, also count its weighed `supplier_product_catalog` rows; that
   count ranks the brands in step 4. This goes through a small read-only builder repository.
   Check that the shop role's column grants cover it (`infra/db/01-shop-provisioning.sql`).
2. **Every product type our brands have (1 call):** `getArticles` with
   `dataSupplierIds: <our brands>`, `perPage: 0` and `includeGenericArticleFacets`. This
   returns 8,571 types with an article count each.
3. **Small types, up to 1000 articles (8,064 types, 1 call each):** `genericArticleIds: [type]`,
   `dataSupplierIds: <our brands>`, `perPage: 1000`, and no include flags, because only
   `articleNumber` and `dataSupplierId` are needed. This reads the whole type.
4. **Big types, over 1000 articles (~507 types, ~11 calls each):** reading page 1 alone does
   not work (see *Why big types are sampled by brand* below).
   1. One call with `perPage: 0` and `includeDataSupplierFacets` gives the type's article
      count per brand.
   2. From the brands that have this type, keep the **10 that our catalogue weighs most**
      (the step 1 ranking).
   3. Make one call per kept brand: `dataSupplierIds: [brand]`, `perPage: 100`.
5. **Weigh:** pass each type's identities to `findPackageProfiles` (one DB query per type),
   then run `aggregateProductTypeProfile`.
6. **Store:** `replaceAll` once, after every type is done.
7. **Report:**
   - types written;
   - calls made, retries and duration;
   - the global p75 weight, which feeds 2.4;
   - **every type left without a weight**, with its article count, sorted largest first.
     This goes to a JSON file and to stdout, so a bulky type (bumpers, say) is easy to spot.

**Pacing (no published limit to size it on):** TecAlliance publishes no rate limit for
Pegasus 3.0. The responses carry no `X-RateLimit-*` or `Retry-After` header, and the XSD
documents only the ~10,000-result paging limit. The limit is per contract, so:
- **1 request per second, one at a time.** About 12,600 calls (1 + 8,064 + ~507 × 9) take
  **about 3.5 hours**. Several hundred calls one at a time (5–15/s) on 2026-10-07 returned
  only normal replies, so 1/s is well inside what is known to work.
- **Retries:**
  - On a `429`, a `5xx`, a timeout or a reply that is not valid JSON, retry with a doubling
    wait, starting at 5 s and honouring `Retry-After` if it ever appears.
  - **After 3 failures in a row, stop the run** rather than keep pushing.
- **Resumable:** progress is saved per finished type to a checkpoint file, and `--resume`
  skips those types, so a stopped run never repeats calls.
- **Counted:** every call counts toward any monthly quota, and the report states the total.
- **When to run it:** before launch, then on demand and off-hours, because once deployed the
  shop's own traffic shares the same key.

**Why big types are sampled by brand.** Measured on 2026-10-07:
- **TecDoc returns a type's articles in blocks by brand, and only the first ~10,000 can be
  reached** (`maxAllowedPage` is 10 at `perPage: 1000`).
- **Page 1 of a big type is usually one or two brands, and luck decides whether our catalogue
  weighs them.** First 1000 brake discs: 0 weighed. Pads, alternators and starters: also 0.
- **Neither workaround fixes it.** Reading pages 5 and 10 left 17 of 120 large types still
  with no weight. `sort: articleNumber` still returned a single brand.

Asking for the brands our catalogue weighs most makes hits likely by construction, and taking
10 of them keeps one brand's quirks (such as discs sold in pairs) out of the median.

### 2.4 Resolver step 4, and the global default
- In `ShippingProfileResolver`, after step 3: if the weight is still null, look up
  `ProductTypeParcelProfile` by the article read's `genericArticleIds[0]`. If no row exists,
  use the constant `UNKNOWN_PRODUCT_TYPE_PROFILE`: a weight from the builder's global p75, and
  no box. Its value is recorded in the docs.
- Every TecDoc-listed line now gets a weight, and `isEstimated` is true for anything from
  step 3 or 4.

### 2.5 Remove the "unmeasured / priced by phone" path
Nothing has been deployed, so remove it outright rather than keeping it as a fallback:
- `estimateParcel` always weighs. `ParcelEstimate` drops the `isMeasured: false` branch.
- `packages/shared/src/dto/delivery.dto.ts`: `weightGrams: number`, and `unmeasuredArticles` is
  removed.
- Remove `AppErrorCode.DELIVERY_PARCEL_UNMEASURED` and its exception
  (`delivery/delivery.exceptions.ts`).
- Web: delete `parcel-unmeasured-notice.tsx` and its spec, the unmeasured branches in
  `office-picker.tsx`, `order-summary-panel.tsx`, `lib/checkout/delivery/delivery-summary.ts`
  and `office-availability.ts`, and the "По телефон" copy, then update the specs that
  referenced them. Lockers stay listed as disabled with their reason when
  `isLockerEligible` is false. That behaviour already exists.
- `CartItem.weightGrams` stays nullable: a line can still predate a resolver change in a
  local DB. Flush local carts instead of adding a shim.

### Phase 2 tests
- `product-type-profile.spec.ts`:
  - one sample is enough; no weight gives null;
  - p75 for wide types, and the median below 4 samples;
  - box rules.
- Resolver spec: the table hit, the table miss → global default, `isEstimated`.
- Repository spec: `replaceAll` is transactional.
- Builder spec, with a mocked transport, repositories and clock:
  - small types are read in one call, and big types by facet then by top-weighed brands;
  - the 1 s pacing;
  - retries with backoff, and the stop after 3 failures in a row;
  - resume skips finished types;
  - the report lists types without a weight, largest first.
- Update the web specs listed above; `npm run test` must pass in `apps/web`.

---

## Docs (with each phase)
- `docs/DELIVERY-PROVIDERS.md`: replace "A part with no weight is not guessed" with the chain,
  the spike measurements (the tables above), the locker rule, and the
  builder runbook. Keep **[VERIFY]** on the Econt steps.
- `docs/TECDOC.md`: the `includeArticleLogisticsCriteria` finding (criteria ids, mm units,
  about 8% coverage, mostly control arms). With phase 2:
  - there is no published rate limit and no rate-limit header;
  - `dataSupplierIds` takes our full 896-brand list and matches any of them;
  - a type's listing comes back in blocks by brand, and `sort: articleNumber` does not
    change that;
  - product types are not leaf categories (9,218 types against 1,138 leaves; a leaf holds
    several types, and a type can sit in several leaves);
  - the assembly-group facet ignores a `genericArticleIds` filter.
- `docs/CROSS-REFERENCES.md`: the cart as a second consumer of the candidate set.
- `docs/CART.md`: `isShippingEstimated`.

## Known limitations (documented, not solved)
- **Our own line as a pair:** a cart line that is itself a two-disc pack, but is estimated from
  single-disc equivalents, is quoted at half its weight. It's rare, and cross-reference
  coverage of discs is already high.
- **Lockers:** estimated lines never go to a locker (about 11% of parts), which is conservative
  by design.
- **Types with no weighed article** get the global default. The builder report lists them.
  Filling a bulky one by hand would need an override that `replaceAll` keeps; that's not
  designed yet.
- **TecDoc's request quota is unknown.** Ask TecAlliance for the rate limit and monthly quota
  on our key, record them in `TECDOC.md`, and adjust the builder's pace.
- **Parts TecDoc doesn't list** (23% of in-stock identities) still can't be added to the cart.
  That's a separate spike (e.g. AUTOPLUS brand id `3323`).

## Verification
1. Quality gate: `npm run lint`, `npm run test` and `npm run test:e2e` in `apps/api`;
   `npm run lint` and `npm run test` in `apps/web`; `npm run lint` and `npm run type-check` at
   the root.
2. Locally (Docker Postgres/Redis, real TecDoc key), after flushing Redis:
   - add COMLINE `ADC1718V` (brand 421) to a cart. The line stores about 6,700 g with
     `isShippingEstimated = true`;
   - `GET /delivery/parcel?carrier=ECONT` returns a weight with `isLockerEligible: false`;
   - `POST /delivery/quote` returns an Econt price.
3. Phase 2: run `npm run parcel-profiles:build` against the local DB (about 3.5 h; stop it
   partway and check that `--resume` continues), then check the report and the table rows.
   - Brake discs, pads, alternators and starters each get a weight.
   - The types left without a weight are mostly long-tail tools and accessories. A random
     150-type sample had 67 of them, and they are a small share of our brands' articles.
   Then add a part with no catalogue, TecDoc or cross-reference weight (pick one from the
   spike's "left without a weight" list) and confirm it gets its type's weight.
4. Rerun `node scripts/parcel-estimate-coverage-probe.mjs --report <file>` to compare against
   the spike's numbers.
