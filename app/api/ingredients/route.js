import { NextResponse } from "next/server";
import { db } from "../../db";

export async function POST(req) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({error:"Name is required"}, {status:400});
    const sql = db();
    const [row] = await sql`
      INSERT INTO ingredients (name, default_unit, ingredient_type, notes)
      VALUES (${name}, ${body.default_unit || "g"}, ${body.ingredient_type || "raw"}, ${body.notes || null})
      RETURNING *
    `;
    return NextResponse.json(row, {status:201});
  } catch (e) {
    return NextResponse.json({error:e.message}, {status:500});
  }
}
