import {NextResponse} from "next/server";
import {db} from "../../db";
import {getAuthSession} from "../../tenant";

export async function GET(){
 try{
  const session=await getAuthSession();
  if(!session?.user?.id)return NextResponse.json({authenticated:false},{status:401});
  const sql=db();
  const [membership]=await sql`
   SELECT m.tenant_id,m.role,m.status,t.name AS tenant_name,t.slug AS tenant_slug
   FROM tenant_memberships m JOIN tenants t ON t.id=m.tenant_id
   WHERE m.auth_user_id=${session.user.id} AND m.status='active' AND t.status='active'
   ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 ELSE 4 END,m.created_at
   LIMIT 1`;
  return NextResponse.json({authenticated:true,user:{id:session.user.id,email:session.user.email,name:session.user.name},membership:membership||null});
 }catch(e){return NextResponse.json({error:"Could not load account context"},{status:500})}
}
