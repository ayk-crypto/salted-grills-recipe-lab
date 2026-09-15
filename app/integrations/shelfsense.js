import { db } from "../db.js";
import { decryptCredential } from "./crypto.js";

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
  const base=String(integration.base_url||'').replace(/\/$/,'');
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
