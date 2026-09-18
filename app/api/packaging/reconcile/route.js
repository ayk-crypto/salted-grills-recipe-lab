import {NextResponse} from "next/server";
import {db} from "../../../db";
import {requireTenant} from "../../../tenant";
import {fetchShelfSenseCosts,getShelfSenseIntegration} from "../../../integrations/shelfsense";

function metadata(x){return x?.metadata||x?.source_metadata||{}}
export async function POST(req){
 try{
  const tenant=await requireTenant(),sql=db(),b=await req.json(),ids=Array.isArray(b.external_item_ids)?b.external_item_ids.map(String):[];
  if(!ids.length)return NextResponse.json({error:"Select at least one ShelfSense item"},{status:400});
  const integration=await getShelfSenseIntegration(tenant.id);
  if(!integration)return NextResponse.json({error:"ShelfSense is not connected"},{status:400});
  const remote=await fetchShelfSenseCosts(tenant.id);
  const rows=remote.costs||remote.rows||remote.items||[];
  const byId=new Map(rows.map(x=>[String(x.shelfSenseItemId||x.itemId||x.id||x.externalItemId),x]));
  let added=0,updated=0,missing=0;const results=[];
  for(const id of ids){
    const [ingredientMapping]=await sql`
      SELECT m.ingredient_id,i.name
      FROM ingredient_source_mappings m
      JOIN ingredients i ON i.id=m.ingredient_id AND i.tenant_id=m.tenant_id
      WHERE m.tenant_id=${tenant.id} AND m.integration_id=${integration.id}
        AND m.external_item_id=${id} AND m.source_type='shelfsense' AND m.is_active=TRUE
      LIMIT 1`;
    if(ingredientMapping){
      const [usage]=await sql`
        SELECT count(*)::int AS count
        FROM recipes r
        JOIN recipe_versions rv ON rv.id=r.current_version_id
        JOIN recipe_components rc ON rc.recipe_version_id=rv.id
        WHERE r.tenant_id=${tenant.id} AND r.is_active=TRUE AND rc.ingredient_id=${ingredientMapping.ingredient_id}`;
      if((usage?.count||0)>0){
        return NextResponse.json({error:`${ingredientMapping.name} is used in ${usage.count} active recipe${usage.count===1?'':'s'}. Remove it from those recipes before changing it to Packaging.`},{status:409});
      }
      await sql`UPDATE ingredient_source_mappings SET is_active=FALSE,updated_at=NOW() WHERE tenant_id=${tenant.id} AND ingredient_id=${ingredientMapping.ingredient_id}`;
      await sql`UPDATE ingredients SET is_active=FALSE,updated_at=NOW() WHERE tenant_id=${tenant.id} AND id=${ingredientMapping.ingredient_id}`;
    }
    const x=byId.get(id);
    if(!x){missing++;results.push({id,status:"missing"});continue}
    const name=String(x.itemName||x.name||"").trim();if(!name){missing++;continue}
    const m=metadata(x);
    const qty=Number(x.enteredQuantity??x.receivedQuantity??x.purchaseQuantity??m.sourceEnteredQty??1);
    const unit=String(x.enteredUnit||x.purchaseUnit||x.purchase_unit||m.sourceEnteredUnit||m.sourcePurchaseUnit||x.baseUnit||x.storageUnit||x.unit||"pc");
    const price=Number(x.receiptTotal??x.totalCost??x.receivedTotalCost??x.purchasePrice??m.sourceReceiptTotal??0);
    const storageCost=Number(x.unitCost??x.storageCost??m.sourceUnitCost??0);
    const effectiveQty=Number.isFinite(qty)&&qty>0?qty:1;
    const effectivePrice=Number.isFinite(price)&&price>=0?price:0;
    const effectiveUnitCost=Number.isFinite(storageCost)&&storageCost>=0?storageCost:(effectiveQty>0?effectivePrice/effectiveQty:null);
    const [existing]=await sql`SELECT id FROM packaging_items WHERE tenant_id=${tenant.id} AND ((integration_id=${integration.id} AND external_item_id=${id}) OR lower(name)=lower(${name})) ORDER BY (integration_id=${integration.id} AND external_item_id=${id}) DESC LIMIT 1`;
    if(existing){
      await sql`UPDATE packaging_items SET name=${name},purchase_quantity=${effectiveQty},purchase_unit=${unit},purchase_price=${effectivePrice},
        unit_cost=${effectiveUnitCost},source_type='shelfsense',integration_id=${integration.id},external_item_id=${id},
        source_metadata=${JSON.stringify(x)}::jsonb,last_source_sync_at=NOW(),is_active=TRUE,updated_at=NOW()
        WHERE id=${existing.id} AND tenant_id=${tenant.id}`;
      updated++;
    }else{
      await sql`INSERT INTO packaging_items(tenant_id,name,purchase_quantity,purchase_unit,purchase_price,unit_cost,source_type,integration_id,external_item_id,source_metadata,last_source_sync_at)
        VALUES(${tenant.id},${name},${effectiveQty},${unit},${effectivePrice},${effectiveUnitCost},'shelfsense',${integration.id},${id},${JSON.stringify(x)}::jsonb,NOW())`;
      added++;
    }
    results.push({id,name,status:existing?"updated":"added"});
  }
  return NextResponse.json({ok:true,added,updated,missing,results});
 }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
