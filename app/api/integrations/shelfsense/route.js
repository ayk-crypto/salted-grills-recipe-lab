import { NextResponse } from "next/server";
import { db } from "../../../db";
import {requireTenant,requireRole} from "../../../tenant";
import { encryptCredential } from "../../../integrations/crypto";
import { fetchShelfSenseItems, getShelfSenseIntegration, validateShelfSenseBaseUrl } from "../../../integrations/shelfsense";
import {readJson,text,validationResponse} from "../../../lib/validation.mjs";
import {errorResponse,requestId,okJson} from "../../../lib/api-errors.mjs";
import {recordAudit} from "../../../lib/audit.mjs";

export async function GET(req){
  const rid=requestId(req);try{
    const tenant=await requireTenant();
    const sql=db();
    const integration=await getShelfSenseIntegration(tenant.id);
    const mappings=await sql`
      SELECT m.ingredient_id,m.source_type,m.external_item_id,m.external_item_name,
             m.kitchen_unit,m.conversion_factor,m.updated_at,i.name AS ingredient_name
      FROM ingredient_source_mappings m
      JOIN ingredients i ON i.id=m.ingredient_id AND i.tenant_id=m.tenant_id
      WHERE m.tenant_id=${tenant.id} AND m.is_active=TRUE
      ORDER BY i.name
    `;
    if(!integration){
      return okJson(NextResponse,{connected:false,tenant:{id:tenant.id,name:tenant.name},mappings},{requestId:rid});
    }
    let remote=null,error=null;
    try{remote=await fetchShelfSenseItems(tenant.id)}catch(e){error=e.message}
    return okJson(NextResponse,{
      connected:true,
      tenant:{id:tenant.id,name:tenant.name},
      integration:{provider:'shelfsense',externalTenantId:integration.external_tenant_id,lastSyncAt:integration.last_sync_at,lastSyncStatus:integration.last_sync_status},
      remoteWorkspaceId:remote?.workspaceId||integration.external_tenant_id||null,
      items:remote?.items||[],mappings,error,
    },{requestId:rid});
  }catch(e){return errorResponse(e,NextResponse,{requestId:rid,route:"/api/integrations/shelfsense",action:"status",fallback:"Could not load ShelfSense connection"})}
}

export async function POST(req){
  const rid=requestId(req);try{
    const tenant=await requireRole(['owner','admin']);
    const body=await readJson(req);
    const token=text(body.token,{field:"ShelfSense connection token",required:true,max:4096});
    const baseUrl=validateShelfSenseBaseUrl(body.base_url||body.baseUrl||'https://shelfsense-0qgb.onrender.com');

    const probe=await fetch(`${baseUrl}/integrations/cost-control/items`,{
      headers:{Authorization:`Bearer ${token}`},cache:'no-store'
    });
    const remote=await probe.json().catch(()=>({}));
    if(!probe.ok)return NextResponse.json({error:remote.error||`ShelfSense connection failed (${probe.status})`},{status:400});

    const enc=encryptCredential(token),sql=db();
    const before=await getShelfSenseIntegration(tenant.id);
    const [row]=await sql`
      INSERT INTO integrations
        (tenant_id,provider,status,external_tenant_id,base_url,credential_ciphertext,credential_iv,credential_tag,last_sync_status,updated_at)
      VALUES
        (${tenant.id},'shelfsense','active',${String(remote.workspaceId||'')},${baseUrl},${enc.ciphertext},${enc.iv},${enc.tag},'connected',NOW())
      ON CONFLICT (tenant_id,provider) DO UPDATE SET
        status='active',external_tenant_id=EXCLUDED.external_tenant_id,base_url=EXCLUDED.base_url,
        credential_ciphertext=EXCLUDED.credential_ciphertext,credential_iv=EXCLUDED.credential_iv,
        credential_tag=EXCLUDED.credential_tag,last_sync_status='connected',last_sync_error=NULL,updated_at=NOW()
      RETURNING id,external_tenant_id,base_url,status
    `;
    await recordAudit(sql,{tenant,action:before?"reconnect":"connect",entityType:"integration",entityId:row.id,entityName:"ShelfSense",before:before?{status:before.status,external_tenant_id:before.external_tenant_id,base_url:before.base_url}:null,after:{status:row.status,external_tenant_id:row.external_tenant_id,base_url:row.base_url,item_count:(remote.items||[]).length},requestId:rid});
    return okJson(NextResponse,{ok:true,integration:row,itemCount:(remote.items||[]).length},{requestId:rid});
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return errorResponse(e,NextResponse,{requestId:rid,route:"/api/integrations/shelfsense",action:"connect",fallback:"Could not connect ShelfSense"})}
}

export async function DELETE(req){
  const rid=requestId(req);try{
    const tenant=await requireRole(['owner','admin']),sql=db();
    const before=await getShelfSenseIntegration(tenant.id);
    await sql`UPDATE integrations SET status='disabled',updated_at=NOW() WHERE tenant_id=${tenant.id} AND provider='shelfsense'`;
    await sql`UPDATE ingredient_source_mappings SET source_type='manual',integration_id=NULL,external_item_id=NULL,external_item_name=NULL,updated_at=NOW() WHERE tenant_id=${tenant.id} AND source_type='shelfsense'`;
    await recordAudit(sql,{tenant,action:"disconnect",entityType:"integration",entityId:before?.id||null,entityName:"ShelfSense",before:before?{status:before.status,external_tenant_id:before.external_tenant_id,base_url:before.base_url}:null,after:{status:"disabled"},requestId:rid});
    return okJson(NextResponse,{ok:true},{requestId:rid});
  }catch(e){return errorResponse(e,NextResponse,{requestId:rid,route:"/api/integrations/shelfsense",action:"disconnect",fallback:"Could not disconnect ShelfSense"})}
}
