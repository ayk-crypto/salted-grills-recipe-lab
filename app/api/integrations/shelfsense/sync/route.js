import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { requireTenant } from "../../../../tenant";
import { fetchShelfSenseCosts, getShelfSenseIntegration } from "../../../../integrations/shelfsense";

const ALERT_THRESHOLD_PCT=25;
function day(v){return v?String(v).slice(0,10):new Date().toISOString().slice(0,10)}
function unitInfo(unit){
  const u=String(unit||'').trim().toLowerCase();
  if(u==='kg')return['weight',1000];
  if(['g','gm','gram','grams'].includes(u))return['weight',1];
  if(['l','ltr','liter','litre'].includes(u))return['volume',1000];
  if(u==='ml')return['volume',1];
  if(['pc','pcs','piece','pieces','portion','portions','each'].includes(u))return['count',1];
  return[u||'other',1];
}
function normalizedRate(qty,unit,price){
  const info=unitInfo(unit),base=Number(qty||0)*info[1];
  return base>0?Number(price)/base:NaN;
}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}

async function buildPreview(tenantId,asOf){
  const sql=db();
  const integration=await getShelfSenseIntegration(tenantId);
  if(!integration)throw new Error('ShelfSense is not connected');
  const remote=await fetchShelfSenseCosts(tenantId,asOf);
  const costsById=new Map((remote.costs||[]).map(c=>[String(c.shelfSenseItemId),c]));
  const mappings=await sql`
    SELECT m.*,i.name AS ingredient_name,i.default_unit
    FROM ingredient_source_mappings m
    JOIN ingredients i ON i.id=m.ingredient_id AND i.tenant_id=m.tenant_id
    WHERE m.tenant_id=${tenantId} AND m.source_type='shelfsense' AND m.is_active=TRUE AND i.is_active=TRUE
    ORDER BY i.name
  `;
  const rows=[];
  for(const m of mappings){
    const c=costsById.get(String(m.external_item_id));
    if(!c){rows.push({ingredientId:m.ingredient_id,ingredientName:m.ingredient_name,status:'missing',externalItemName:m.external_item_name});continue}
    const mappingFactor=Number(m.conversion_factor||1);
    const price=Number(c.unitCost)*mappingFactor;
    const sourceId=String(c.sourceBatchId||c.purchaseItemId||'');
    const exists=sourceId?await sql`
      SELECT id FROM ingredient_prices
      WHERE tenant_id=${tenantId} AND ingredient_id=${m.ingredient_id}
        AND source='shelfsense' AND source_external_id=${sourceId}
      LIMIT 1
    `:[];
    const [latest]=await sql`
      SELECT purchase_quantity,purchase_unit,purchase_price,price_date,source
      FROM ingredient_prices
      WHERE tenant_id=${tenantId} AND ingredient_id=${m.ingredient_id}
      ORDER BY price_date DESC, created_at DESC
      LIMIT 1
    `;
    const kitchenUnit=m.kitchen_unit||m.default_unit||c.baseUnit;
    const incomingRate=normalizedRate(1,kitchenUnit,price);
    const latestRate=latest?normalizedRate(latest.purchase_quantity,latest.purchase_unit,latest.purchase_price):NaN;
    const compatible=latest&&unitInfo(latest.purchase_unit)[0]===unitInfo(kitchenUnit)[0];
    const changePct=compatible&&Number.isFinite(latestRate)&&latestRate>0?((incomingRate-latestRate)/latestRate)*100:null;
    const alert=Number.isFinite(changePct)&&Math.abs(changePct)>=ALERT_THRESHOLD_PCT;

    const sourceBaseUnit=c.baseUnit||null;
    const sourcePurchaseUnit=c.purchaseUnit||c.enteredUnit||sourceBaseUnit;
    const sourcePurchaseFactor=finite(c.purchaseConversionFactor);
    const sourceIssueUnit=c.issueUnit||sourceBaseUnit;
    const sourceEnteredQty=finite(c.enteredQuantity??c.receivedQuantity);
    const sourceEnteredUnit=c.enteredUnit||sourcePurchaseUnit;
    const sourceBaseQty=finite(c.storedBaseQuantity??c.receivedQuantity);
    const sourceBaseCost=finite(c.unitCost);
    const sourceReceiptTotal=sourceBaseQty!==null&&sourceBaseCost!==null?sourceBaseQty*sourceBaseCost:null;
    const purchaseNeedsFactor=sourcePurchaseUnit&&sourceBaseUnit&&String(sourcePurchaseUnit).toLowerCase()!==String(sourceBaseUnit).toLowerCase();
    const conversionWarning=Boolean(purchaseNeedsFactor&&(!sourcePurchaseFactor||sourcePurchaseFactor<=0));

    rows.push({
      ingredientId:m.ingredient_id,ingredientName:m.ingredient_name,
      status:exists.length?'unchanged':'new',externalItemId:m.external_item_id,
      externalItemName:c.itemName||m.external_item_name,
      priceDate:day(c.effectiveDate),purchaseQuantity:1,
      purchaseUnit:kitchenUnit,
      purchasePrice:price,supplier:c.supplier?.name||c.supplierName||null,
      sourceExternalId:sourceId,sourceBaseUnit,sourceUnitCost:sourceBaseCost,conversionFactor:mappingFactor,
      sourcePurchaseUnit,sourcePurchaseFactor,sourceIssueUnit,sourceEnteredQty,sourceEnteredUnit,sourceBaseQty,sourceReceiptTotal,
      effectiveDate:c.effectiveDate||null,
      previousPrice:latest?Number(latest.purchase_price):null,
      previousQuantity:latest?Number(latest.purchase_quantity):null,
      previousUnit:latest?.purchase_unit||null,
      previousDate:latest?.price_date?day(latest.price_date):null,
      previousSource:latest?.source||null,
      changePct,alert,conversionWarning,
      alertThresholdPct:ALERT_THRESHOLD_PCT,
    });
  }
  return {asOf,workspaceId:remote.workspaceId||integration.external_tenant_id||null,rows};
}

export async function GET(req){
  try{
    const tenant=await requireTenant();
    const asOf=new URL(req.url).searchParams.get('asOf')||new Date().toISOString().slice(0,10);
    const preview=await buildPreview(tenant.id,asOf);
    return NextResponse.json({...preview,alertThresholdPct:ALERT_THRESHOLD_PCT,summary:{
      mapped:preview.rows.length,
      new:preview.rows.filter(x=>x.status==='new').length,
      unchanged:preview.rows.filter(x=>x.status==='unchanged').length,
      missing:preview.rows.filter(x=>x.status==='missing').length,
      alerts:preview.rows.filter(x=>x.status==='new'&&x.alert).length,
      conversionWarnings:preview.rows.filter(x=>x.status==='new'&&x.conversionWarning).length,
    }});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function POST(req){
  try{
    const tenant=await requireTenant(),sql=db();
    const body=await req.json().catch(()=>({}));
    const asOf=body.asOf||new Date().toISOString().slice(0,10);
    const selected=new Set((body.selectedSourceIds||body.selected_source_ids||[]).map(String));
    const accepted=new Set((body.acceptedSourceIds||body.accepted_source_ids||[]).map(String));
    if(selected.size===0)return NextResponse.json({error:'Select at least one ShelfSense price to sync'},{status:400});
    const preview=await buildPreview(tenant.id,asOf);
    let imported=0,skipped=0,blockedAlerts=0,blockedConversions=0;
    for(const row of preview.rows){
      if(row.status!=='new'||!row.sourceExternalId||!selected.has(String(row.sourceExternalId))){skipped++;continue}
      if(!Number.isFinite(Number(row.purchasePrice))){skipped++;continue}
      if(row.conversionWarning){blockedConversions++;continue}
      if(row.alert&&!accepted.has(String(row.sourceExternalId))){blockedAlerts++;continue}
      await sql`
        INSERT INTO ingredient_prices
          (tenant_id,ingredient_id,purchase_quantity,purchase_unit,purchase_price,supplier,price_date,source,source_external_id,source_metadata)
        VALUES
          (${tenant.id},${row.ingredientId},1,${row.purchaseUnit},${row.purchasePrice},${row.supplier||'ShelfSense'},${row.priceDate}::date,
           'shelfsense',${row.sourceExternalId},${JSON.stringify({
             workspaceId:preview.workspaceId,externalItemId:row.externalItemId,externalItemName:row.externalItemName,
             sourceBaseUnit:row.sourceBaseUnit,sourceUnitCost:row.sourceUnitCost,conversionFactor:row.conversionFactor,
             sourcePurchaseUnit:row.sourcePurchaseUnit,sourcePurchaseFactor:row.sourcePurchaseFactor,sourceIssueUnit:row.sourceIssueUnit,
             sourceEnteredQty:row.sourceEnteredQty,sourceEnteredUnit:row.sourceEnteredUnit,sourceBaseQty:row.sourceBaseQty,
             sourceReceiptTotal:row.sourceReceiptTotal,effectiveDate:row.effectiveDate,changePct:row.changePct,
             alertApproved:row.alert?accepted.has(String(row.sourceExternalId)):false
           })}::jsonb)
      `;
      imported++;
    }
    await sql`
      UPDATE integrations SET last_sync_at=NOW(),last_sync_status='success',last_sync_error=NULL,updated_at=NOW()
      WHERE tenant_id=${tenant.id} AND provider='shelfsense'
    `;
    return NextResponse.json({ok:true,imported,skipped,blockedAlerts,blockedConversions,asOf,summary:{mapped:preview.rows.length,missing:preview.rows.filter(x=>x.status==='missing').length,alerts:preview.rows.filter(x=>x.status==='new'&&x.alert).length}});
  }catch(e){
    try{
      const tenant=await requireTenant(),sql=db();
      await sql`UPDATE integrations SET last_sync_at=NOW(),last_sync_status='failed',last_sync_error=${String(e.message||e)},updated_at=NOW() WHERE tenant_id=${tenant.id} AND provider='shelfsense'`;
    }catch{}
    return NextResponse.json({error:e.message},{status:500})
  }
}
