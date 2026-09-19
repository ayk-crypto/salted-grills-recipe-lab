import {NextResponse} from "next/server";
import {db} from "../../../db";
import {requireTenant} from "../../../tenant";
import {fetchShelfSenseCosts,fetchShelfSenseItems,getShelfSenseIntegration} from "../../../integrations/shelfsense";

function metadata(x){return x?.metadata||x?.source_metadata||{}}
function norm(v){return String(v||"").trim().toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}
function externalId(x){return String(x?.shelfSenseItemId||x?.itemId||x?.id||x?.externalItemId||"")}
function itemName(x){return String(x?.itemName||x?.name||"").trim()}
function costFields(x){
 const m=metadata(x);
 const qty=Number(x.enteredQuantity??x.receivedQuantity??x.purchaseQuantity??m.sourceEnteredQty??1);
 const unit=String(x.enteredUnit||x.purchaseUnit||x.purchase_unit||m.sourceEnteredUnit||m.sourcePurchaseUnit||x.baseUnit||x.storageUnit||x.unit||"pc");
 const price=Number(x.receiptTotal??x.totalCost??x.receivedTotalCost??x.purchasePrice??m.sourceReceiptTotal??0);
 const storageCost=Number(x.unitCost??x.storageCost??m.sourceUnitCost??NaN);
 const effectiveQty=Number.isFinite(qty)&&qty>0?qty:1;
 const effectivePrice=Number.isFinite(price)&&price>=0?price:0;
 const effectiveUnitCost=Number.isFinite(storageCost)&&storageCost>=0?storageCost:(effectiveQty>0?effectivePrice/effectiveQty:null);
 return{effectiveQty,unit,effectivePrice,effectiveUnitCost};
}
export async function POST(req){
 try{
  const tenant=await requireTenant(),sql=db(),b=await req.json(),ids=Array.isArray(b.external_item_ids)?b.external_item_ids.map(String):[];
  const integration=await getShelfSenseIntegration(tenant.id);
  if(!integration)return NextResponse.json({error:"ShelfSense is not connected"},{status:400});
  const remote=await fetchShelfSenseCosts(tenant.id);
  const rows=remote.costs||remote.rows||remote.items||[];
  const byId=new Map(rows.map(x=>[externalId(x),x]).filter(([id])=>id));

  if(b.action==="manual_map"){
    const packagingId=String(b.packaging_id||"").trim(),externalItemId=String(b.external_item_id||"").trim();
    if(!packagingId||!externalItemId)return NextResponse.json({error:"Packaging item and ShelfSense item are required"},{status:400});
    const [local]=await sql`SELECT id,name FROM packaging_items WHERE id=${packagingId} AND tenant_id=${tenant.id} AND is_active=TRUE LIMIT 1`;
    if(!local)return NextResponse.json({error:"Packaging item not found"},{status:404});
    const [conflict]=await sql`SELECT id,name FROM packaging_items WHERE tenant_id=${tenant.id} AND integration_id=${integration.id} AND external_item_id=${externalItemId} AND id<>${packagingId} AND is_active=TRUE LIMIT 1`;
    if(conflict)return NextResponse.json({error:`That ShelfSense item is already mapped to ${conflict.name}.`},{status:409});

    let x=byId.get(externalItemId)||null;
    if(!x){
      const remoteItems=await fetchShelfSenseItems(tenant.id),item=(remoteItems.items||[]).find(v=>String(v.id)===externalItemId);
      if(!item)return NextResponse.json({error:"ShelfSense item not found"},{status:404});
      x={...item,shelfSenseItemId:externalItemId};
    }
    const name=itemName(x)||local.name,{effectiveQty,unit,effectivePrice,effectiveUnitCost}=costFields(x);
    await sql`UPDATE packaging_items SET purchase_quantity=${effectiveQty},purchase_unit=${unit},purchase_price=${effectivePrice},
      unit_cost=${effectiveUnitCost},source_type='shelfsense',integration_id=${integration.id},external_item_id=${externalItemId},
      source_metadata=${JSON.stringify(x)}::jsonb,last_source_sync_at=NOW(),is_active=TRUE,updated_at=NOW()
      WHERE id=${packagingId} AND tenant_id=${tenant.id}`;
    return NextResponse.json({ok:true,id:packagingId,name:local.name,shelfSenseName:name,external_item_id:externalItemId,unit_cost:effectiveUnitCost});
  }

  if(b.action==="auto_sync"){
    const remoteByName=new Map(),duplicateNames=new Set();
    for(const x of rows){
      const key=norm(itemName(x));if(!key)continue;
      if(remoteByName.has(key)){duplicateNames.add(key);remoteByName.delete(key)}
      else if(!duplicateNames.has(key))remoteByName.set(key,x);
    }
    const local=await sql`
      SELECT id,name,source_type,integration_id,external_item_id
      FROM packaging_items
      WHERE tenant_id=${tenant.id} AND is_active=TRUE
      ORDER BY name
    `;
    let matched=0,updated=0,unmatched=0,ambiguous=0;const results=[];
    for(const p of local){
      let x=null,mode=null;
      if(p.source_type==='shelfsense'&&p.integration_id===integration.id&&p.external_item_id){
        x=byId.get(String(p.external_item_id))||null;mode='linked';
      }
      if(!x){
        const key=norm(p.name);
        if(duplicateNames.has(key)){ambiguous++;results.push({id:p.id,name:p.name,status:'ambiguous'});continue}
        x=remoteByName.get(key)||null;
        if(x)mode='name';
      }
      if(!x){unmatched++;results.push({id:p.id,name:p.name,status:'unmatched'});continue}
      const extId=externalId(x),name=itemName(x)||p.name,{effectiveQty,unit,effectivePrice,effectiveUnitCost}=costFields(x);
      if(!extId){unmatched++;results.push({id:p.id,name:p.name,status:'unmatched'});continue}
      await sql`UPDATE packaging_items SET name=${name},purchase_quantity=${effectiveQty},purchase_unit=${unit},purchase_price=${effectivePrice},
        unit_cost=${effectiveUnitCost},source_type='shelfsense',integration_id=${integration.id},external_item_id=${extId},
        source_metadata=${JSON.stringify(x)}::jsonb,last_source_sync_at=NOW(),is_active=TRUE,updated_at=NOW()
        WHERE id=${p.id} AND tenant_id=${tenant.id}`;
      if(mode==='name')matched++; else updated++;
      results.push({id:p.id,name,status:mode==='name'?'matched':'updated',external_item_id:extId,unit_cost:effectiveUnitCost});
    }
    await sql`UPDATE integrations SET last_sync_at=NOW(),last_sync_status='success',last_sync_error=NULL,updated_at=NOW() WHERE id=${integration.id} AND tenant_id=${tenant.id}`;
    return NextResponse.json({ok:true,matched,updated,unmatched,ambiguous,total:local.length,results});
  }

  if(!ids.length)return NextResponse.json({error:"Select at least one ShelfSense item"},{status:400});
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
    const name=itemName(x);if(!name){missing++;continue}
    const {effectiveQty,unit,effectivePrice,effectiveUnitCost}=costFields(x);
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
