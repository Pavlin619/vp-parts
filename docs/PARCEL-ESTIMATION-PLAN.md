# Plan: every cart line gets a parcel weight (cross-references + product-type fallback)

**Status: phase 1 implemented (2026-10-07); phase 2 not started.** Delete this file once both phases ship and their findings are folded into `DELIVERY-PROVIDERS.md`, `TECDOC.md`, `CROSS-REFERENCES.md` and `CART.md`.

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
profile, or null when there are fewer than `MIN_SAMPLES` (5).
- **Weight:** the median. For wide types (p75/p25 > 2, such as clutch kits, wheel-bearing kits
  and discs) use p75 instead, so we overcharge slightly rather than undercharge.
- **Box:** the median per sorted side when at least 3 samples have a full box; otherwise null.

### 2.3 Builder: a manual script (user's choice)
`apps/api/src/cli/build-product-type-parcel-profiles.ts`, a Nest standalone application
context, run with a new `npm run parcel-profiles:build -- --sample 30000`. It reuses
`TecDocTransport`, `articleLookupPayload` and the repositories.
1. **Sample:** N random distinct **in-stock** identities that the catalogue measures
   (`supplier_stock` + `autoparts`, with `availability > 0`). This comes from a read-only query
   on a small builder repository. Check that the shop role's column grants cover it
   (`infra/db/01-shop-provisioning.sql`).
2. **Read each part's type** with one TecDoc lookup (`includeGenericArticles` only), at limited
   concurrency with retries and backoff. Parts TecDoc doesn't find are skipped and counted.
3. **Group and store:** group by `genericArticleId`, run `aggregateProductTypeProfile`, then
   `replaceAll`.
4. **Report:** types written, types skipped below `MIN_SAMPLES`, and the global p75 weight
   (which feeds 2.4).

Sampling from parts we stock avoids both biases the spike found in TecDoc's per-type
listing: it is alphabetical by brand, and it mixes in truck parts (clutch kits came out at
36 kg). Run it before launch, then on demand.

### 2.4 Resolver step 4, and the global default
- In `ShippingProfileResolver`, after step 3: if the weight is still null, look up
  `ProductTypeParcelProfile` by the article read's `genericArticleIds[0]`. If no row exists,
  use the constant `UNKNOWN_PRODUCT_TYPE_PROFILE`: a weight from the builder's global p75 and
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
- `product-type-profile.spec.ts`: median, p75 for wide types, `MIN_SAMPLES`, box rules.
- Resolver spec: the table hit, the table miss → global default, `isEstimated`.
- Repository spec: `replaceAll` is transactional.
- Builder spec: mocked transport and repositories, covering grouping, skips and the report.
- Update the web specs listed above; `npm run test` must pass in `apps/web`.

---

## Docs (with each phase)
- `docs/DELIVERY-PROVIDERS.md`: replace "A part with no weight is not guessed" with the chain,
  the spike measurements (the tables above), the locker rule, and the
  builder runbook. Keep **[VERIFY]** on the Econt steps.
- `docs/TECDOC.md`: the `includeArticleLogisticsCriteria` finding (criteria ids, mm units,
  about 8% coverage, mostly control arms).
- `docs/CROSS-REFERENCES.md`: the cart as a second consumer of the candidate set.
- `docs/CART.md`: `isShippingEstimated`.

## Known limitations (documented, not solved)
- **Our own line as a pair:** a cart line that is itself a two-disc pack, but is estimated from
  single-disc equivalents, is quoted at half its weight. It's rare, and cross-reference
  coverage of discs is already high.
- **Lockers:** estimated lines never go to a locker (about 11% of parts), which is conservative
  by design.
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
3. Phase 2: run `npm run parcel-profiles:build -- --sample 2000` against the local DB and check
   the report and the table rows. Then add a part with no catalogue, TecDoc or cross-reference
   weight (pick one from the spike's "left without a weight" list) and confirm it gets its
   type's weight.
4. Rerun `node scripts/parcel-estimate-coverage-probe.mjs --report <file>` to compare against
   the spike's numbers.
