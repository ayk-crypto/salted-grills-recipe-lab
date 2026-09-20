import {NextResponse} from "next/server";
import {db} from "../../db";
import {requireTenant,requireRole} from "../../tenant";
import {readJson,text,uuid,oneOf} from "../../lib/validation.mjs";
import {errorResponse,requestId,okJson} from "../../lib/api-errors.mjs";

const TYPES=["ingredient","recipe","category","price"];

export async function GET(req){
  const id=requestId(req);
  try{
    const tenant=await requireTenant(),sql=db(),type=new URL(req.url).searchParams.get("type");
    const rows=type&&TYPES.includes(type)
      ?await sql`SELECT entity_type,entity_id,note,created_at FROM entity_flags WHERE tenant_id=${tenant.id} AND entity_type=${type} ORDER BY created_at DESC`
      :await sql`SELECT entity_type,entity_id,note,created_at FROM entity_flags WHERE tenant_id=${tenant.id} ORDER BY created_at DESC`;
    return okJson(NextResponse,{flags:rows},{requestId:id});
  }catch(e){return errorResponse(e,NextResponse,{requestId:id,route:"/api/flags",action:"list",fallback:"Could not load flags"})}
}
export async function POST(req){
  const id=requestId(req);
  try{
    const tenant=await requireRole(["owner","admin","manager"]),sql=db(),body=await readJson(req);
    const entityType=oneOf(body.entity_type||body.entityType,TYPES,{field:"Entity type"});
    const entityId=uuid(body.entity_id||body.entityId,{field:"Entity id"});
    const note=text(body.note,{field:"Note",max:1000})||null;
    await sql`INSERT INTO entity_flags(tenant_id,entity_type,entity_id,note) VALUES(${tenant.id},${entityType},${entityId},${note}) ON CONFLICT(tenant_id,entity_type,entity_id) DO UPDATE SET note=EXCLUDED.note,updated_at=NOW()`;
    return okJson(NextResponse,{ok:true,flagged:true},{requestId:id});
  }catch(e){return errorResponse(e,NextResponse,{requestId:id,route:"/api/flags",action:"flag",fallback:"Could not update flag"})}
}
export async function DELETE(req){
  const id=requestId(req);
  try{
    const tenant=await requireRole(["owner","admin","manager"]),sql=db(),body=await readJson(req);
    const entityType=oneOf(body.entity_type||body.entityType,TYPES,{field:"Entity type"});
    const entityId=uuid(body.entity_id||body.entityId,{field:"Entity id"});
    await sql`DELETE FROM entity_flags WHERE tenant_id=${tenant.id} AND entity_type=${entityType} AND entity_id=${entityId}`;
    return okJson(NextResponse,{ok:true,flagged:false},{requestId:id});
  }catch(e){return errorResponse(e,NextResponse,{requestId:id,route:"/api/flags",action:"unflag",fallback:"Could not update flag"})}
}
