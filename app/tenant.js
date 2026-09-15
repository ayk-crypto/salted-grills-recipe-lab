import { db } from "./db.js";

export async function getDefaultTenant(){
  const sql=db();
  const slug=process.env.DEFAULT_TENANT_SLUG||'salted-grills';
  const [tenant]=await sql`SELECT * FROM tenants WHERE slug=${slug} AND status='active' LIMIT 1`;
  if(!tenant)throw new Error(`Active tenant not found for slug: ${slug}`);
  return tenant;
}

export async function requireTenant(){
  // Current Salted Grills deployment uses the configured default tenant.
  // SaaS authentication will replace this resolver with session/workspace context.
  return getDefaultTenant();
}
