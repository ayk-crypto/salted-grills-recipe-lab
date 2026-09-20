import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {db} from "../../../db";
import {requireTenant,requireRole} from "../../../tenant";
import {readJson,text,uuid,positive,list,validationResponse} from "../../../lib/validation.mjs";

function cleanItems(raw){
 return list(Array.isArray(raw)?raw:[],{field:"Packaging set items",max:100}).map((x,i)=>({
  packaging_item_id:uuid(x?.packaging_item_id,{field:`Packaging set item #${i+1} id`}),
  quantity:positive(x?.quantity,{field:`Packaging set item #${i+1} quantity`})
 }));
}
async function listSets(sql,tid){
 return sql`
  SELECT ps.*,
    COALESCE((SELECT json_agg(json_build_object('id',psi.id,'packaging_item_id',pi.id,'name',pi.name,'quantity',psi.quantity,'unit_cost',pi.unit_cost,'source_type',pi.source_type) ORDER BY pi.name)
      FROM packaging_set_items psi JOIN packaging_items pi ON pi.id=psi.packaging_item_id
      WHERE psi.packaging_set_id=ps.id AND pi.tenant_id=${tid} AND pi.is_active=TRUE),'[]'::json) AS items,
    COALESCE((SELECT sum(psi.quantity*pi.unit_cost) FROM packaging_set_items psi JOIN packaging_items pi ON pi.id=psi.packaging_item_id WHERE psi.packaging_set_id=ps.id AND pi.tenant_id=${tid} AND pi.is_active=TRUE),0) AS total_cost
  FROM packaging_sets ps WHERE ps.tenant_id=${tid} AND ps.is_active=TRUE ORDER BY ps.name`;
}
export async function GET(){
 try{const t=await requireTenant(),sql=db();return NextResponse.json({sets:await listSets(sql,t.id)})}
 catch{return NextResponse.json({error:"Could not load packaging sets"},{status:500})}
}
export async function POST(req){
 try{
  const t=await requireRole(["owner","admin","manager"]),sql=db(),b=await readJson(req);
  const name=text(b.name,{field:"Set name",required:true,max:160}),notes=text(b.notes,{field:"Notes",max:2000})||null,items=cleanItems(b.items);
  for(const x of items){const [owned]=await sql`SELECT id FROM packaging_items WHERE id=${x.packaging_item_id} AND tenant_id=${t.id} AND is_active=TRUE`;if(!owned)return NextResponse.json({error:"Packaging item does not belong to this workspace"},{status:400})}
  const setId=randomUUID(),queries=[sql`INSERT INTO packaging_sets(id,tenant_id,name,notes) VALUES(${setId},${t.id},${name},${notes})`];
  items.forEach(x=>queries.push(sql`INSERT INTO packaging_set_items(packaging_set_id,packaging_item_id,quantity) VALUES(${setId},${x.packaging_item_id},${x.quantity})`));
  await sql.transaction(queries,{isolationLevel:"Serializable"});
  return NextResponse.json({ok:true,set:{id:setId,name,notes}},{status:201});
 }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Could not save packaging set"},{status:500})}
}
export async function PUT(req){
 try{
  const t=await requireRole(["owner","admin","manager"]),sql=db(),b=await readJson(req);
  const id=uuid(b.id,{field:"Packaging set id"}),name=text(b.name,{field:"Set name",required:true,max:160}),notes=text(b.notes,{field:"Notes",max:2000})||null,items=cleanItems(b.items);
  const [ownedSet]=await sql`SELECT id FROM packaging_sets WHERE id=${id} AND tenant_id=${t.id} AND is_active=TRUE`;
  if(!ownedSet)return NextResponse.json({error:"Packaging set not found"},{status:404});
  for(const x of items){const [owned]=await sql`SELECT id FROM packaging_items WHERE id=${x.packaging_item_id} AND tenant_id=${t.id} AND is_active=TRUE`;if(!owned)return NextResponse.json({error:"Packaging item does not belong to this workspace"},{status:400})}
  const queries=[
    sql`UPDATE packaging_sets SET name=${name},notes=${notes},updated_at=NOW() WHERE id=${id} AND tenant_id=${t.id} AND is_active=TRUE`,
    sql`DELETE FROM packaging_set_items WHERE packaging_set_id=${id}`
  ];
  items.forEach(x=>queries.push(sql`INSERT INTO packaging_set_items(packaging_set_id,packaging_item_id,quantity) VALUES(${id},${x.packaging_item_id},${x.quantity})`));
  await sql.transaction(queries,{isolationLevel:"Serializable"});
  return NextResponse.json({ok:true,set:{id,name,notes}});
 }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Could not update packaging set"},{status:500})}
}
export async function DELETE(req){
 try{
  const t=await requireRole(["owner","admin","manager"]),sql=db(),b=await readJson(req),id=uuid(b.id,{field:"Packaging set id"});
  await sql`UPDATE packaging_sets SET is_active=FALSE,updated_at=NOW() WHERE id=${id} AND tenant_id=${t.id}`;
  return NextResponse.json({ok:true});
 }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Could not delete packaging set"},{status:500})}
}
