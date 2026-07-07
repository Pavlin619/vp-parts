-- TEST-ONLY schema for the backoffice-owned stock tables.
--
-- In production these two tables (public.autoparts, public.supplier_stock) are
-- owned and migrated by the Spring Boot backoffice (Liquibase); the online shop
-- only reads them. They therefore live OUTSIDE this repo's Prisma schema, so a
-- fresh CI database never has them — which breaks any e2e test that exercises
-- the live availability read.
--
-- This file recreates JUST the columns the shop reads (see the GRANT lists in
-- 01-shop-provisioning.sql) plus the extra columns the mock seed writes
-- (`name`, `currency`), so that:
--   1. 02-mock-stock-seed.sql can INSERT its scenarios, and
--   2. AutopartsRepository / SupplierStockRepository can SELECT them.
--
-- It is a FIXTURE, not the source of truth. Keep it in sync with the columns the
-- shop actually reads if the backoffice schema changes. Run it BEFORE the seed:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/db/00-backoffice-stock-schema.test.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/db/02-mock-stock-seed.sql
--
-- Idempotent: safe to re-run.

\set ON_ERROR_STOP on

-- Our own stock (primary price/availability source).
CREATE TABLE IF NOT EXISTS public.autoparts (
  id                  BIGSERIAL PRIMARY KEY,
  catalog_number      TEXT,
  name                TEXT,
  tecdoc_number       TEXT,
  tecdoc_supplier_id  TEXT,
  supplier_source     TEXT,
  supplier_sku        TEXT,
  brand               TEXT,
  description         TEXT,
  available_quantity  INTEGER,
  sell_price_net      NUMERIC(12, 2),
  gross_price         NUMERIC(12, 2),
  currency            TEXT,
  in_price_list       BOOLEAN,
  warehouse_number    INTEGER,
  location            TEXT,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS autoparts_tecdoc_number_idx
  ON public.autoparts (tecdoc_number);

-- Supplier stock projection (fallback source).
CREATE TABLE IF NOT EXISTS public.supplier_stock (
  id               BIGSERIAL PRIMARY KEY,
  supplier_source  TEXT,
  supplier_code    TEXT,
  warehouse_code   TEXT,
  availability     INTEGER,
  buy_price        NUMERIC(12, 2),
  sell_price       NUMERIC(12, 2),
  tecdoc_number    TEXT,
  brand            TEXT,
  description      TEXT,
  last_synced_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_stock_tecdoc_number_idx
  ON public.supplier_stock (tecdoc_number);
