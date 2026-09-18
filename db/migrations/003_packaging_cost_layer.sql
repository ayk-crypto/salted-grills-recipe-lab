ALTER TABLE packaging_items ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE packaging_items ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE packaging_items ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL;
ALTER TABLE packaging_items ADD COLUMN IF NOT EXISTS external_item_id TEXT;
ALTER TABLE packaging_items ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE packaging_items ADD COLUMN IF NOT EXISTS last_source_sync_at TIMESTAMPTZ;
UPDATE packaging_items SET tenant_id=(SELECT id FROM tenants WHERE slug='salted-grills' LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE packaging_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE packaging_items DROP CONSTRAINT IF EXISTS packaging_items_tenant_fkey;
ALTER TABLE packaging_items ADD CONSTRAINT packaging_items_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS packaging_items_name_active_uq;
CREATE UNIQUE INDEX IF NOT EXISTS packaging_items_tenant_name_active_uq ON packaging_items(tenant_id,lower(name)) WHERE is_active=TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS packaging_items_integration_external_uq ON packaging_items(integration_id,external_item_id) WHERE integration_id IS NOT NULL AND external_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS packaging_items_tenant_idx ON packaging_items(tenant_id,is_active,name);

CREATE TABLE IF NOT EXISTS packaging_sets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name TEXT NOT NULL, notes TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS packaging_sets_tenant_name_uq ON packaging_sets(tenant_id,lower(name)) WHERE is_active=TRUE;

CREATE TABLE IF NOT EXISTS packaging_set_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), packaging_set_id UUID NOT NULL REFERENCES packaging_sets(id) ON DELETE CASCADE,
 packaging_item_id UUID NOT NULL REFERENCES packaging_items(id) ON DELETE RESTRICT,
 quantity NUMERIC NOT NULL DEFAULT 1 CHECK(quantity>0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(packaging_set_id,packaging_item_id)
);

CREATE TABLE IF NOT EXISTS category_packaging_defaults (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
 packaging_set_id UUID NOT NULL REFERENCES packaging_sets(id) ON DELETE RESTRICT,
 order_type TEXT NOT NULL DEFAULT 'default' CHECK(order_type IN ('default','dine_in','takeaway','delivery')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(tenant_id,category_id,order_type)
);

CREATE TABLE IF NOT EXISTS recipe_packaging_defaults (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
 packaging_set_id UUID NOT NULL REFERENCES packaging_sets(id) ON DELETE RESTRICT,
 order_type TEXT NOT NULL DEFAULT 'default' CHECK(order_type IN ('default','dine_in','takeaway','delivery')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(tenant_id,recipe_id,order_type)
);