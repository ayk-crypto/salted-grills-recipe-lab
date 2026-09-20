import { db } from "../db.js";
import { decryptCredential } from "./crypto.js";

const DEFAULT_ALLOWED=["https://shelfsense-0qgb.onrender.com"];
function allowedOrigins(){
  return new Set([...DEFAULT_ALLOWED,...String(process.env.SHELFSENSE_ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean)].map(x=>new URL(x).origin));
}
export function validateShelfSenseBaseUrl(value){
  let u;try{u=new URL(String(value||""))}catch{throw new Error("Invalid ShelfSense URL")}
  if(u.protocol!=="https:")throw new Error("ShelfSense URL must use HTTPS");
  if(u.username||u.password||u.pathname!=="/"&&u.pathname!=="")throw new Error("ShelfSense URL must be an origin only");
  if(!allowedOrigins().has(u.origin))throw new Error("ShelfSense host is not approved");
  return u.origin;
}

export async function getShelfSenseIntegration(tenantId){
  const sql=db();
  const [row]=await sql`
    SELECT * FROM integrations
    WHERE tenant_id=${tenantId} AND provider='shelfsense' AND status='active'
    LIMIT 1
  `;
  if(!row)return null;
  return {
    ...row,
    token:decryptCredential({
      ciphertext:row.credential_ciphertext,
      iv:row.credential_iv,
      tag:row.credential_tag,
    }),
  };
}

async function shelfSenseFetch(integration,path){
  const base=validateShelfSenseBaseUrl(integration.base_url);
  const r=await fetch(`${base}${path}`,{
    headers:{Authorization:`Bearer ${integration.token}`},
    cache:'no-store',
  });
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(body.error||`ShelfSense request failed (${r.status})`);
  return body;
}

export async function fetchShelfSenseItems(tenantId){
  const integration=await getShelfSenseIntegration(tenantId);
  if(!integration)throw new Error('ShelfSense is not connected for this tenant');
  return shelfSenseFetch(integration,'/integrations/cost-control/items');
}

export async function fetchShelfSenseCosts(tenantId,asOf){
  const integration=await getShelfSenseIntegration(tenantId);
  if(!integration)throw new Error('ShelfSense is not connected for this tenant');
  const q=asOf?`?asOf=${encodeURIComponent(asOf)}`:'';
  return shelfSenseFetch(integration,`/integrations/cost-control/costs${q}`);
}
