// Tenant-scoped audit trail.
function safe(value){
  if(value===undefined)return null;
  try{return JSON.parse(JSON.stringify(value))}catch{return null}
}
export async function recordAudit(sql,{tenant,action,entityType,entityId=null,entityName=null,before=null,after=null,metadata={},requestId=null}){
  if(!tenant?.id||!action||!entityType)return;
  const actor=tenant.user||{};
  await sql`
    INSERT INTO audit_events
      (tenant_id,actor_user_id,actor_email,actor_role,action,entity_type,entity_id,entity_name,before_data,after_data,metadata,request_id)
    VALUES
      (${tenant.id},${actor.id||tenant.auth_user_id||null},${actor.email||null},${tenant.role||null},
       ${action},${entityType},${entityId?String(entityId):null},${entityName||null},
       ${before?safe(before):null}::jsonb,${after?safe(after):null}::jsonb,${safe(metadata)||{}}::jsonb,${requestId||null})
  `;
}
