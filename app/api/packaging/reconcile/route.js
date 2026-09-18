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
  const rows=remote.rows||remote.items||remote.costs||[];
  const byId=new Map(rows.map(x=>[String(x.itemId||x.id||x.externalItemId),x]));
  let added=0,updated=0,missing=0;const results=[];
  for(const id of ids){
    const x=byId.get(id);
    if(!x){missing++;results.push({id,status:"missing"});continue}
    const name=String(x.itemName||x.name||"").trim();if(!name){missing++;continue}
    const m=metadata(x);
    const qty=Number(x.purchaseQuantity||x.purchase_quantity||m.sourceEnteredQty||1);
    const unit=String(x.purchaseUnit||x.purchase_unit||m.sourceEnteredUnit||m.sourcePurchaseUnit||x.storageUnit||x.unit||"pc");
    const price=Number(x.purchasePrice||x.purchase_price||m.sourceReceiptTotal||x.storageCost||x.unitCost||0);
    const storageCost=Number(x.storageCost||x.unitCost||m.sourceUnitCost||0);
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
