-- Mock stock seed for LOCAL testing of price & availability.
--
-- Fills public.autoparts (our own stock) and public.supplier_stock (supplier
-- fallback) with data for the catalog's mock article numbers so every
-- availability / delivery / pricing scenario can be exercised end-to-end. The
-- catalog article numbers below come from apps/api/src/catalog/tecdoc/
-- tecdoc-mock-client.ts; the TEST-* numbers are synthetic edge cases reachable
-- by typing the URL directly (the mock client returns a default detail page for
-- any unknown article number).
--
-- The inventory layer joins strictly on `tecdoc_number = <articleNumber>`
-- (exact match), so tecdoc_number MUST equal the article number verbatim.
--
-- Warehouse -> customer-facing warehouse mapping (see apps/api/src/inventory/
-- delivery.ts + warehouse.ts):
--   INTERCARS  B24                         -> WITHIN_HOUR            -> CENTRAL
--   INTERCARS  B01/B02                     -> SAME_DAY_BEFORE_CUTOFF -> REGIONAL_1
--   INTERCARS  HZA/R00                     -> TWO_BUSINESS_DAYS      -> ROMANIA
--   INTERCARS  HSN                         -> THREE_BUSINESS_DAYS    -> POLAND
--   AUTOPLUS   MAGAZIN_PLEVEN              -> WITHIN_HOUR            -> CENTRAL
--   AUTOPLUS   CENTRALEN_SKLAD/LOVECH/...  -> SAME_DAY_BEFORE_CUTOFF -> REGIONAL_1
--   AUTOKOMERS CENTRAL                     -> NEXT_DAY               -> REGIONAL_2
--   AUTO1      CENTRAL                     -> NEXT_DAY               -> REGIONAL_2
--   AUTO1      REGIONAL                    -> TWO_BUSINESS_DAYS      -> ROMANIA
--   (our own public.autoparts stock)       -> IN_STOCK               -> CENTRAL
--
-- Supplier sell_price is VAT-inclusive; the shop derives ex-VAT with VAT_RATE
-- (default 0.20). Own stock stores both sell_price_net and gross_price.
--
-- Run as the DB owner (NOT the read-only shop_app role). Idempotent: it deletes
-- its own rows first, so it is safe to re-run.
--
--   psql "postgresql://postgres_admin:postgres_password@localhost:5432/autoparts" \
--        -f infra/db/02-mock-stock-seed.sql

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Clean up any previous run of THIS seed (never touches OX 982D real-ish data).
-- ---------------------------------------------------------------------------
DELETE FROM public.supplier_stock
WHERE tecdoc_number IN (
  'OF-OC115', 'OF-WL7090', 'BD-0986478451', 'BD-DF4074',
  'BP-0986494061', 'AF-C2585', 'SA-343347',
  'TEST-OOS', 'TEST-BAD-WAREHOUSE', 'TEST-OWN-ZERO', 'TEST-OWN-PREMIUM',
  'TEST-QTY-1', 'TEST-QTY-SPLIT', 'TEST-QTY-ZERO-FAST'
);

DELETE FROM public.autoparts
WHERE tecdoc_number IN (
  'OF-OC115', 'SA-343347', 'TEST-OWN-ZERO', 'TEST-OWN-PREMIUM',
  'TEST-QTY-1'
);

-- ===========================================================================
-- SCENARIO 1 — OF-OC115 : our OWN stock only (CENTRAL / IN_STOCK)
--   Expected: available, IN_STOCK, est 0 days, price 8.50 / 10.20 (OUR price),
--   1 warehouse (CENTRAL) qty 25, within-the-hour pickup clock time.
-- ===========================================================================
INSERT INTO public.autoparts
  (catalog_number, name, tecdoc_number, supplier_source, brand, description,
   available_quantity, sell_price_net, gross_price, currency, in_price_list,
   warehouse_number)
VALUES
  ('OC115', 'Маслен филтър', 'OF-OC115', 'INTERNAL', 'MANN-FILTER',
   'Oil Filter', 25, 8.50, 10.20, 'EUR', true, 0);

-- ===========================================================================
-- SCENARIO 2 — OF-WL7090 : supplier WITHIN_HOUR only (CENTRAL)
--   Expected: available, DELIVERY_WITHIN_HOUR, est 0, price 8.00 / 9.60
--   (derived from supplier sell 9.60), CENTRAL qty 6, within-the-hour pickup.
-- ===========================================================================
INSERT INTO public.supplier_stock
  (supplier_source, supplier_code, warehouse_code, availability,
   buy_price, sell_price, tecdoc_number, brand, description)
VALUES
  ('AUTOPLUS', 'WL7090-PLEVEN', 'MAGAZIN_PLEVEN', 6,
   5.00, 9.60, 'OF-WL7090', 'WIX Filters', 'Oil Filter');

-- ===========================================================================
-- SCENARIO 3 — BD-0986478451 : supplier SAME_DAY only (REGIONAL_1)
--   CLOCK-DEPENDENT. Before 11:00 (Sofia) -> DELIVERY_SAME_DAY (est 0);
--   at/after 11:00 -> DELIVERY_NEXT_DAY (est 1). Cut-off 11:00.
--   Near-cut-off notice shows only within 3h before 11:00.
--   Price 28.00 / 33.60. REGIONAL_1 qty 4.
-- ===========================================================================
INSERT INTO public.supplier_stock
  (supplier_source, supplier_code, warehouse_code, availability,
   buy_price, sell_price, tecdoc_number, brand, description)
VALUES
  ('AUTOPLUS', 'BD986478451-CS', 'CENTRALEN_SKLAD', 4,
   20.00, 33.60, 'BD-0986478451', 'Bosch', 'Brake Disc');

-- ===========================================================================
-- SCENARIO 4 — BD-DF4074 : supplier NEXT_DAY only (REGIONAL_2)
--   Expected: DELIVERY_NEXT_DAY, est 1, cut-off 17:00, pickup +1 working day,
--   courier +2. Price 33.00 / 39.60. REGIONAL_2 qty 3.
-- ===========================================================================
INSERT INTO public.supplier_stock
  (supplier_source, supplier_code, warehouse_code, availability,
   buy_price, sell_price, tecdoc_number, brand, description)
VALUES
  ('AUTOKOMERS', 'DF4074-CENTRAL', 'CENTRAL', 3,
   22.00, 39.60, 'BD-DF4074', 'Ferodo', 'Brake Disc');

-- ===========================================================================
-- SCENARIO 5 — BP-0986494061 : supplier 2 BUSINESS DAYS only (ROMANIA)
--   Expected: DELIVERY_IN_2_DAYS, est 2, cut-off 17:00. Price 20.00 / 24.00.
--   ROMANIA qty 8.
-- ===========================================================================
INSERT INTO public.supplier_stock
  (supplier_source, supplier_code, warehouse_code, availability,
   buy_price, sell_price, tecdoc_number, brand, description)
VALUES
  ('INTERCARS', 'BP494061-R00', 'R00', 8,
   12.00, 24.00, 'BP-0986494061', 'Bosch', 'Brake Pad Set, disc brake');

-- ===========================================================================
-- SCENARIO 6 — AF-C2585 : supplier 3 BUSINESS DAYS only (POLAND, slowest)
--   Expected: DELIVERY_IN_3_DAYS, est 3, cut-off 17:00. Price 10.00 / 12.00.
--   POLAND qty 15.
-- ===========================================================================
INSERT INTO public.supplier_stock
  (supplier_source, supplier_code, warehouse_code, availability,
   buy_price, sell_price, tecdoc_number, brand, description)
VALUES
  ('INTERCARS', 'AFC2585-HSN', 'HSN', 15,
   6.00, 12.00, 'AF-C2585', 'MANN-FILTER', 'Air Filter');

-- ===========================================================================
-- SCENARIO 7 — SA-343347 : OWN + MULTI-WAREHOUSE split (the rich case)
--   Own stock (CENTRAL) + supplier within-hour (CENTRAL) + supplier next-day
--   (REGIONAL_2) + supplier 3-day (POLAND). Exercises quantity-aware warehouse
--   selection AND the "we never undercut our supplier" price protection.
--
--   Own inc-VAT price is 48.00 but the fastest supplier we would source from
--   (INTERCARS B24, within-hour) sells at 66.00, so the DISPLAYED price is
--   raised to 66.00 / 55.00 (ex).
--
--   Warehouse quantities: CENTRAL 5 (own 2 + B24 3), REGIONAL_2 5, POLAND 20.
--   Total 30 (buy-box stepper caps here).
--   Headline: IN_STOCK, est 0 (own is fastest).
--   Quantity-aware date: 1-5 -> CENTRAL, 6-10 -> REGIONAL_2, 11-30 -> POLAND.
-- ===========================================================================
INSERT INTO public.autoparts
  (catalog_number, name, tecdoc_number, supplier_source, brand, description,
   available_quantity, sell_price_net, gross_price, currency, in_price_list,
   warehouse_number)
VALUES
  ('343347', 'Амортисьор', 'SA-343347', 'INTERNAL', 'Monroe',
   'Shock Absorber', 2, 40.00, 48.00, 'EUR', true, 0);

INSERT INTO public.supplier_stock
  (supplier_source, supplier_code, warehouse_code, availability,
   buy_price, sell_price, tecdoc_number, brand, description)
VALUES
  ('INTERCARS',  'SA343347-B24', 'B24',     3, 30.00, 66.00, 'SA-343347', 'Monroe', 'Shock Absorber'),
  ('AUTOKOMERS', 'SA343347-CEN', 'CENTRAL', 5, 28.00, 60.00, 'SA-343347', 'Monroe', 'Shock Absorber'),
  ('INTERCARS',  'SA343347-HSN', 'HSN',    20, 25.00, 54.00, 'SA-343347', 'Monroe', 'Shock Absorber');

-- ===========================================================================
-- EDGE CASE 8 — TEST-OOS : supplier row with availability 0 -> excluded
--   Expected: unavailable, OUT_OF_STOCK, price null, no warehouses.
-- ===========================================================================
INSERT INTO public.supplier_stock
  (supplier_source, supplier_code, warehouse_code, availability,
   buy_price, sell_price, tecdoc_number, brand, description)
VALUES
  ('INTERCARS', 'TESTOOS-B01', 'B01', 0,
   5.00, 10.00, 'TEST-OOS', 'MockBrand', 'Out of stock test part');

-- ===========================================================================
-- EDGE CASE 9 — TEST-BAD-WAREHOUSE : unknown warehouse code -> dropped offer
--   The delivery resolver logs an ALERT and drops the line (no delivery rule).
--   Expected: unavailable, OUT_OF_STOCK, and an ALERT line in the API log.
-- ===========================================================================
INSERT INTO public.supplier_stock
  (supplier_source, supplier_code, warehouse_code, availability,
   buy_price, sell_price, tecdoc_number, brand, description)
VALUES
  ('INTERCARS', 'TESTBADWH-ZZZ', 'ZZZ_UNKNOWN', 7,
   5.00, 10.00, 'TEST-BAD-WAREHOUSE', 'MockBrand', 'Unknown-warehouse test part');

-- ===========================================================================
-- EDGE CASE 10 — TEST-OWN-ZERO : we carry it but hold 0, no supplier
--   Expected: unavailable, OUT_OF_STOCK, but our price still surfaces
--   (ex 10.00 / inc 12.00). No warehouses.
-- ===========================================================================
INSERT INTO public.autoparts
  (catalog_number, name, tecdoc_number, supplier_source, brand, description,
   available_quantity, sell_price_net, gross_price, currency, in_price_list,
   warehouse_number)
VALUES
  ('TESTOWNZERO', 'Празна наличност', 'TEST-OWN-ZERO', 'INTERNAL', 'MockBrand',
   'Own-stock-zero test part', 0, 10.00, 12.00, 'EUR', true, 0);

-- ===========================================================================
-- EDGE CASE 11 — TEST-OWN-PREMIUM : our price HIGHER than the supplier
--   Own inc 60.00 vs supplier (within-hour) sell 55.00. We keep OUR price
--   (we don't drop to the supplier). Expected: IN_STOCK, price 50.00 / 60.00,
--   CENTRAL qty 9 (own 4 + supplier 5).
-- ===========================================================================
INSERT INTO public.autoparts
  (catalog_number, name, tecdoc_number, supplier_source, brand, description,
   available_quantity, sell_price_net, gross_price, currency, in_price_list,
   warehouse_number)
VALUES
  ('TESTOWNPREM', 'Собствена по-висока цена', 'TEST-OWN-PREMIUM', 'INTERNAL',
   'MockBrand', 'Own-premium test part', 4, 50.00, 60.00, 'EUR', true, 0);

INSERT INTO public.supplier_stock
  (supplier_source, supplier_code, warehouse_code, availability,
   buy_price, sell_price, tecdoc_number, brand, description)
VALUES
  ('INTERCARS', 'TESTOWNPREM-B24', 'B24', 5,
   30.00, 55.00, 'TEST-OWN-PREMIUM', 'MockBrand', 'Own-premium test part');

-- ===========================================================================
-- QUANTITY CASE 12 — TEST-QTY-1 : only ONE unit in stock (quantity cap)
--   Expected: IN_STOCK, CENTRAL qty 1. Buy-box stepper caps at 1 ("+" disabled,
--   "-" disabled). Proves the customer can never order more than we hold.
-- ===========================================================================
INSERT INTO public.autoparts
  (catalog_number, name, tecdoc_number, supplier_source, brand, description,
   available_quantity, sell_price_net, gross_price, currency, in_price_list,
   warehouse_number)
VALUES
  ('TESTQTY1', 'Единична бройка', 'TEST-QTY-1', 'INTERNAL', 'MockBrand',
   'Single-unit test part', 1, 15.00, 18.00, 'EUR', true, 0);

-- ===========================================================================
-- QUANTITY CASE 13 — TEST-QTY-SPLIT : thin stock spread across 3 warehouses
--   CENTRAL 1 (within-hour), REGIONAL_2 1 (next-day), POLAND 2 (3-day). Total 4.
--   Headline: DELIVERY_WITHIN_HOUR, CENTRAL 1.
--   The delivery date DEGRADES as the requested quantity grows, and warehouses
--   that can't cover the selected quantity are dimmed in the by-warehouse dialog:
--     qty 1 -> CENTRAL (within hour)
--     qty 2 -> REGIONAL_2 (next day)  [CENTRAL dimmed]
--     qty 3-4 -> POLAND (3 days)      [CENTRAL + REGIONAL_2 dimmed]
--   Stepper caps at 4.
-- ===========================================================================
INSERT INTO public.supplier_stock
  (supplier_source, supplier_code, warehouse_code, availability,
   buy_price, sell_price, tecdoc_number, brand, description)
VALUES
  ('INTERCARS',  'QTYSPLIT-B24', 'B24',     1, 8.00, 18.00, 'TEST-QTY-SPLIT', 'MockBrand', 'Thin-split test part'),
  ('AUTOKOMERS', 'QTYSPLIT-CEN', 'CENTRAL', 1, 8.00, 18.00, 'TEST-QTY-SPLIT', 'MockBrand', 'Thin-split test part'),
  ('INTERCARS',  'QTYSPLIT-HSN', 'HSN',     2, 8.00, 18.00, 'TEST-QTY-SPLIT', 'MockBrand', 'Thin-split test part');

-- ===========================================================================
-- QUANTITY CASE 14 — TEST-QTY-ZERO-FAST : fast warehouse holds 0, slow holds stock
--   A supplier lists the part in a within-hour warehouse but with 0 on hand,
--   and stocks it in a 2-day warehouse. The empty (fast) warehouse is dropped
--   entirely — it must NOT appear in the breakdown or influence the headline.
--   Expected: DELIVERY_IN_2_DAYS, only ROMANIA shows qty 5.
-- ===========================================================================
INSERT INTO public.supplier_stock
  (supplier_source, supplier_code, warehouse_code, availability,
   buy_price, sell_price, tecdoc_number, brand, description)
VALUES
  ('INTERCARS', 'QTYZERO-B24', 'B24', 0, 10.00, 21.60, 'TEST-QTY-ZERO-FAST', 'MockBrand', 'Zero-fast test part'),
  ('INTERCARS', 'QTYZERO-R00', 'R00', 5, 10.00, 21.60, 'TEST-QTY-ZERO-FAST', 'MockBrand', 'Zero-fast test part');

COMMIT;

-- ---------------------------------------------------------------------------
-- Sanity check: what got seeded.
-- ---------------------------------------------------------------------------
SELECT 'autoparts' AS tbl, tecdoc_number, available_quantity AS qty,
       sell_price_net AS net, gross_price AS gross
FROM public.autoparts
WHERE tecdoc_number IN ('OF-OC115','SA-343347','TEST-OWN-ZERO','TEST-OWN-PREMIUM')
UNION ALL
SELECT 'supplier_stock', tecdoc_number || ' / ' || supplier_source || ' / ' || warehouse_code,
       availability, buy_price, sell_price
FROM public.supplier_stock
WHERE tecdoc_number LIKE 'OF-%' OR tecdoc_number LIKE 'BD-%'
   OR tecdoc_number LIKE 'BP-%' OR tecdoc_number LIKE 'AF-%'
   OR tecdoc_number LIKE 'SA-%' OR tecdoc_number LIKE 'TEST-%'
ORDER BY 1, 2;
