import { NextResponse } from "next/server";
import { db } from "../../db";
import { requireTenant } from "../../tenant";

const ALLOWED = new Set(["ingredient", "recipe", "category", "price"]);

export async function GET(req) {
  try {
    const tenant = await requireTenant();
    const sql = db();
    const type = new URL(req.url).searchParams.get("type");
    const rows = type && ALLOWED.has(type)
      ? await sql`SELECT entity_type,entity_id,note,created_at FROM entity_flags WHERE tenant_id=${tenant.id} AND entity_type=${type} ORDER BY created_at DESC`
      : await sql`SELECT entity_type,entity_id,note,created_at FROM entity_flags WHERE tenant_id=${tenant.id} ORDER BY created_at DESC`;
    return NextResponse.json({ flags: rows });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const tenant = await requireTenant();
    const sql = db();
    const body = await req.json();
    const entityType = String(body.entity_type || body.entityType || "").trim();
    const entityId = String(body.entity_id || body.entityId || "").trim();
    if (!ALLOWED.has(entityType) || !entityId) return NextResponse.json({ error: "Invalid flag target" }, { status: 400 });
    await sql`INSERT INTO entity_flags(tenant_id,entity_type,entity_id,note) VALUES(${tenant.id},${entityType},${entityId},${body.note || null}) ON CONFLICT(tenant_id,entity_type,entity_id) DO UPDATE SET note=EXCLUDED.note,updated_at=NOW()`;
    return NextResponse.json({ ok: true, flagged: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const tenant = await requireTenant();
    const sql = db();
    const body = await req.json();
    const entityType = String(body.entity_type || body.entityType || "").trim();
    const entityId = String(body.entity_id || body.entityId || "").trim();
    if (!ALLOWED.has(entityType) || !entityId) return NextResponse.json({ error: "Invalid flag target" }, { status: 400 });
    await sql`DELETE FROM entity_flags WHERE tenant_id=${tenant.id} AND entity_type=${entityType} AND entity_id=${entityId}`;
    return NextResponse.json({ ok: true, flagged: false });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
