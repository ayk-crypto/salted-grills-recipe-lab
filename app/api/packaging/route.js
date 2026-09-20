import {NextResponse} from "next/server";
import {db} from "../../db";
import {requireTenant,requireRole} from "../../tenant";
import {packagingEachCost} from "../../lib/costing.mjs";
import {readJson,text,uuid,positive,nonnegative,validationResponse} from "../../lib/validation.mjs";
import {recordAudit} from "../../lib/audit.mjs";
import {requestId,errorResponse} from "../../lib/api-errors.mjs";

const unitCost=(qty,price)=>qty>0?price/qty:null;
const derivedCost=(storageUnit,storageCost,yieldQty)=>packagingEachCost(storageCost,storageUnit,yieldQty);

export async function GET(req){
 const rid=requestId(req);try{
  const tenant=await requireTenant(),sql=db();
  const rows=await sql`
    SELECT id,name,purchase_quantity,purchase_unit,purchase_price,unit_cost,notes,is_active,
           source_type,external_item_id,source_metadata,last_source_sync_at,
           storage_unit,storage_unit_cost,purchase_to_storage_factor,storage_to_costing_factor,
           COALESCE(storage_to_costing_factor,units_per_storage_unit) AS units_per_storage_unit,costing_unit,costing_status
    FROM packaging_items
    WHERE tenant_id=${tenant.id} AND is_active=TRUE
    ORDER BY name
  `;
  return NextResponse.json({items:rows});
 }catch(e){return errorResponse(e,NextResponse,{requestId:rid,route:"/api/packaging",action:"list",fallback:"Could not load packaging"})}
}

export async function POST(req){
 const rid=requestId(req);try{
  const tenant=await requireRole(["owner","admin","manager"]),sql=db(),b=await readJson(req);
  const name=text(b.name,{field:"Packaging name",required:true,max:160});
  const purchaseQty=positive(b.purchase_quantity,{field:"Purchase quantity"});
  const purchaseUnit=text(b.purchase_unit,{field:"Purchase unit",required:true,max:40});
  const purchasePrice=nonnegative(b.purchase_price,{field:"Purchase price"});
  const yieldQty=b.storage_to_costing_factor??b.units_per_storage_unit;
  const storageToCosting=(yieldQty===undefined||yieldQty===null||String(yieldQty).trim()==="")?null:positive(yieldQty,{field:"Storage to each conversion"});
  const [dupe]=await sql`SELECT id FROM packaging_items WHERE tenant_id=${tenant.id} AND is_active=TRUE AND lower(name)=lower(${name}) LIMIT 1`;
  if(dupe)return NextResponse.json({error:"Packaging item already exists"},{status:409});
  const storageCost=unitCost(purchaseQty,purchasePrice),storageUnit=purchaseUnit,d=derivedCost(storageUnit,storageCost,storageToCosting);
  const [row]=await sql`
    INSERT INTO packaging_items(tenant_id,name,purchase_quantity,purchase_unit,purchase_price,storage_unit,storage_unit_cost,purchase_to_storage_factor,storage_to_costing_factor,units_per_storage_unit,costing_unit,costing_status,unit_cost,notes,source_type)
    VALUES(${tenant.id},${name},${purchaseQty},${purchaseUnit},${purchasePrice},${storageUnit},${storageCost},1,${storageToCosting},${storageToCosting},'each',${d.status},${d.unitCost},${text(b.notes,{field:"Notes",max:2000})||null},'manual')
    RETURNING *`;
  await recordAudit(sql,{tenant,action:"create",entityType:"packaging_item",entityId:row.id,entityName:row.name,after:{name:row.name,purchase_quantity:row.purchase_quantity,purchase_unit:row.purchase_unit,purchase_price:row.purchase_price,storage_unit:row.storage_unit,storage_to_costing_factor:row.storage_to_costing_factor,unit_cost:row.unit_cost,costing_status:row.costing_status,source_type:row.source_type},requestId:rid});
  return NextResponse.json(row,{status:201});
 }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return errorResponse(e,NextResponse,{requestId:rid,route:"/api/packaging",action:"create",fallback:"Could not save packaging"})}
}

export async function PUT(req){
 const rid=requestId(req);try{
  const tenant=await requireRole(["owner","admin","manager"]),sql=db(),b=await readJson(req);
  const id=uuid(b.id,{field:"Packaging id"}),name=text(b.name,{field:"Packaging name",required:true,max:160});
  const [existing]=await sql`SELECT id,name,source_type,purchase_quantity,purchase_unit,purchase_price,storage_unit,storage_unit_cost,purchase_to_storage_factor,COALESCE(storage_to_costing_factor,units_per_storage_unit) AS storage_to_costing_factor,unit_cost,costing_status FROM packaging_items WHERE id=${id} AND tenant_id=${tenant.id} AND is_active=TRUE LIMIT 1`;
  if(!existing)return NextResponse.json({error:"Packaging item not found"},{status:404});
  const rawYield=b.storage_to_costing_factor??b.units_per_storage_unit;
  const yieldQty=(rawYield===undefined||rawYield===null||String(rawYield).trim()==="")?null:positive(rawYield,{field:"Storage to each conversion"});
  const notes=text(b.notes,{field:"Notes",max:2000})||null;
  if(existing.source_type==="shelfsense"){
    const d=derivedCost(existing.storage_unit,existing.storage_unit_cost,yieldQty);
    const [row]=await sql`
      UPDATE packaging_items SET name=${name},storage_to_costing_factor=${yieldQty},units_per_storage_unit=${yieldQty},costing_unit='each',costing_status=${d.status},unit_cost=${d.unitCost},
        notes=${notes},updated_at=NOW()
      WHERE id=${id} AND tenant_id=${tenant.id} AND is_active=TRUE
      RETURNING *`;
    await recordAudit(sql,{tenant,action:"update",entityType:"packaging_item",entityId:id,entityName:row.name,before:existing,after:row,requestId:rid});
    return NextResponse.json(row);
  }
  const purchaseQty=positive(b.purchase_quantity,{field:"Purchase quantity"});
  const purchaseUnit=text(b.purchase_unit,{field:"Purchase unit",required:true,max:40});
  const purchasePrice=nonnegative(b.purchase_price,{field:"Purchase price"});
  const storageCost=unitCost(purchaseQty,purchasePrice),d=derivedCost(purchaseUnit,storageCost,yieldQty);
  const [row]=await sql`
    UPDATE packaging_items SET name=${name},purchase_quantity=${purchaseQty},
      purchase_unit=${purchaseUnit},purchase_price=${purchasePrice},storage_unit=${purchaseUnit},storage_unit_cost=${storageCost},
      purchase_to_storage_factor=1,storage_to_costing_factor=${yieldQty},units_per_storage_unit=${yieldQty},costing_unit='each',costing_status=${d.status},unit_cost=${d.unitCost},
      notes=${notes},updated_at=NOW()
    WHERE id=${id} AND tenant_id=${tenant.id} AND is_active=TRUE
    RETURNING *`;
  await recordAudit(sql,{tenant,action:"update",entityType:"packaging_item",entityId:id,entityName:row.name,before:existing,after:row,requestId:rid});
  return NextResponse.json(row);
 }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return errorResponse(e,NextResponse,{requestId:rid,route:"/api/packaging",action:"update",fallback:"Could not update packaging"})}
}

export async function DELETE(req){
 const rid=requestId(req);try{
  const tenant=await requireRole(["owner","admin","manager"]),sql=db(),b=await readJson(req),id=uuid(b.id,{field:"Packaging id"});
  const [before]=await sql`SELECT id,name,source_type,purchase_quantity,purchase_unit,purchase_price,storage_unit,storage_to_costing_factor,unit_cost,costing_status FROM packaging_items WHERE id=${id} AND tenant_id=${tenant.id} LIMIT 1`;
  if(!before)return NextResponse.json({error:"Packaging item not found"},{status:404});
  const [usage]=await sql`
    SELECT (
      (SELECT count(*) FROM packaging_set_items psi JOIN packaging_sets ps ON ps.id=psi.packaging_set_id WHERE psi.packaging_item_id=${id} AND ps.tenant_id=${tenant.id}) +
      (SELECT count(*) FROM recipe_packaging rp JOIN recipes r ON r.id=rp.recipe_id WHERE rp.packaging_item_id=${id} AND r.tenant_id=${tenant.id})
    )::int AS count`;
  if((usage?.count||0)>0){
    await sql`UPDATE packaging_items SET is_active=FALSE,updated_at=NOW() WHERE id=${id} AND tenant_id=${tenant.id}`;
    await recordAudit(sql,{tenant,action:"deactivate",entityType:"packaging_item",entityId:id,entityName:before.name,before,after:{...before,is_active:false},requestId:rid});
    return NextResponse.json({ok:true,mode:"deactivated"});
  }
  await sql`DELETE FROM packaging_items WHERE id=${id} AND tenant_id=${tenant.id}`;
  await recordAudit(sql,{tenant,action:"delete",entityType:"packaging_item",entityId:id,entityName:before.name,before,requestId:rid});
  return NextResponse.json({ok:true,mode:"deleted"});
 }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return errorResponse(e,NextResponse,{requestId:rid,route:"/api/packaging",action:"delete",fallback:"Could not delete packaging"})}
}
