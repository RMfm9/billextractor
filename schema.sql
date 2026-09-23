-- Run this once against your Vercel Postgres (or standalone Neon) database
-- before using the app. See README.md for how to run it.
--
-- Note: authentication has been removed, so this is a single-tenant schema -
-- there is no users table and no user_id column. Anyone who can reach the
-- site can see and edit all bills.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id),
  vendor_name TEXT NOT NULL,
  purchase_date DATE,
  invoice_number TEXT,
  gst NUMERIC,
  subtotal NUMERIC,
  total NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  unit_price NUMERIC,
  total_price NUMERIC,
  physically_verified BOOLEAN NOT NULL DEFAULT false,
  selling_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bills_date ON bills (purchase_date);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items (bill_id);

-- If you're upgrading an existing database that has the old user_id
-- columns, drop them instead of recreating the tables:
--   ALTER TABLE vendors DROP COLUMN IF EXISTS user_id;
--   ALTER TABLE bills DROP COLUMN IF EXISTS user_id;
--   DROP TABLE IF EXISTS users;
