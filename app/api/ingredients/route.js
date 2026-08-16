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

export async function DELETE(req) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({error:"Ingredient id is required"}, {status:400});
    const sql = db();
    const [usage] = await sql`
      SELECT count(*)::int AS count FROM recipe_components WHERE ingredient_id = ${id}
    `;
    if ((usage?.count || 0) > 0) {
      await sql`UPDATE ingredients SET is_active = false, updated_at = now() WHERE id = ${id}`;
      return NextResponse.json({ok:true, mode:"deactivated", message:"Ingredient is used in a recipe, so it was hidden from the active ingredient list."});
    }
    await sql`DELETE FROM ingredient_prices WHERE ingredient_id = ${id}`;
    await sql`DELETE FROM ingredients WHERE id = ${id}`;
    return NextResponse.json({ok:true, mode:"deleted"});
  } catch (e) {
    return NextResponse.json({error:e.message}, {status:500});
  }
}
