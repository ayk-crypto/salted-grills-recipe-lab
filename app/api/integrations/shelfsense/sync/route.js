import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { requireTenant } from "../../../../tenant";
import { fetchShelfSenseCosts, getShelfSenseIntegration } from "../../../../integrations/shelfsense";

function day(v){return v?String(v).slice(0,10):new Date().toISOString().slice(0,10)}

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
    const factor=Number(m.conversion_factor||1);
    const price=Number(c.unitCost)*factor;
    const sourceId=String(c.sourceBatchId||c.purchaseItemId||'');
    const exists=sourceId?await sql`
      SELECT id FROM ingredient_prices
      WHERE tenant_id=${tenantId} AND ingredient_id=${m.ingredient_id}
        AND source='shelfsense' AND source_external_id=${sourceId}
      LIMIT 1
    `:[];
    rows.push({
      ingredientId:m.ingredient_id,ingredientName:m.ingredient_name,
      status:exists.length?'unchanged':'new',externalItemId:m.external_item_id,
      externalItemName:c.itemName||m.external_item_name,
      priceDate:day(c.effectiveDate),purchaseQuantity:1,
      purchaseUnit:m.kitchen_unit||m.default_unit||c.baseUnit,
      purchasePrice:price,supplier:c.supplier?.name||c.supplierName||null,
      sourceExternalId:sourceId,sourceBaseUnit:c.baseUnit||null,
      sourceUnitCost:Number(c.unitCost),conversionFactor:factor,
      effectiveDate:c.effectiveDate||null,
    });
  }
  return {asOf,workspaceId:remote.workspaceId||integration.external_tenant_id||null,rows};
}

export async function GET(req){
  try{
    const tenant=await requireTenant();
    const asOf=new URL(req.url).searchParams.get('asOf')||new Date().toISOString().slice(0,10);
    const preview=await buildPreview(tenant.id,asOf);
    return NextResponse.json({...preview,summary:{mapped:preview.rows.length,new:preview.rows.filter(x=>x.status==='new').length,unchanged:preview.rows.filter(x=>x.status==='unchanged').length,missing:preview.rows.filter(x=>x.status==='missing').length}});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function POST(req){
  try{
    const tenant=await requireTenant(),sql=db();
    const body=await req.json().catch(()=>({}));
    const asOf=body.asOf||new Date().toISOString().slice(0,10);
    const preview=await buildPreview(tenant.id,asOf);
    let imported=0,skipped=0;
    for(const row of preview.rows){
      if(row.status!=='new'||!row.sourceExternalId||!Number.isFinite(Number(row.purchasePrice))){skipped++;continue}
      await sql`
        INSERT INTO ingredient_prices
          (tenant_id,ingredient_id,purchase_quantity,purchase_unit,purchase_price,supplier,price_date,source,source_external_id,source_metadata)
        VALUES
          (${tenant.id},${row.ingredientId},1,${row.purchaseUnit},${row.purchasePrice},${row.supplier||'ShelfSense'},${row.priceDate}::date,
           'shelfsense',${row.sourceExternalId},${JSON.stringify({workspaceId:preview.workspaceId,externalItemId:row.externalItemId,externalItemName:row.externalItemName,sourceBaseUnit:row.sourceBaseUnit,sourceUnitCost:row.sourceUnitCost,conversionFactor:row.conversionFactor,effectiveDate:row.effectiveDate})}::jsonb)
      `;
      imported++;
    }
    await sql`
      UPDATE integrations SET last_sync_at=NOW(),last_sync_status='success',last_sync_error=NULL,updated_at=NOW()
      WHERE tenant_id=${tenant.id} AND provider='shelfsense'
    `;
    return NextResponse.json({ok:true,imported,skipped,asOf,summary:{mapped:preview.rows.length,missing:preview.rows.filter(x=>x.status==='missing').length}});
  }catch(e){
    try{
      const tenant=await requireTenant(),sql=db();
      await sql`UPDATE integrations SET last_sync_at=NOW(),last_sync_status='failed',last_sync_error=${String(e.message||e)},updated_at=NOW() WHERE tenant_id=${tenant.id} AND provider='shelfsense'`;
    }catch{}
    return NextResponse.json({error:e.message},{status:500})
  }
}
