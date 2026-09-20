import crypto from "node:crypto";
import {NextResponse} from "next/server";
import {db} from "../../db";
import {getAuthSession} from "../../tenant";

export async function POST(req){
 try{
  const session=await getAuthSession();
  if(!session?.user?.id)return NextResponse.json({error:"Authentication required"},{status:401});
  const {token}=await req.json();
  const hash=crypto.createHash("sha256").update(String(token||"")).digest("hex");
  const sql=db();
  const [existing]=await sql`SELECT id FROM tenant_memberships WHERE auth_user_id=${session.user.id} AND status='active' LIMIT 1`;
  if(existing)return NextResponse.json({ok:true,alreadyActive:true});
  const [claim]=await sql`
    UPDATE owner_bootstrap_tokens b SET consumed_at=NOW(),consumed_by=${session.user.id}
    WHERE b.token_hash=${hash} AND b.consumed_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM tenant_memberships m WHERE m.tenant_id=b.tenant_id AND m.role='owner' AND m.status='active')
    RETURNING b.tenant_id`;
  if(!claim)return NextResponse.json({error:"Invalid, expired, or already-used owner activation code"},{status:403});
  await sql`INSERT INTO tenant_memberships(tenant_id,auth_user_id,email,role,status)
    VALUES(${claim.tenant_id},${session.user.id},${session.user.email||null},'owner','active')
    ON CONFLICT (tenant_id,auth_user_id) DO UPDATE SET email=EXCLUDED.email,role='owner',status='active',updated_at=NOW()`;
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:"Could not activate workspace"},{status:500})}
}
