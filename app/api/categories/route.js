import { NextResponse } from "next/server";
import { db } from "../../db";

export async function POST(req) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    const sql = db();
    const [row] = await sql`
      INSERT INTO categories (name)
      VALUES (${name})
      ON CONFLICT (name) DO UPDATE SET is_active = true, updated_at = now()
      RETURNING *
    `;
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
