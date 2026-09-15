CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tenants (name, slug)
SELECT 'Salted Grills', 'salted-grills'
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'salted-grills');

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  external_tenant_id TEXT,
  base_url TEXT NOT NULL,
  credential_ciphertext TEXT NOT NULL,
  credential_iv TEXT NOT NULL,
  credential_tag TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS ingredient_source_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'manual',
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  external_item_id TEXT,
  external_item_name TEXT,
  kitchen_unit TEXT,
  conversion_factor NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, ingredient_id),
  UNIQUE (integration_id, external_item_id)
);

CREATE TABLE IF NOT EXISTS costing_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'finalized',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, snapshot_date, label)
);

CREATE TABLE IF NOT EXISTS costing_snapshot_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES costing_snapshots(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  cost NUMERIC NOT NULL,
  selling_price NUMERIC,
  food_cost_percent NUMERIC,
  contribution NUMERIC,
  source_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS costing_snapshot_lines_snapshot_idx ON costing_snapshot_lines(snapshot_id);
CREATE INDEX IF NOT EXISTS ingredient_source_mappings_tenant_idx ON ingredient_source_mappings(tenant_id);

CREATE TABLE IF NOT EXISTS cost_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  current_value NUMERIC,
  previous_value NUMERIC,
  threshold_value NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cost_alerts_tenant_status_idx ON cost_alerts(tenant_id, status, created_at DESC);

ALTER TABLE IF EXISTS ingredients ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS categories ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS recipes ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS ingredient_prices ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS ingredient_prices ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE IF EXISTS ingredient_prices ADD COLUMN IF NOT EXISTS source_external_id TEXT;
ALTER TABLE IF EXISTS ingredient_prices ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
DECLARE
  default_tenant UUID;
BEGIN
  SELECT id INTO default_tenant FROM tenants WHERE slug = 'salted-grills' LIMIT 1;
  IF to_regclass('public.ingredients') IS NOT NULL THEN UPDATE ingredients SET tenant_id = default_tenant WHERE tenant_id IS NULL; END IF;
  IF to_regclass('public.categories') IS NOT NULL THEN UPDATE categories SET tenant_id = default_tenant WHERE tenant_id IS NULL; END IF;
  IF to_regclass('public.recipes') IS NOT NULL THEN UPDATE recipes SET tenant_id = default_tenant WHERE tenant_id IS NULL; END IF;
  IF to_regclass('public.ingredient_prices') IS NOT NULL THEN UPDATE ingredient_prices SET tenant_id = default_tenant WHERE tenant_id IS NULL; END IF;
END $$;

CREATE INDEX IF NOT EXISTS ingredients_tenant_idx ON ingredients(tenant_id);
CREATE INDEX IF NOT EXISTS categories_tenant_idx ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS recipes_tenant_idx ON recipes(tenant_id);
CREATE INDEX IF NOT EXISTS ingredient_prices_tenant_idx ON ingredient_prices(tenant_id, price_date DESC);
