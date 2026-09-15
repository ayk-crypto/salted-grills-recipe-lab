import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { requireTenant } from "../../../../tenant";
import { fetchShelfSenseCosts, getShelfSenseIntegration } from "../../../../integrations/shelfsense";

const ALERT_THRESHOLD_PCT=25;
function day(v){return v?String(v).slice(0,10):new Date().toISOString().slice(0,10)}
function norm(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
function unitInfo(unit){
  const u=norm(unit);
  if(u==='kg')return['weight',1000,'g'];
  if(['g','gm','gram','grams'].includes(u))return['weight',1,'g'];
  if(['l','ltr','liter','litre'].includes(u))return['volume',1000,'ml'];
  if(u==='ml')return['volume',1,'ml'];
  if(['pc','pcs','piece','pieces','each'].includes(u))return['count',1,'pc'];
  return[u||'other',1,u||'other'];
}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function meta(v){if(!v)return{};if(typeof v==='object')return v;try{return JSON.parse(v)||{}}catch{return{}}}
function isDirect(from,to){const a=unitInfo(from),b=unitInfo(to);return['weight','volume','count'].includes(a[0])&&a[0]===b[0]}
function purchaseFromPrice(p){
  if(!p)return null;
  let quantity=Number(p.purchase_quantity),unit=p.purchase_unit,price=Number(p.purchase_price);
  if(p.source==='shelfsense'){
    const m=meta(p.source_metadata),q=finite(m.sourceEnteredQty),total=finite(m.sourceReceiptTotal),u=m.sourceEnteredUnit||m.sourcePurchaseUnit;
    if(q&&u&&total!==null){quantity=q;unit=u;price=total}
  }
  return{quantity,unit,price};
}
function costingRate(purchase,kitchenUnit,conversion){
  if(!purchase||!(purchase.quantity>0)||!Number.isFinite(purchase.price))return NaN;
  if(isDirect(purchase.unit,kitchenUnit)){
    const info=unitInfo(purchase.unit),base=purchase.quantity*info[1];
    return base>0?purchase.price/base:NaN;
  }
  if(conversion&&norm(conversion.purchase_unit)===norm(purchase.unit)){
    const cInfo=unitInfo(conversion.costing_unit),kInfo=unitInfo(kitchenUnit);
    if(cInfo[0]!==kInfo[0]||!['weight','volume','count'].includes(cInfo[0]))return NaN;
    const usableBase=purchase.quantity*Number(conversion.usable_quantity)*cInfo[1];
    return usableBase>0?purchase.price/usableBase:NaN;
  }
  return NaN;
}

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
  const conversions=await sql`
    SELECT ingredient_id,purchase_unit,usable_quantity,costing_unit,source
    FROM ingredient_costing_conversions WHERE tenant_id=${tenantId}
  `;
  const conversionMap=new Map(conversions.map(c=>[`${c.ingredient_id}|${norm(c.purchase_unit)}`,c]));
  const rows=[];
  for(const m of mappings){
    const c=costsById.get(String(m.external_item_id));
    if(!c){rows.push({ingredientId:m.ingredient_id,ingredientName:m.ingredient_name,status:'missing',externalItemName:m.external_item_name});continue}
    const sourceId=String(c.sourceBatchId||c.purchaseItemId||'');
    const exists=sourceId?await sql`
      SELECT id FROM ingredient_prices
      WHERE tenant_id=${tenantId} AND ingredient_id=${m.ingredient_id}
        AND source='shelfsense' AND source_external_id=${sourceId}
      LIMIT 1
    `:[];
    const [latest]=await sql`
      SELECT purchase_quantity,purchase_unit,purchase_price,price_date,source,source_metadata
      FROM ingredient_prices
      WHERE tenant_id=${tenantId} AND ingredient_id=${m.ingredient_id}
      ORDER BY price_date DESC, created_at DESC
      LIMIT 1
    `;

    const sourceBaseUnit=c.baseUnit||null;
    const sourcePurchaseUnit=c.purchaseUnit||c.enteredUnit||sourceBaseUnit;
    const sourcePurchaseFactor=finite(c.purchaseConversionFactor);
    const sourceIssueUnit=c.issueUnit||sourceBaseUnit;
    const sourceEnteredQty=finite(c.enteredQuantity??c.receivedQuantity);
    const sourceEnteredUnit=c.enteredUnit||sourcePurchaseUnit;
    const sourceBaseQty=finite(c.storedBaseQuantity??c.receivedQuantity);
    const sourceBaseCost=finite(c.unitCost);
    const explicitReceiptTotal=finite(c.receiptTotal??c.totalCost??c.receivedTotalCost);
    const sourceReceiptTotal=explicitReceiptTotal!==null?explicitReceiptTotal:(sourceBaseQty!==null&&sourceBaseCost!==null?sourceBaseQty*sourceBaseCost:null);
    const purchaseQuantity=sourceEnteredQty&&sourceEnteredQty>0?sourceEnteredQty:1;
    const purchaseUnit=sourceEnteredUnit||sourcePurchaseUnit||sourceBaseUnit||m.default_unit;
    const purchasePrice=sourceReceiptTotal!==null?sourceReceiptTotal:(sourceBaseCost!==null?sourceBaseCost*purchaseQuantity:NaN);
    const kitchenUnit=m.kitchen_unit||m.default_unit||sourceBaseUnit||'g';
    const savedConversion=conversionMap.get(`${m.ingredient_id}|${norm(purchaseUnit)}`)||null;
    const incomingRate=costingRate({quantity:purchaseQuantity,unit:purchaseUnit,price:purchasePrice},kitchenUnit,savedConversion);
    const needsYieldSetup=!isDirect(purchaseUnit,kitchenUnit)&&!savedConversion;
    const latestPurchase=purchaseFromPrice(latest);
    const latestConv=latestPurchase?conversionMap.get(`${m.ingredient_id}|${norm(latestPurchase.unit)}`)||null:null;
    const latestRate=costingRate(latestPurchase,kitchenUnit,latestConv);
    const changePct=Number.isFinite(incomingRate)&&Number.isFinite(latestRate)&&latestRate>0?((incomingRate-latestRate)/latestRate)*100:null;
    const alert=Number.isFinite(changePct)&&Math.abs(changePct)>=ALERT_THRESHOLD_PCT;

    const purchaseNeedsFactor=sourcePurchaseUnit&&sourceBaseUnit&&norm(sourcePurchaseUnit)!==norm(sourceBaseUnit);
    const purchaseFactorMissing=Boolean(purchaseNeedsFactor&&(!sourcePurchaseFactor||sourcePurchaseFactor<=0));
    const sourceIssueFactor=norm(sourceIssueUnit)===norm(sourceBaseUnit)?1:(norm(sourceIssueUnit)===norm(sourcePurchaseUnit)?sourcePurchaseFactor:null);
    const issueConversionMissing=Boolean(sourceIssueUnit&&sourceBaseUnit&&norm(sourceIssueUnit)!==norm(sourceBaseUnit)&&!sourceIssueFactor);
    const expectedBaseQty=sourceEnteredQty!==null&&sourcePurchaseFactor&&norm(sourceEnteredUnit)===norm(sourcePurchaseUnit)?sourceEnteredQty*sourcePurchaseFactor:null;
    const conversionVariancePct=expectedBaseQty!==null&&sourceBaseQty!==null&&expectedBaseQty>0?Math.abs(sourceBaseQty-expectedBaseQty)/expectedBaseQty*100:null;
    const receiptConversionMismatch=Number.isFinite(conversionVariancePct)&&conversionVariancePct>2;
    const conversionReasons=[];
    if(purchaseFactorMissing)conversionReasons.push('ShelfSense purchase conversion missing');
    if(issueConversionMissing)conversionReasons.push('ShelfSense issue-unit conversion not defined');
    if(receiptConversionMismatch)conversionReasons.push('ShelfSense received quantity does not match its purchase conversion');
    const conversionWarning=conversionReasons.length>0;
    const costingUnit=unitInfo(kitchenUnit)[2];

    rows.push({
      ingredientId:m.ingredient_id,ingredientName:m.ingredient_name,
      status:exists.length?'unchanged':'new',externalItemId:m.external_item_id,
      externalItemName:c.itemName||m.external_item_name,
      priceDate:day(c.effectiveDate),purchaseQuantity,purchaseUnit,purchasePrice,
      costingRate:Number.isFinite(incomingRate)?incomingRate:null,costingUnit,needsYieldSetup,
      yieldUsableQuantity:savedConversion?Number(savedConversion.usable_quantity):null,
      yieldCostingUnit:savedConversion?.costing_unit||kitchenUnit,
      supplier:c.supplier?.name||c.supplierName||null,
      sourceExternalId:sourceId,sourceBaseUnit,sourceUnitCost:sourceBaseCost,conversionFactor:Number(m.conversion_factor||1),
      sourcePurchaseUnit,sourcePurchaseFactor,sourceIssueUnit,sourceIssueFactor,sourceEnteredQty,sourceEnteredUnit,
      sourceBaseQty,sourceReceiptTotal,expectedBaseQty,conversionVariancePct,conversionReasons,
      effectiveDate:c.effectiveDate||null,
      previousPrice:latestPurchase?latestPurchase.price:null,
      previousQuantity:latestPurchase?latestPurchase.quantity:null,
      previousUnit:latestPurchase?.unit||null,
      previousDate:latest?.price_date?day(latest.price_date):null,
      previousSource:latest?.source||null,
      previousCostingRate:Number.isFinite(latestRate)?latestRate:null,
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
      conversionWarnings:preview.rows.filter(x=>x.conversionWarning).length,
      needsYield:preview.rows.filter(x=>x.needsYieldSetup).length,
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
      if(!Number.isFinite(Number(row.purchasePrice))||!(Number(row.purchaseQuantity)>0)){skipped++;continue}
      const explicitlyAccepted=accepted.has(String(row.sourceExternalId));
      if(row.conversionWarning&&!explicitlyAccepted){blockedConversions++;continue}
      if(row.alert&&!explicitlyAccepted){blockedAlerts++;continue}
      await sql`
        INSERT INTO ingredient_prices
          (tenant_id,ingredient_id,purchase_quantity,purchase_unit,purchase_price,supplier,price_date,source,source_external_id,source_metadata)
        VALUES
          (${tenant.id},${row.ingredientId},${row.purchaseQuantity},${row.purchaseUnit},${row.purchasePrice},${row.supplier||'ShelfSense'},${row.priceDate}::date,
           'shelfsense',${row.sourceExternalId},${JSON.stringify({
             workspaceId:preview.workspaceId,externalItemId:row.externalItemId,externalItemName:row.externalItemName,
             sourceBaseUnit:row.sourceBaseUnit,sourceUnitCost:row.sourceUnitCost,conversionFactor:row.conversionFactor,
             sourcePurchaseUnit:row.sourcePurchaseUnit,sourcePurchaseFactor:row.sourcePurchaseFactor,
             sourceIssueUnit:row.sourceIssueUnit,sourceIssueFactor:row.sourceIssueFactor,
             sourceEnteredQty:row.sourceEnteredQty,sourceEnteredUnit:row.sourceEnteredUnit,sourceBaseQty:row.sourceBaseQty,
             sourceReceiptTotal:row.sourceReceiptTotal,expectedBaseQty:row.expectedBaseQty,conversionVariancePct:row.conversionVariancePct,
             effectiveDate:row.effectiveDate,changePct:row.changePct,alertApproved:row.alert&&explicitlyAccepted,
             sourceConversionWarning:row.conversionWarning,sourceConversionAccepted:row.conversionWarning&&explicitlyAccepted,
             needsYieldSetup:row.needsYieldSetup,yieldUsableQuantity:row.yieldUsableQuantity,yieldCostingUnit:row.yieldCostingUnit
           })}::jsonb)
      `;
      imported++;
    }
    await sql`
      UPDATE integrations SET last_sync_at=NOW(),last_sync_status='success',last_sync_error=NULL,updated_at=NOW()
      WHERE tenant_id=${tenant.id} AND provider='shelfsense'
    `;
    return NextResponse.json({ok:true,imported,skipped,blockedAlerts,blockedConversions,asOf,summary:{mapped:preview.rows.length,missing:preview.rows.filter(x=>x.status==='missing').length,alerts:preview.rows.filter(x=>x.status==='new'&&x.alert).length,needsYield:preview.rows.filter(x=>x.needsYieldSetup).length}});
  }catch(e){
    try{
      const tenant=await requireTenant(),sql=db();
      await sql`UPDATE integrations SET last_sync_at=NOW(),last_sync_status='failed',last_sync_error=${String(e.message||e)},updated_at=NOW() WHERE tenant_id=${tenant.id} AND provider='shelfsense'`;
    }catch{}
    return NextResponse.json({error:e.message},{status:500})
  }
}
