import {headers} from "next/headers";
import {db} from "./db.js";
import {NEON_AUTH_BASE_URL} from "./auth-config.js";

export async function getAuthSession(){
  const h=await headers();
  const cookie=h.get("cookie")||"";
  if(!cookie)return null;
  try{
    const r=await fetch(NEON_AUTH_BASE_URL+"/get-session",{headers:{cookie,"user-agent":h.get("user-agent")||""},cache:"no-store"});
    if(!r.ok)return null;
    const session=await r.json();
    return session?.user?.id?session:null;
  }catch{return null}
}

export async function requireSession(){
  const session=await getAuthSession();
  if(!session?.user?.id){
    const e=new Error("Authentication required");e.status=401;throw e;
  }
  return session;
}

export async function requireTenant(){
  const session=await requireSession(),sql=db(),h=await headers(),requested=h.get("x-platecost-tenant");
  const rows=await sql`
    SELECT t.*,m.role,m.status AS membership_status,m.auth_user_id
    FROM tenant_memberships m JOIN tenants t ON t.id=m.tenant_id
    WHERE m.auth_user_id=${session.user.id} AND m.status='active' AND t.status='active'
      AND (${requested||null}::text IS NULL OR t.slug=${requested||null} OR t.id::text=${requested||null})
    ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 ELSE 4 END,m.created_at
    LIMIT 1`;
  const tenant=rows[0];
  if(!tenant){const e=new Error("No active workspace membership");e.status=403;throw e}
  return {...tenant,user:session.user};
}

export async function requireRole(roles){
  const tenant=await requireTenant();
  if(!roles.includes(tenant.role)){const e=new Error("Insufficient permissions");e.status=403;throw e}
  return tenant;
}

export function publicError(e,fallback="Request failed"){
  return {message:e?.status&&e.status<500?e.message:fallback,status:e?.status||500};
}
