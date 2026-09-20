import { NextResponse } from "next/server";
import { db } from "../../../db";
import {requireTenant,requireRole} from "../../../tenant";
import { encryptCredential } from "../../../integrations/crypto";
import { fetchShelfSenseItems, getShelfSenseIntegration } from "../../../integrations/shelfsense";

export async function GET(){
  try{
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
      return NextResponse.json({connected:false,tenant:{id:tenant.id,name:tenant.name},mappings});
    }
    let remote=null,error=null;
    try{remote=await fetchShelfSenseItems(tenant.id)}catch(e){error=e.message}
    return NextResponse.json({
      connected:true,
      tenant:{id:tenant.id,name:tenant.name},
      integration:{provider:'shelfsense',externalTenantId:integration.external_tenant_id,lastSyncAt:integration.last_sync_at,lastSyncStatus:integration.last_sync_status},
      remoteWorkspaceId:remote?.workspaceId||integration.external_tenant_id||null,
      items:remote?.items||[],mappings,error,
    });
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function POST(req){
  try{
    const tenant=await requireRole(['owner','admin']);
    const body=await req.json();
    const token=String(body.token||'').trim();
    const baseUrl=String(body.base_url||body.baseUrl||'https://shelfsense-0qgb.onrender.com').trim().replace(/\/$/,'');
    if(!token)return NextResponse.json({error:'ShelfSense connection token is required'},{status:400});

    const probe=await fetch(`${baseUrl}/integrations/cost-control/items`,{
      headers:{Authorization:`Bearer ${token}`},cache:'no-store'
    });
    const remote=await probe.json().catch(()=>({}));
    if(!probe.ok)return NextResponse.json({error:remote.error||`ShelfSense connection failed (${probe.status})`},{status:400});

    const enc=encryptCredential(token),sql=db();
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
    return NextResponse.json({ok:true,integration:row,itemCount:(remote.items||[]).length});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function DELETE(){
  try{
    const tenant=await requireRole(['owner','admin']),sql=db();
    await sql`UPDATE integrations SET status='disabled',updated_at=NOW() WHERE tenant_id=${tenant.id} AND provider='shelfsense'`;
    await sql`UPDATE ingredient_source_mappings SET source_type='manual',integration_id=NULL,external_item_id=NULL,external_item_name=NULL,updated_at=NOW() WHERE tenant_id=${tenant.id} AND source_type='shelfsense'`;
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
