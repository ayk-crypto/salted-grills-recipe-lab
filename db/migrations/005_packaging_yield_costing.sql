ALTER TABLE packaging_items
  ADD COLUMN IF NOT EXISTS storage_unit TEXT,
  ADD COLUMN IF NOT EXISTS storage_unit_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS units_per_storage_unit NUMERIC,
  ADD COLUMN IF NOT EXISTS costing_unit TEXT NOT NULL DEFAULT 'each',
  ADD COLUMN IF NOT EXISTS costing_status TEXT NOT NULL DEFAULT 'ready';

UPDATE packaging_items
SET storage_unit = COALESCE(storage_unit, purchase_unit),
    storage_unit_cost = COALESCE(storage_unit_cost, unit_cost),
    costing_status = CASE
      WHEN lower(COALESCE(storage_unit, purchase_unit, '')) IN ('pc','pcs','piece','pieces','each') THEN 'ready'
      WHEN units_per_storage_unit IS NOT NULL AND units_per_storage_unit > 0 THEN 'ready'
      WHEN source_type = 'shelfsense' THEN 'needs_yield'
      ELSE costing_status
    END
WHERE is_active = TRUE;
