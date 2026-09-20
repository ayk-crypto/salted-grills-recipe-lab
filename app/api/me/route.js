import {NextResponse} from "next/server";
import {db} from "../../db";
import {getAuthSession} from "../../tenant";
import {errorResponse,requestId,okJson} from "../../lib/api-errors.mjs";

export async function GET(req){
 const id=requestId(req);try{
  const session=await getAuthSession();
  if(!session?.user?.id)return NextResponse.json({authenticated:false,request_id:id},{status:401,headers:{"x-request-id":id}});
  const sql=db();
  const [membership]=await sql`
   SELECT m.tenant_id,m.role,m.status,t.name AS tenant_name,t.slug AS tenant_slug
   FROM tenant_memberships m JOIN tenants t ON t.id=m.tenant_id
   WHERE m.auth_user_id=${session.user.id} AND m.status='active' AND t.status='active'
   ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 ELSE 4 END,m.created_at
   LIMIT 1`;
  return okJson(NextResponse,{authenticated:true,user:{id:session.user.id,email:session.user.email,name:session.user.name},membership:membership||null},{requestId:id});
 }catch(e){return errorResponse(e,NextResponse,{requestId:id,route:"/api/me",action:"account_context",fallback:"Could not load account context"})}
}
