import {NextResponse} from "next/server";
import {db} from "../../db";
import {requireTenant} from "../../tenant";
import {requestId,errorResponse,okJson} from "../../lib/api-errors.mjs";

export async function GET(req){
  const rid=requestId(req);
  try{
    const tenant=await requireTenant(),sql=db(),url=new URL(req.url);
    const entityType=(url.searchParams.get("entity_type")||"").trim();
    const action=(url.searchParams.get("action")||"").trim();
    const actor=(url.searchParams.get("actor")||"").trim();
    const limit=Math.max(1,Math.min(200,Number(url.searchParams.get("limit")||100)));
    const rows=await sql`
      SELECT id,actor_user_id,actor_email,actor_role,action,entity_type,entity_id,entity_name,
             before_data,after_data,metadata,request_id,created_at
      FROM audit_events
      WHERE tenant_id=${tenant.id}
        AND (${entityType||null}::text IS NULL OR entity_type=${entityType||null})
        AND (${action||null}::text IS NULL OR action=${action||null})
        AND (${actor||null}::text IS NULL OR actor_email ILIKE '%'||${actor||null}||'%')
      ORDER BY created_at DESC
      LIMIT ${limit}`;
    return okJson(NextResponse,{events:rows},{requestId:rid});
  }catch(e){return errorResponse(e,NextResponse,{requestId:rid,route:"/api/audit",action:"list",fallback:"Could not load audit history"})}
}
