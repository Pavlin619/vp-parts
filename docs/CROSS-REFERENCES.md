# Cross-References — Design

**Status: implemented.** This replaced the OE fan-out that the *Substitutes are
OE-equivalence* section of `CLAUDE.md` used to describe; that section and the two
endpoint entries in
`specs/002-autoparts-shop-spec/contracts/api-endpoints.md` describe what shipped.
Where a number below differs from the code, the code is right and this document
should be corrected — the *Design* section records the sizes and thresholds as
built.

Every measurement below comes from the live TecDoc Pegasus 3.0 endpoint with our
key (23 Aug 2026), cross-checked against the XSD served at
`TecdocToCatDLB.soapEndpoint?xsd=1`. Nothing here is inferred from the onboarding
guide alone. The probe script is committed as
`apps/api/scripts/tecdoc-crossref-probe.ts`, so any figure can be re-measured.

> **One-line summary:** Ask the cross-reference index for the *complete* set of
> parts that replace this one in a single cheap call, order all of it by what we
> can actually ship, and pay for images and specs only on the rows a visitor
> reaches.

---

## Why the previous design was replaced

`ArticlesService.resolveOeEquivalents` read the part, took its first five OE
numbers, and ran one `getArticles` OE-number search per number, three at a time,
merging the five pages and cutting the result to 20.

Three things are wrong with it, in ascending order of importance.

**Four of the five searches produced nothing anybody saw.** Each search asked for
20 rows with `includeAll`, and the merged list was cut to 20, so the first search
alone filled the screen. Replaying that pipeline:

| Part | Calls | JSON parsed | Displayed rows from search 1 | From searches 2–5 |
|---|---|---|---|---|
| MANN-FILTER `W 712/75` | 6 | 1279 KB | 20 | 0 |
| BOSCH `0 986 494 104` | 6 | 1218 KB | 19 | 1 |
| A.B.S. `16100` | 2 | 146 KB | 19 | — |

**The 20 shown were the alphabetically first 20 brands.** TecDoc's default order
for a number search is by `mfrName` ascending, and we send no `sort`. So the
substitutes section opened on 1A FIRST AUTOMOTIVE, A.Z. Meisterteile, ABAKUS and
AIC every time, and stopped before the brands a mechanic recognises. Whether we
could sell any of them played no part in the selection.

**Recall depended on which OE number happened to be filed first.** A part carries
one OE number per marque that uses it, and they are not equally productive.
BOSCH `0 451 103 079` files 63 OE numbers, and the first of them returns 14
matches where the same part's cross-reference index returns 138; MANN
`W 712/75`'s first OE number returns 139. The five-number fan-out existed to
paper over that lottery — it was the cost being removed, so the replacement could
not depend on the pick.

---

## What the sources settle

These are answered, so they need no further verification.

**There is no call that returns a part's own cross-reference list.** The article
record has a `comparableNumbers` field, but the XSD says it is "only populated if
the comparable numbers match the search query", and a brand-scoped exact lookup
with `includeComparableNumbers: true` confirms it: the array came back empty.
`comparableNumbers` appears nowhere else in the schema;
`getDirectArticlesByIds7` offers `oeNumbers`, `replacedNumbers`,
`replacedByNumbers` and `usageNumbers`, none of which is a cross-reference.
**Equivalence is only reachable by searching a number.** This is why "just call
`getArticles` with our number and brand" cannot answer the question — that call
returns our own part.

**One call cannot carry several numbers.** `searchQuery` is a single `xs:string`.
An array is rejected with `Unable to parse request: Expected a String value but
got: START_ARRAY`, and space- or comma-joined numbers return zero matches.

**The comparable-number index is searchable and can be made precise.** A
`getArticles` search with `searchType: 3` on our own article number returns every
part whose supplier declared it interchangeable with ours. Two levers, both free
and both in the same response, remove the collisions that made this look
unusable:

- `genericArticleIds: [ga]` filters to the viewed part's type server-side. It
  cuts A.B.S. `16100` from 269 candidates to 58 brake discs.
- each row reports **whose** number it matched, in
  `comparableNumbers[].dataSupplierId` — the same id space as our `brandId`. A
  MEAT & DORIA air filter that also files `16100` is identified and dropped
  rather than shown. `searchQueryMatches` on the same row names the brand too,
  but by `mfrId` (`504` where MANN-FILTER's `dataSupplierId` is `4`), which is
  the unrelated id space `article-mapper.ts` already warns about — so the check
  reads `comparableNumbers`, never `searchQueryMatches`.

The earlier attempt recorded in `CLAUDE.md` used neither, which is why it read as
unfixable. Its conclusion — that a *bare* comparable-number search is unusable —
stands, and is why `keepCandidatesCiting` is not optional.

**The complete set fits one page, and `perPage` maxes out at 1000.** TecDoc
states the bound when it refuses one: `perPage: 2000` is rejected `400` with
`Field 'perPage' must be > 0 and <= 1000`. So 1000 is the service's own maximum,
not a figure of ours, and there is no page size left to raise.

The data sits well inside it. Measuring the candidate set of every part in four
seed populations — 418 parts across brake pads, brake discs and oil filters —
gives a median of 99 and a p90 of 206, and the widest is BREMBO `P 85 020` at
354. Nothing measured passed 500.

| Seed population | Parts | Median | p90 | Widest | Over 250 |
|---|---|---|---|---|---|
| FERODO `FDB1083` — brake pads | 120 | 99 | 206 | 354 (BREMBO `P 85 020`) | 5 |
| BOSCH `0 986 461 769` — brake pads | 120 | 87 | 192 | 354 (BREMBO `P 85 020`) | 4 |
| MANN `W 712/75` — oil filter | 120 | 51 | 117 | 156 | 0 |
| A.B.S. `16100` — brake disc | 58 | 19 | 64 | 70 | 0 |

`perPage` is a cap and not a fetch size, so the wide case is paid for only by the
parts that are wide: the same call costs 60 KB at `perPage: 250` and at
`perPage: 1000` when the set is 67 rows. Row weight is what costs, not row count:

| Response carries | Per row | Renders |
|---|---|---|
| identity, brand, description, provenance, hydration id | 669 B | number, brand, part name |
| + `includeMisc` (article status) | 943 B | above, plus discontinued flagging |
| + `includeImages` | 6.9 KB | the collapsed row, thumbnail included |
| + `includeArticleCriteria` | 9.2 KB | the row's three-spec summary line |
| + OE numbers, text | 27.3 KB | the expander, with no further reads |

The first two rows are measured on the whole 220-row set: 144 KB and 203 KB. At
the heavier weights the same set would run to 1.5–6 MB, which is the entire
reason detail is fetched per page rather than per list.

**`legacyArticleIds` hydrates by id.** The `legacyArticleId` on each candidate's
`genericArticles` entry feeds straight back into `getArticles`; five ids returned
the same five parts with criteria, OE numbers and images. One 20-id call returned
19 rows, so hydration must be defensive (see task 4).

**Article status rides on `misc`, per row.** `misc.articleStatusId` with
`includeMisc: true` — `1` normal, `0` in preparation, `2` not supplied, `8` out
of production, `9` no longer supplied by the manufacturer, `11` on request. The
`articleStatusIds` request filter also works (it cuts MANN `W 712/75` from 134 to
123), but **we do not use it**: a part out of production that we still hold in
stock is a part we can sell, and filtering upstream would hide it. Status becomes
an ordering input instead.

**TecDoc normalises punctuation on both sides of the match.** Searching
`W 712/75` matched rows filed as `W712/75` and `W 712/75` alike.

---

## The design

Four steps and one non-step, and only the fourth is expensive — it is paid per page
of rows a visitor actually reaches. `CrossReferencesService.getSubstitutes` reads top
to bottom in this order; `cross-references.tecdoc.ts` owns the search and the
hydration read, and `candidate-set.ts` owns steps 2, 3 and the paging.

### 1. The candidate set — one call, cached

```json
{
  "getArticles": {
    "articleCountry": "BG",
    "lang": "bg",
    "searchQuery": "<the viewed part's article number>",
    "searchType": 3,
    "searchMatchType": "exact",
    "genericArticleIds": [<the viewed part's genericArticleId>],
    "perPage": 1000,
    "page": 1,
    "includeGenericArticles": true,
    "includeComparableNumbers": true,
    "includeMisc": true
  }
}
```

Costs 341 KB at the widest case measured and carries, per candidate: identity
(`dataSupplierId` + `articleNumber`), `mfrName`, the part name from
`genericArticles[0].genericArticleDescription`, the `legacyArticleId` for
hydration, `misc.articleStatusId`, and the `comparableNumbers` entries that
matched.

`genericArticleId` is not on `ArticleCatalogDetailDto` today. It comes from the
same cached TecDoc detail read that already backs the detail page, carried beside
the DTO the way `CatalogArticlesPage` already carries `roles` beside its rows —
an internal side-channel, not a new public field.

**One call, and no paging loop.** `perPage` is already at TecDoc's maximum, so a
second page could only carry a set wider than 1000 — three times the widest of the
418 measured. `readCandidates` therefore reads once and compares
`totalMatchingArticles` against what arrived, warning if a set is ever cut short.
Saying so is the point: the ordering step ranks whatever it is handed, so a silent
truncation would let the parts we stock be the ones missing, which is the failure
this design replaced. A loop would put a larger guess in place of a measured bound
and maintain it for a case the data has never produced.

This is why the page size is 1000 rather than the 250 first shipped: at 250, five
of the 120 brake pads sampled overflowed, so ~4% of a dense category needed a
second round trip — and would have been silently truncated by dropping the loop
alone.

### 2. Precision — a pure function, no I/O

Keep a candidate only if one of its matched `comparableNumbers` entries has
`dataSupplierId === brandId` of the viewed part. Drop the viewed part itself,
compared on `(dataSupplierId, articleNumber)` so the other supplier's part filed
under the same number survives.

Nothing is deduplicated. A dedupe shipped first, for the old design's merge across
two reads; with one read it never fired. Measured: 0 repeated
`(dataSupplierId, articleNumber)` pairs in 542 candidate sets and 30,830 rows over
6 generic articles, and 0 of 300 parts where a supplier had filed one number more
than once — the only mechanism that could produce one. Note that 495 of those 542
sets *do* have a supplier contributing several rows under different numbers, which
is a brand's standard and premium versions and must be kept.

This is the whole precision story and it happens before a single image is
fetched. When it empties the list, that is the right answer: a wrong substitute
is a part a mechanic fits to the wrong car. Measured on 15 parts, it keeps ≥90%
of the page for 11 of them and correctly rejects nearly everything for the two
collision cases (FARE SA `23875`, ASMET `16.100`).

### 3. Order the whole set by what we can ship

One batch `InventoryService.getAvailability` read over every surviving candidate
number — one DB query, no TecDoc — then a stable sort:

1. in stock before out of stock;
2. among in-stock: fastest delivery band, then lowest `bestPriceIncVat`;
3. among out-of-stock: article status `1` before the discontinued statuses;
4. always: `brandName` then `articleNumber`, so paging is deterministic.

Step 2 ranks on the band rather than on `deliveryWorkDays` because two warehouses
file a nominal term of nought days: the central warehouse, which is our own shelf,
and `REGIONAL_1`, which ships today only if the order beats the supplier's
cut-off. On days alone they tie and price decides, which lists them interleaved
under badges that promise different things — the green dot and the blue one. The
band is `deliveryBand` in `packages/shared/src/delivery.ts`, and it is in the
shared contract precisely because the web draws the dot from it and the API sorts
by it; derived twice, the order and the badges would drift apart.

This step is the reason the candidate set is fetched whole. Sorting on stock only
works if the sort sees every candidate; today's design merges five arbitrary
pages and truncates at 20, so a part we stock may never be among the rows
considered.

The read is live and uncached, exactly as availability is treated everywhere
else — the cached artifact is the candidate set, and the ordering happens per
request. **`getAvailability` fails closed by design, and this one caller must
catch it**: a stock-DB outage has to degrade to catalogue order with a `warn`,
not take out the cross-reference list. The rows' own price and stock are hydrated
separately by the client, and *that* read keeps failing closed, so no buy box
ever renders a guess.

### 4. Hydrate the rendered page

```json
{
  "getArticles": {
    "articleCountry": "BG",
    "lang": "bg",
    "legacyArticleIds": [<the ids of the rows on this page>],
    "perPage": 25,
    "page": 1,
    "includeGenericArticles": true,
    "includeArticleText": true,
    "includeArticleCriteria": true,
    "includeOEMNumbers": true,
    "includeImages": true,
    "includeMisc": true
  }
}
```

A page measures 611 KB for 25 FERODO-equivalent brake pads, the heaviest set
sampled, and 108–185 KB for 20 rows of filters or the BOSCH pad set — the spread
is how many OE numbers and criteria each brand files, not the page size. The
shipped page size is 20, matching the availability endpoint's batch limit, since
each page is priced by one availability read of its own numbers.
`includeAll` is deliberately not used: `pdfs`, `links`,
`linkages`, `partsList`, `accessoryList`, `gtins` and `prices` are all in it and
none is rendered.

Rows are returned in candidate order, not TecDoc's; ids that resolve to nothing
are dropped rather than left as holes. One id per candidate is sent: a part
catalogued in two roles carries one per role and both resolve to the same article,
so the second would buy a duplicate row.

### 5. A thin answer is the answer

The comparable index only contains suppliers who explicitly cite our brand, so a
small or obscure brand can come back nearly empty — 3 of the 15 sampled parts. It
is served that way. There is no second source and no top-up.

An OE-number fallback shipped first and was removed. Three reasons, in ascending
order of importance. It was **complexity for a rare path**: a sparse threshold, a
sequential search loop with its own limit, a merge across reads, and `oe-equivalents.ts`
with its tests, for a case a minority of parts reach. It made the reads
**unpredictable** — a part could cost one TecDoc call or four, decided by data
nobody could see from the outside. And it **answered a different question**: "which
parts fit the same original" is not "which parts replace this part", so the top-up
mixed two relations into one list and only under the list's own threshold, meaning
two visitors could see rows selected by different rules.

What replaced it is the sentence at the top: how many suppliers cite a brand is a
property of TecDoc's data. Reporting five when the index holds five is honest;
padding to fifteen from a looser relation is not.

---

## API contract changes

**`GET /catalog/brands/:brandId/articles/:articleNumber/substitutes`** is
paginated: `?page=1&pageSize=20` (`pageSize` clamped to `1…50`), returning
`PaginatedCatalogArticlesDto` — the same shape the listing grid returns — where it
used to return `ArticleSummaryDto[]`. `total` is the candidate count after step 2,
so the section names how many alternatives are left and offers *show more* until
they are exhausted. `SUBSTITUTES_LIMIT` is gone. This was a breaking change to a
route the web app is the only consumer of, so both moved together.

**`GET /catalog/brands/:brandId/articles/:articleNumber/alternative-numbers`**
keeps its shape and has lost its cap. It needs number and brand only, which the
candidate set already carries, so it is answered from step 2 with **no hydration
at all** — one 203 KB call at worst, down from six.

Both stay brand-scoped, and both keep serving `200` with an empty payload for a
part with no cross-references.

The web section uses `useInfiniteQuery`: it is inside a row a visitor already
expanded, so replacing the rows they are reading with a different page would lose
their place. Each fetched page keeps its own cache entry and is priced by its own
availability read, which is what keeps a batch inside
`AVAILABILITY_MAX_ARTICLE_NUMBERS` however many pages are open.

---

## Caching

| Key | Holds | TTL |
|---|---|---|
| `tecdoc:crossrefs:{brandId}:{articleNumber}` | the step-2 candidate set | 24 h hit / 1 h empty |
| `tecdoc:article-row:{brandId}:{articleNumber}` | one hydrated row | 24 h |

The candidate key replaced `tecdoc:substitutes:{brandId}:{articleNumber}` and
still serves both endpoints, so opening either surface warms the other. The
single-article read behind the detail page moved to
`tecdoc:article-read:{brandId}:{articleNumber}` (24 h), because the
cross-reference resolution needs the same response's generic article and OE
numbers: opening the substitutes tab on a page already rendered costs only the
cross-reference search itself.

Hydrated rows are cached **per row, not per page**, because the ordering is live:
a page-number key would serve yesterday's ordering, and an id-set key would miss
whenever stock moved a row across a page boundary. Per-row caching also means a
part appearing in two different lists is fetched once. This needed one new
primitive on `RedisCache` — `cachedMany`, an `mget` followed by a pipelined
write — which is also what the listing grid will want later.

---

## Where it lives

Everything server-side is one package, `apps/api/src/catalog/articles/cross-references/`,
reached through its barrel. The two things it does not own are the candidate mapping
(which belongs to the TecDoc layer, because the mock client answers with candidates
too) and the article read it starts from (shared with the detail page).

| Concern | File |
|---|---|
| The two routes | `cross-references/cross-references.controller.ts` |
| Orchestration and caching | `cross-references/cross-references.service.ts` |
| The candidate search and the hydration read | `cross-references/cross-references.tecdoc.ts` |
| Provenance filter, self-drop, ordering, paging (pure) | `cross-references/candidate-set.ts` |
| Candidate shape and mapping | `apps/api/src/tecdoc/cross-reference-mapper.ts` |
| The article read step 1 starts from, shared with the detail page | `apps/api/src/catalog/articles/article-read.ts` |
| The delivery band the ordering ranks by, shared with the web's dot colour | `packages/shared/src/delivery.ts` |
| Page bounds on both catalog routes | `ArticlePageQueryDto` in `apps/api/src/catalog/articles/articles.dto.ts` |
| Per-row batch caching | `RedisCache.cachedMany` in `apps/api/src/redis/redis-cache.ts` |
| The paged section and its *show more* | `apps/web/src/components/catalog/article-row/article-row-substitutes.tsx` |
| The live probe behind every figure here | `apps/api/scripts/tecdoc-crossref-probe.ts` |

The probe is the one file with no unit test of its own: it is a script that calls
the live endpoint, and its output is the tables above.

---

## Alternatives rejected

**One OE-number search instead of five** (smallest possible diff). Keeps the
current semantics and cuts the cost immediately, but leaves recall hostage to
which OE number is filed first — 14 matches against a sibling number's 116. It also
answers a different question: two parts fitting one original are not necessarily
replacements for each other, which is why it is not a source here at all, primary
or fallback.

**A single comparable-number search returning full rows.** One call instead of
two, but it must over-fetch heavy rows to survive the provenance filter (25 rows
fetched, 17 kept on A.B.S. `16100`) and it can only order within the page it
fetched, so it cannot rank by availability. Strictly worse than steps 1–4 at
similar cost.

**`getArticleDirectSearchAllNumbersWithState` with `numberType: 3`** as the
candidate call. Genuinely cheap (147 rows in 31 KB, no paging) and it carries
`articleStateId` and the hydration id, but it never says whose number matched, so
precision would rest on the part-type filter alone — 78% on A.B.S. `16100`
against ~100% with provenance. Its counts agree exactly with the `getArticles`
totals (58 and 71 on the two `16100` parts), which is useful corroboration that
both read the same index.

**Comparable-number search without the part-type filter.** Correct after the
provenance filter, but fetches 269 candidates to keep ~45 on a collision-prone
number. The filter is free; not using it is just a bigger response.

**`searchType: 4` / `5` (replacement / replaced number).** Both return 0 for the
parts sampled. They are a supplier's own successor parts, not cross-brand
equivalence — the right source for a "superseded by" notice, unrelated to this.

---

## Open questions and known limits

- **Ordering accuracy for shared numbers.** `InventoryService.getAvailability` is
  keyed on `tecdoc_number` alone (see its `TODO(inventory-brand-scope)`), so two
  brands filing the same number share one availability entry and may sort wrongly
  against each other. Pre-existing; this design surfaces it more often because it
  now sorts on that data.
- **Live ordering versus paging.** Page 2 can shift if stock changes between
  requests. The `(brandName, articleNumber)` tiebreak bounds the drift; if it
  becomes visible, the answer is a snapshot token on the first page rather than
  caching the order.
- **A candidate set above 1000** would be truncated, and only a `warn` says so.
  Three times the widest of 418 parts measured, but the ceiling is TecDoc's own
  `perPage` maximum, so the fix if it ever fires is a second call, not a larger
  page.
- **Coverage is asymmetric by nature.** A brand nobody cross-references gets a
  short list, and a brand many suppliers cite gets a long one. That is a property
  of the data rather than of the design, and a short or empty section is a
  legitimate answer — see step 5 for why it is not padded from a second source.
