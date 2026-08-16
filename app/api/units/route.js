import { NextResponse } from "next/server";
import { db } from "../../db";

export async function GET() {
  try {
    const sql = db();
    const rows = await sql`SELECT * FROM measurement_units WHERE is_active=true ORDER BY unit_group NULLS LAST, name`;
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({error:e.message},{status:500});
  }
}

export async function POST(req) {
  try {
    const b=await req.json();
    const name=String(b.name||'').trim();
    const symbol=String(b.symbol||'').trim();
    if(!name||!symbol) return NextResponse.json({error:'Name and symbol are required'},{status:400});
    const sql=db();
    const [row]=await sql`
      INSERT INTO measurement_units (name,symbol,unit_group,is_active)
      VALUES (${name},${symbol},${b.unit_group||null},true)
      ON CONFLICT (lower(symbol)) WHERE is_active=true
      DO UPDATE SET name=EXCLUDED.name, unit_group=EXCLUDED.unit_group, updated_at=now()
      RETURNING *
    `;
    return NextResponse.json(row,{status:201});
  } catch(e){return NextResponse.json({error:e.message},{status:500});}
}

export async function DELETE(req) {
  try {
    const {id}=await req.json();
    const sql=db();
    const [row]=await sql`UPDATE measurement_units SET is_active=false,updated_at=now() WHERE id=${id} RETURNING id`;
    if(!row) return NextResponse.json({error:'Unit not found'},{status:404});
    return NextResponse.json({ok:true});
  } catch(e){return NextResponse.json({error:e.message},{status:500});}
}
