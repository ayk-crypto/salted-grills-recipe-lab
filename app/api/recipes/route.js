import { NextResponse } from "next/server";
import { db } from "../../db";

export async function POST(req) {
  const b = await req.json();
  const sql = db();
  let recipe=null;
  try {
    [recipe] = await sql`
      INSERT INTO recipes (name, recipe_type, category)
      VALUES (${String(b.name||"").trim()}, ${b.recipe_type || "menu"}, ${b.category || null})
      RETURNING *
    `;
    const [version] = await sql`
      INSERT INTO recipe_versions
      (recipe_id, version_no, status, yield_quantity, yield_unit, prep_time_minutes, cook_time_minutes, kitchen_notes)
      VALUES (${recipe.id}, 1, ${b.status || "draft"}, ${b.yield_quantity || null},
              ${b.yield_unit || null}, ${b.prep_time_minutes || null},
              ${b.cook_time_minutes || null}, ${b.kitchen_notes || null})
      RETURNING *
    `;
    for (let n=0; n<(b.components||[]).length; n++) {
      const c=b.components[n];
      await sql`
        INSERT INTO recipe_components
        (recipe_version_id, sort_order, ingredient_id, bulk_recipe_id, quantity, unit, notes)
        VALUES (${version.id}, ${n}, ${c.kind==="ingredient" ? c.id : null},
                ${c.kind==="bulk" ? c.id : null}, ${c.quantity}, ${c.unit}, ${c.notes || null})
      `;
    }
    for (let n=0; n<(b.steps||[]).length; n++) {
      const s=b.steps[n];
      await sql`
        INSERT INTO recipe_steps (recipe_version_id, step_no, instruction, duration_seconds)
        VALUES (${version.id}, ${n+1}, ${s.instruction}, ${s.duration_seconds || null})
      `;
    }
    for (const p of (b.photos||[])) {
      if(!p.public_url) continue;
      await sql`
        INSERT INTO recipe_photos (recipe_version_id, photo_type, storage_key, public_url, caption)
        VALUES (${version.id}, ${p.photo_type}, ${p.storage_key||`inline:${Date.now()}`}, ${p.public_url}, ${p.caption||null})
      `;
    }
    if ((b.recipe_type||"menu") === "menu") {
      for (const p of (b.packaging||[])) {
        if(!p.packaging_item_id || !p.order_type || !(Number(p.quantity)>0)) continue;
        await sql`INSERT INTO recipe_packaging (recipe_id,order_type,packaging_item_id,quantity)
                  VALUES (${recipe.id},${p.order_type},${p.packaging_item_id},${Number(p.quantity)})`;
      }
    }
    await sql`UPDATE recipes SET current_version_id=${version.id}, updated_at=now() WHERE id=${recipe.id}`;
    return NextResponse.json({recipe,version}, {status:201});
  } catch(e) {
    if(recipe?.id){
      try{await sql`DELETE FROM recipes WHERE id=${recipe.id} AND current_version_id IS NULL`}catch{}
    }
    return NextResponse.json({error:e.message}, {status:500});
  }
}
