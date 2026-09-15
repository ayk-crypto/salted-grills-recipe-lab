import { NextResponse } from "next/server";
import { db } from "../../../db";
import { requireTenant } from "../../../tenant";
import { encryptCredential } from "../../../integrations/crypto";
import { fetchShelfSenseItems, fetchShelfSenseCosts, getShelfSenseIntegration } from "../../../integrations/shelfsense";

const TRIGGER="-MXh2UZCTCsjPLMn2ahms4fbKxUH2x_b";
const BASE_URL="https://shelfsense-0qgb.onrender.com";
const WORKSPACE_ID="d8bcc84a-c5f6-4acb-a511-1a6f0dcc336c";

function norm(v){return String(v||"").trim().toLowerCase().replace(/\s+/g," ")}
function unitFactor(source,target){
  const s=String(source||"").trim().toLowerCase();
  const t=String(target||"").trim().toLowerCase();
  const aliases={liter:"l",litre:"l",l:"l",milliliter:"ml",millilitre:"ml",ml:"ml",kilogram:"kg",kg:"kg",gram:"g",g:"g",piece:"pc",pc:"pc"};
  const a=aliases[s]||s,b=aliases[t]||t;
  if(a===b)return 1;
  if(a==="kg"&&b==="g")return 0.001;
  if(a==="g"&&b==="kg")return 1000;
  if(a==="l"&&b==="ml")return 0.001;
  if(a==="ml"&&b==="l")return 1000;
  return null;
}
function day(v){return v?String(v).slice(0,10):new Date().toISOString().slice(0,10)}

export async function GET(req){
  try{
    const params=new URL(req.url).searchParams;
    if(params.get("key")!==TRIGGER)return NextResponse.json({error:"Not found"},{status:404});
    const token=String(params.get("token")||"").trim();
    if(!token)return NextResponse.json({error:"Missing bootstrap token"},{status:400});
    const tenant=await requireTenant(),sql=db();
    const enc=encryptCredential(token);
    await sql`
      INSERT INTO integrations
        (tenant_id,provider,status,external_tenant_id,base_url,credential_ciphertext,credential_iv,credential_tag,last_sync_status,updated_at)
      VALUES
        (${tenant.id},'shelfsense','active',${WORKSPACE_ID},${BASE_URL},${enc.ciphertext},${enc.iv},${enc.tag},'connected',NOW())
      ON CONFLICT (tenant_id,provider) DO UPDATE SET
        status='active',external_tenant_id=EXCLUDED.external_tenant_id,base_url=EXCLUDED.base_url,
        credential_ciphertext=EXCLUDED.credential_ciphertext,credential_iv=EXCLUDED.credential_iv,
        credential_tag=EXCLUDED.credential_tag,last_sync_status='connected',last_sync_error=NULL,updated_at=NOW()
    `;

    const integration=await getShelfSenseIntegration(tenant.id);
    const remote=await fetchShelfSenseItems(tenant.id);
    const byName=new Map((remote.items||[]).map(x=>[norm(x.name),x]));
    const ingredients=await sql`SELECT id,name,default_unit FROM ingredients WHERE tenant_id=${tenant.id} AND is_active=TRUE ORDER BY name`;
    let mapped=0,skippedUnit=0;
    for(const i of ingredients){
      const item=byName.get(norm(i.name));
      if(!item)continue;
      const factor=unitFactor(item.unit,i.default_unit);
      if(factor==null){skippedUnit++;continue}
      await sql`
        INSERT INTO ingredient_source_mappings
          (tenant_id,ingredient_id,source_type,integration_id,external_item_id,external_item_name,kitchen_unit,conversion_factor,is_active,updated_at)
        VALUES
          (${tenant.id},${i.id},'shelfsense',${integration.id},${String(item.id)},${item.name},${i.default_unit},${factor},TRUE,NOW())
        ON CONFLICT (tenant_id,ingredient_id) DO UPDATE SET
          source_type='shelfsense',integration_id=EXCLUDED.integration_id,external_item_id=EXCLUDED.external_item_id,
          external_item_name=EXCLUDED.external_item_name,kitchen_unit=EXCLUDED.kitchen_unit,
          conversion_factor=EXCLUDED.conversion_factor,is_active=TRUE,updated_at=NOW()
      `;
      mapped++;
    }

    const costs=await fetchShelfSenseCosts(tenant.id,new Date().toISOString().slice(0,10));
    const byId=new Map((costs.costs||[]).map(c=>[String(c.shelfSenseItemId),c]));
    const mappings=await sql`
      SELECT m.*,i.name AS ingredient_name,i.default_unit
      FROM ingredient_source_mappings m JOIN ingredients i ON i.id=m.ingredient_id AND i.tenant_id=m.tenant_id
      WHERE m.tenant_id=${tenant.id} AND m.source_type='shelfsense' AND m.is_active=TRUE AND i.is_active=TRUE
    `;
    let imported=0,missing=0,unchanged=0;
    for(const m of mappings){
      const c=byId.get(String(m.external_item_id));
      if(!c){missing++;continue}
      const sourceId=String(c.sourceBatchId||c.purchaseItemId||"");
      if(!sourceId){missing++;continue}
      const exists=await sql`SELECT id FROM ingredient_prices WHERE tenant_id=${tenant.id} AND ingredient_id=${m.ingredient_id} AND source='shelfsense' AND source_external_id=${sourceId} LIMIT 1`;
      if(exists.length){unchanged++;continue}
      const price=Number(c.unitCost)*Number(m.conversion_factor||1);
      if(!Number.isFinite(price)){missing++;continue}
      await sql`
        INSERT INTO ingredient_prices
          (tenant_id,ingredient_id,purchase_quantity,purchase_unit,purchase_price,supplier,price_date,source,source_external_id,source_metadata)
        VALUES
          (${tenant.id},${m.ingredient_id},1,${m.kitchen_unit||m.default_unit},${price},${c.supplier?.name||c.supplierName||'ShelfSense'},${day(c.effectiveDate)}::date,
           'shelfsense',${sourceId},${JSON.stringify({workspaceId:costs.workspaceId||WORKSPACE_ID,externalItemId:m.external_item_id,externalItemName:c.itemName||m.external_item_name,sourceBaseUnit:c.baseUnit||null,sourceUnitCost:Number(c.unitCost),conversionFactor:Number(m.conversion_factor||1),effectiveDate:c.effectiveDate||null})}::jsonb)
      `;
      imported++;
    }
    await sql`UPDATE integrations SET last_sync_at=NOW(),last_sync_status='success',last_sync_error=NULL,updated_at=NOW() WHERE tenant_id=${tenant.id} AND provider='shelfsense'`;
    return NextResponse.json({ok:true,workspaceId:remote.workspaceId,itemCount:(remote.items||[]).length,ingredientCount:ingredients.length,mapped,skippedUnit,imported,unchanged,missing});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
