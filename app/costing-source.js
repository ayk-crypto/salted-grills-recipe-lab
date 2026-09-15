import { db } from "./db.js";
import { fetchShelfSenseCosts } from "./integrations/shelfsense.js";

export async function resolveIngredientCosts(tenantId,asOf){
  const sql=db();
  const date=asOf||new Date().toISOString().slice(0,10);
  const ingredients=await sql`
    SELECT i.id,i.name,i.default_unit,
           COALESCE(m.source_type,'manual') AS source_type,
           m.external_item_id,m.kitchen_unit,m.conversion_factor
    FROM ingredients i
    LEFT JOIN ingredient_source_mappings m
      ON m.tenant_id=i.tenant_id AND m.ingredient_id=i.id AND m.is_active=TRUE
    WHERE i.tenant_id=${tenantId}
    ORDER BY i.name
  `;

  const shelfNeeded=ingredients.some(i=>i.source_type==='shelfsense');
  let shelfById=new Map();
  if(shelfNeeded){
    const remote=await fetchShelfSenseCosts(tenantId,date);
    shelfById=new Map((remote.costs||[]).map(c=>[String(c.shelfSenseItemId),c]));
  }

  const results=[];
  for(const i of ingredients){
    if(i.source_type==='shelfsense'&&i.external_item_id){
      const c=shelfById.get(String(i.external_item_id));
      results.push({
        ingredientId:i.id,ingredientName:i.name,source:'shelfsense',asOf:date,
        available:!!c,externalItemId:i.external_item_id,
        purchaseUnit:c?.purchaseUnit||c?.enteredUnit||c?.baseUnit||null,
        purchaseQuantity:c?.enteredQuantity||c?.receivedQuantity||null,
        purchasePrice:c?.unitCost!=null&&c?.receivedQuantity!=null?Number(c.unitCost)*Number(c.receivedQuantity):null,
        baseUnit:c?.baseUnit||i.kitchen_unit||i.default_unit,
        baseUnitCost:c?.unitCost??null,
        effectiveDate:c?.effectiveDate||null,supplier:c?.supplier||null,
        sourceExternalId:c?.purchaseItemId||null,
      });
      continue;
    }

    const [p]=await sql`
      SELECT ip.* FROM ingredient_prices ip
      WHERE ip.tenant_id=${tenantId} AND ip.ingredient_id=${i.id}
        AND ip.price_date<=${date}::date
      ORDER BY ip.price_date DESC, ip.created_at DESC
      LIMIT 1
    `;
    results.push({
      ingredientId:i.id,ingredientName:i.name,source:p?.source||'manual',asOf:date,
      available:!!p,purchaseUnit:p?.purchase_unit||null,purchaseQuantity:p?.purchase_quantity||null,
      purchasePrice:p?.purchase_price||null,baseUnit:i.kitchen_unit||i.default_unit,
      baseUnitCost:null,effectiveDate:p?.price_date||null,supplier:p?.supplier||null,
      sourceExternalId:p?.source_external_id||null,
    });
  }
  return results;
}
