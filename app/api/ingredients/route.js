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
    const body = await req.json();
    const sql = db();
    let item;
    if (body.id) {
      [item] = await sql`SELECT id, name FROM ingredients WHERE id = ${body.id}`;
    } else if (body.name) {
      [item] = await sql`SELECT id, name FROM ingredients WHERE name = ${String(body.name).trim()}`;
    }
    if (!item) return NextResponse.json({error:"Ingredient not found"}, {status:404});

    const usage = await sql`
      SELECT DISTINCT r.id,r.name,r.recipe_type
      FROM recipes r
      JOIN recipe_versions rv ON rv.id=r.current_version_id
      JOIN recipe_components rc ON rc.recipe_version_id=rv.id
      WHERE r.is_active=true AND rc.ingredient_id=${item.id}
      ORDER BY r.name
    `;
    if (usage.length) {
      return NextResponse.json({
        error:`${item.name} is still used in ${usage.length} active item${usage.length===1?'':'s'}. Remove it from those items first.`,
        used_in:usage
      }, {status:409});
    }

    await sql`DELETE FROM ingredient_prices WHERE ingredient_id = ${item.id}`;
    await sql`DELETE FROM ingredients WHERE id = ${item.id}`;
    return NextResponse.json({ok:true, mode:"deleted", item});
  } catch (e) {
    return NextResponse.json({error:e.message}, {status:500});
  }
}
