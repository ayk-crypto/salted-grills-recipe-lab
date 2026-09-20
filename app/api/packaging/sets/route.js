import {NextResponse} from "next/server";
import {db} from "../../../db";
import {requireTenant,requireRole} from "../../../tenant";

async function list(sql,tid){
 return sql`
  SELECT ps.*,
    COALESCE((SELECT json_agg(json_build_object('id',psi.id,'packaging_item_id',pi.id,'name',pi.name,'quantity',psi.quantity,'unit_cost',pi.unit_cost,'source_type',pi.source_type) ORDER BY pi.name)
      FROM packaging_set_items psi JOIN packaging_items pi ON pi.id=psi.packaging_item_id
      WHERE psi.packaging_set_id=ps.id AND pi.tenant_id=${tid} AND pi.is_active=TRUE),'[]'::json) AS items,
    COALESCE((SELECT sum(psi.quantity*pi.unit_cost) FROM packaging_set_items psi JOIN packaging_items pi ON pi.id=psi.packaging_item_id WHERE psi.packaging_set_id=ps.id AND pi.tenant_id=${tid} AND pi.is_active=TRUE),0) AS total_cost
  FROM packaging_sets ps WHERE ps.tenant_id=${tid} AND ps.is_active=TRUE ORDER BY ps.name`;
}
export async function GET(){try{const t=await requireTenant(),sql=db();return NextResponse.json({sets:await list(sql,t.id)})}catch(e){return NextResponse.json({error:e.message},{status:500})}}
export async function POST(req){
 try{
  const t=await requireRole(['owner','admin','manager']),sql=db(),b=await req.json(),name=String(b.name||"").trim(),items=Array.isArray(b.items)?b.items:[];
  if(!name)return NextResponse.json({error:"Set name is required"},{status:400});
  const [set]=await sql`INSERT INTO packaging_sets(tenant_id,name,notes) VALUES(${t.id},${name},${b.notes||null}) RETURNING *`;
  for(const x of items){if(!x.packaging_item_id||!(Number(x.quantity)>0))continue;const [owned]=await sql`SELECT id FROM packaging_items WHERE id=${x.packaging_item_id} AND tenant_id=${t.id} AND is_active=TRUE`;if(!owned)continue;await sql`INSERT INTO packaging_set_items(packaging_set_id,packaging_item_id,quantity) VALUES(${set.id},${x.packaging_item_id},${Number(x.quantity)})`}
  return NextResponse.json({ok:true,set},{status:201});
 }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
export async function PUT(req){
 try{
  const t=await requireRole(['owner','admin','manager']),sql=db(),b=await req.json(),name=String(b.name||"").trim();
  if(!b.id||!name)return NextResponse.json({error:"Set id and name are required"},{status:400});
  const [set]=await sql`UPDATE packaging_sets SET name=${name},notes=${b.notes||null},updated_at=NOW() WHERE id=${b.id} AND tenant_id=${t.id} AND is_active=TRUE RETURNING *`;
  if(!set)return NextResponse.json({error:"Packaging set not found"},{status:404});
  await sql`DELETE FROM packaging_set_items WHERE packaging_set_id=${set.id}`;
  for(const x of (Array.isArray(b.items)?b.items:[])){if(!x.packaging_item_id||!(Number(x.quantity)>0))continue;const [owned]=await sql`SELECT id FROM packaging_items WHERE id=${x.packaging_item_id} AND tenant_id=${t.id} AND is_active=TRUE`;if(!owned)continue;await sql`INSERT INTO packaging_set_items(packaging_set_id,packaging_item_id,quantity) VALUES(${set.id},${x.packaging_item_id},${Number(x.quantity)})`}
  return NextResponse.json({ok:true,set});
 }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
export async function DELETE(req){
 try{const t=await requireRole(['owner','admin','manager']),sql=db(),{id}=await req.json();if(!id)return NextResponse.json({error:"Set id required"},{status:400});await sql`UPDATE packaging_sets SET is_active=FALSE,updated_at=NOW() WHERE id=${id} AND tenant_id=${t.id}`;return NextResponse.json({ok:true})}catch(e){return NextResponse.json({error:e.message},{status:500})}
}
