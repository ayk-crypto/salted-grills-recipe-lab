ALTER TABLE packaging_items
  ADD COLUMN IF NOT EXISTS purchase_to_storage_factor NUMERIC,
  ADD COLUMN IF NOT EXISTS storage_to_costing_factor NUMERIC;

UPDATE packaging_items
SET purchase_to_storage_factor = COALESCE(
      purchase_to_storage_factor,
      NULLIF(source_metadata->>'purchaseConversionFactor','')::numeric,
      CASE WHEN lower(COALESCE(purchase_unit,''))=lower(COALESCE(storage_unit,'')) THEN 1 ELSE NULL END
    ),
    storage_to_costing_factor = COALESCE(storage_to_costing_factor, units_per_storage_unit)
WHERE is_active=TRUE;

ALTER TABLE packaging_items ADD CONSTRAINT packaging_items_purchase_to_storage_factor_check
  CHECK (purchase_to_storage_factor IS NULL OR purchase_to_storage_factor > 0);
ALTER TABLE packaging_items ADD CONSTRAINT packaging_items_storage_to_costing_factor_check
  CHECK (storage_to_costing_factor IS NULL OR storage_to_costing_factor > 0);
