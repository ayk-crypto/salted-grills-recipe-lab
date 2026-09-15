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

ALTER TABLE IF EXISTS ingredients ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS categories ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS recipes ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS ingredient_prices ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE IF EXISTS ingredient_prices ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE IF EXISTS ingredient_prices ADD COLUMN IF NOT EXISTS source_external_id TEXT;
ALTER TABLE IF EXISTS ingredient_prices ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE ingredients SET tenant_id=(SELECT id FROM tenants WHERE slug='salted-grills' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE categories SET tenant_id=(SELECT id FROM tenants WHERE slug='salted-grills' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE recipes SET tenant_id=(SELECT id FROM tenants WHERE slug='salted-grills' LIMIT 1) WHERE tenant_id IS NULL;
UPDATE ingredient_prices SET tenant_id=(SELECT id FROM tenants WHERE slug='salted-grills' LIMIT 1) WHERE tenant_id IS NULL;

ALTER TABLE ingredients ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE categories ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE ingredient_prices ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_name_key;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_name_key;

ALTER TABLE ingredients ADD CONSTRAINT ingredients_tenant_name_key UNIQUE (tenant_id,name);
ALTER TABLE categories ADD CONSTRAINT categories_tenant_name_key UNIQUE (tenant_id,name);
ALTER TABLE recipes ADD CONSTRAINT recipes_tenant_name_key UNIQUE (tenant_id,name);

ALTER TABLE ingredients ADD CONSTRAINT ingredients_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE categories ADD CONSTRAINT categories_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE recipes ADD CONSTRAINT recipes_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE ingredient_prices ADD CONSTRAINT ingredient_prices_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ingredients_tenant_idx ON ingredients(tenant_id);
CREATE INDEX IF NOT EXISTS categories_tenant_idx ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS recipes_tenant_idx ON recipes(tenant_id);
CREATE INDEX IF NOT EXISTS ingredient_prices_tenant_idx ON ingredient_prices(tenant_id,price_date DESC);

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
  UNIQUE (tenant_id,provider)
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
  UNIQUE (tenant_id,ingredient_id),
  UNIQUE (integration_id,external_item_id)
);

CREATE TABLE IF NOT EXISTS costing_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'finalized',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id,snapshot_date,label)
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

CREATE INDEX IF NOT EXISTS ingredient_source_mappings_tenant_idx ON ingredient_source_mappings(tenant_id);
CREATE INDEX IF NOT EXISTS costing_snapshot_lines_snapshot_idx ON costing_snapshot_lines(snapshot_id);
CREATE INDEX IF NOT EXISTS cost_alerts_tenant_status_idx ON cost_alerts(tenant_id,status,created_at DESC);
