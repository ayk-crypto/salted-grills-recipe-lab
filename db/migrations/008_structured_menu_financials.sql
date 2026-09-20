ALTER TABLE recipe_versions
  ADD COLUMN IF NOT EXISTS selling_price NUMERIC,
  ADD COLUMN IF NOT EXISTS target_food_cost NUMERIC NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS delivery_commission_pct NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_fee_pct NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_variable_pct NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fixed_cost NUMERIC NOT NULL DEFAULT 0;

UPDATE recipe_versions rv
SET selling_price=COALESCE(NULLIF(rv.kitchen_notes::jsonb->>'selling_price','')::numeric,rv.selling_price),
    target_food_cost=COALESCE(NULLIF(rv.kitchen_notes::jsonb->>'target_food_cost','')::numeric,rv.target_food_cost),
    delivery_commission_pct=COALESCE(NULLIF(rv.kitchen_notes::jsonb->>'delivery_commission_pct','')::numeric,rv.delivery_commission_pct),
    payment_fee_pct=COALESCE(NULLIF(rv.kitchen_notes::jsonb->>'payment_fee_pct','')::numeric,rv.payment_fee_pct),
    other_variable_pct=COALESCE(NULLIF(rv.kitchen_notes::jsonb->>'other_variable_pct','')::numeric,rv.other_variable_pct),
    delivery_fixed_cost=COALESCE(NULLIF(rv.kitchen_notes::jsonb->>'delivery_fixed_cost','')::numeric,rv.delivery_fixed_cost)
FROM recipes r
WHERE r.current_version_id=rv.id AND r.recipe_type='menu' AND rv.kitchen_notes IS JSON;

ALTER TABLE recipe_versions ADD CONSTRAINT recipe_versions_target_food_cost_check CHECK (target_food_cost BETWEEN 0 AND 100);
ALTER TABLE recipe_versions ADD CONSTRAINT recipe_versions_delivery_commission_pct_check CHECK (delivery_commission_pct BETWEEN 0 AND 100);
ALTER TABLE recipe_versions ADD CONSTRAINT recipe_versions_payment_fee_pct_check CHECK (payment_fee_pct BETWEEN 0 AND 100);
ALTER TABLE recipe_versions ADD CONSTRAINT recipe_versions_other_variable_pct_check CHECK (other_variable_pct BETWEEN 0 AND 100);
ALTER TABLE recipe_versions ADD CONSTRAINT recipe_versions_delivery_fixed_cost_check CHECK (delivery_fixed_cost >= 0);
ALTER TABLE recipe_versions ADD CONSTRAINT recipe_versions_selling_price_check CHECK (selling_price IS NULL OR selling_price >= 0);
