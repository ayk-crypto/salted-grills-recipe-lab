import { NextResponse } from "next/server";
import { db } from "../../db";

function costMeta(b){
  if((b.recipe_type||"menu")!=="menu") return b.kitchen_notes||null;
  return JSON.stringify({
    selling_price:Number(b.selling_price)||0,
    target_food_cost:Number(b.target_food_cost)||35
  });
}

export async function POST(req) {
  const b = await req.json();
  const sql = db();
  let recipe=null;
  try {
    const name=String(b.name||"").trim();
    if(!name)return NextResponse.json({error:"Name is required"},{status:400});
    [recipe] = await sql`
      INSERT INTO recipes (name, recipe_type, category)
      VALUES (${name}, ${b.recipe_type || "menu"}, ${b.category || null})
      RETURNING *
    `;
    const [version] = await sql`
      INSERT INTO recipe_versions
      (recipe_id, version_no, status, yield_quantity, yield_unit, prep_time_minutes, cook_time_minutes, kitchen_notes)
      VALUES (${recipe.id}, 1, ${b.status || "recorded"}, ${b.yield_quantity || null},
              ${b.yield_unit || null}, null, null, ${costMeta(b)})
      RETURNING *
    `;
    for (let n=0; n<(b.components||[]).length; n++) {
      const c=b.components[n];
      if(!(Number(c.quantity)>0)||!c.id)continue;
      await sql`
        INSERT INTO recipe_components
        (recipe_version_id, sort_order, ingredient_id, bulk_recipe_id, quantity, unit, notes)
        VALUES (${version.id}, ${n}, ${c.kind==="ingredient" ? c.id : null},
                ${c.kind==="bulk" ? c.id : null}, ${Number(c.quantity)}, ${c.unit}, ${c.notes || null})
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
    if(recipe?.id){try{await sql`DELETE FROM recipes WHERE id=${recipe.id} AND current_version_id IS NULL`}catch{}}
    return NextResponse.json({error:e.message}, {status:500});
  }
}
