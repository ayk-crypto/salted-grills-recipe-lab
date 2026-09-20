import crypto from "node:crypto";
import {NextResponse} from "next/server";
import {db} from "../../db";
import {getAuthSession} from "../../tenant";
import {readJson,text} from "../../lib/validation.mjs";
import {errorResponse,requestId,okJson} from "../../lib/api-errors.mjs";

export async function POST(req){
 const id=requestId(req);try{
  const session=await getAuthSession();
  if(!session?.user?.id)return NextResponse.json({error:"Authentication required",code:"AUTH_REQUIRED",request_id:id},{status:401,headers:{"x-request-id":id}});
  const body=await readJson(req),token=text(body.token,{field:"Activation code",required:true,max:200});
  const hash=crypto.createHash("sha256").update(String(token||"")).digest("hex");
  const sql=db();
  const [existing]=await sql`SELECT id FROM tenant_memberships WHERE auth_user_id=${session.user.id} AND status='active' LIMIT 1`;
  if(existing)return okJson(NextResponse,{ok:true,alreadyActive:true},{requestId:id});
  const [claim]=await sql`
    UPDATE owner_bootstrap_tokens b SET consumed_at=NOW(),consumed_by=${session.user.id}
    WHERE b.token_hash=${hash} AND b.consumed_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM tenant_memberships m WHERE m.tenant_id=b.tenant_id AND m.role='owner' AND m.status='active')
    RETURNING b.tenant_id`;
  if(!claim)return NextResponse.json({error:"Invalid, expired, or already-used owner activation code"},{status:403});
  await sql`INSERT INTO tenant_memberships(tenant_id,auth_user_id,email,role,status)
    VALUES(${claim.tenant_id},${session.user.id},${session.user.email||null},'owner','active')
    ON CONFLICT (tenant_id,auth_user_id) DO UPDATE SET email=EXCLUDED.email,role='owner',status='active',updated_at=NOW()`;
  return okJson(NextResponse,{ok:true},{requestId:id});
 }catch(e){return errorResponse(e,NextResponse,{requestId:id,route:"/api/bootstrap-owner",action:"claim",fallback:"Could not activate workspace"})}
}
