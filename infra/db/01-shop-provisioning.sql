-- Online-shop database provisioning for the SHARED "autoparts" Postgres instance.
--
-- The backoffice owns the Postgres server (container "autoparts-postgres") and the
-- "public" schema (managed by Liquibase). The online shop is a tenant: it gets a
-- least-privilege login role that owns its own "shop" schema and has read-only,
-- column-scoped access to the backoffice's stock tables: our own stock
-- (public.autoparts, the primary price/availability source) and the supplier
-- stock projection (public.supplier_stock, the fallback source).
--
-- The role name and password are passed in as psql variables (via -v), sourced from
-- environment variables, so NO secret is committed to the repo:
--   SHOP_DB_USER      - the shop login role name (e.g. shop_app)
--   SHOP_DB_PASSWORD  - that role's password
--
-- Run ONCE against the shared database as a superuser (e.g. postgres_admin), AFTER the
-- backoffice has applied its Liquibase migrations (so autoparts + supplier_stock exist).
-- Export the variables first (locally you can source them straight from the shop's .env),
-- then pass them to psql with -v (portable across all psql versions):
--
--   set -a && source apps/api/.env && set +a
--   psql "postgresql://postgres_admin:postgres_password@localhost:5432/autoparts" \
--        -v shop_db_user="$SHOP_DB_USER" \
--        -v shop_db_password="$SHOP_DB_PASSWORD" \
--        -f infra/db/01-shop-provisioning.sql
--
-- For production, supply a strong SHOP_DB_PASSWORD from your secret manager (it must
-- match the shop's DATABASE_URL). Idempotent: safe to re-run.

\set ON_ERROR_STOP on

-- The role name + password arrive as psql variables (-v shop_db_user / shop_db_password).
-- Fail fast with a clear error if either variable is missing.
\if :{?shop_db_user}
\else
DO $$ BEGIN RAISE EXCEPTION 'SHOP_DB_USER environment variable is not set'; END $$;
\endif
\if :{?shop_db_password}
\else
DO $$ BEGIN RAISE EXCEPTION 'SHOP_DB_PASSWORD environment variable is not set'; END $$;
\endif

-- 1. Least-privilege login role for the online shop: create if missing, then set the
--    password (ALTER is idempotent, so re-running the script is safe).
SELECT format('CREATE ROLE %I LOGIN', :'shop_db_user')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'shop_db_user')\gexec

SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'shop_db_user', :'shop_db_password')\gexec

-- 2. The shop owns its own schema (full DDL there for Prisma migrations) but has no
--    rights anywhere else in the database.
SELECT format('CREATE SCHEMA IF NOT EXISTS shop AUTHORIZATION %I', :'shop_db_user')\gexec
SELECT format('GRANT CONNECT ON DATABASE autoparts TO %I', :'shop_db_user')\gexec

-- 3. Read-only window into the backoffice's stock tables, if they exist yet.
--    The shop reads our own stock (public.autoparts) first and falls back to
--    public.supplier_stock. buy_price is required so the shop can pick the
--    supplier offering the best buy price within the fastest delivery day.
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'shop_db_user')
WHERE to_regclass('public.supplier_stock') IS NOT NULL
   OR to_regclass('public.autoparts') IS NOT NULL\gexec

-- 3a. Supplier stock projection (fallback source). Column list matches the
--     actual supplier_stock columns.
SELECT format(
  'GRANT SELECT (id, supplier_source, supplier_code, warehouse_code, '
  'availability, buy_price, sell_price, tecdoc_number, '
  'brand, description, last_synced_at) ON public.supplier_stock TO %I',
  :'shop_db_user')
WHERE to_regclass('public.supplier_stock') IS NOT NULL\gexec

-- 3b. Our own stock (primary source). Deliberately EXCLUDES cost/internal
--     columns (purchase_price, purchase_price_gross, min_price, offer_price,
--     retail_price, price_increase, notes, balances). The shop locks the
--     displayed price to our own sell_price_net / gross_price.
SELECT format(
  'GRANT SELECT (id, tecdoc_number, tecdoc_supplier_id, catalog_number, '
  'supplier_source, supplier_sku, brand, description, available_quantity, '
  'sell_price_net, gross_price, warehouse_number, location, in_price_list, '
  'updated_at) ON public.autoparts TO %I',
  :'shop_db_user')
WHERE to_regclass('public.autoparts') IS NOT NULL\gexec
