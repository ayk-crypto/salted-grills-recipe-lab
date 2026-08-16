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

export async function DELETE(req) {
  try {
    const body = await req.json();
    const sql = db();
    let item;
    if (body.id) {
      [item] = await sql`SELECT id, name FROM categories WHERE id = ${body.id}`;
    } else if (body.name) {
      [item] = await sql`SELECT id, name FROM categories WHERE name = ${String(body.name).trim()}`;
    }
    if (!item) return NextResponse.json({error:"Category not found"}, {status:404});
    const [usage] = await sql`SELECT count(*)::int AS count FROM recipes WHERE category = ${item.name} AND is_active = true`;
    if ((usage?.count || 0) > 0) {
      await sql`UPDATE categories SET is_active = false, updated_at = now() WHERE id = ${item.id}`;
      return NextResponse.json({ok:true, mode:"deactivated", message:"Category is used by recipes, so it was hidden from the active category list."});
    }
    await sql`DELETE FROM categories WHERE id = ${item.id}`;
    return NextResponse.json({ok:true, mode:"deleted"});
  } catch (e) {
    return NextResponse.json({error:e.message}, {status:500});
  }
}
