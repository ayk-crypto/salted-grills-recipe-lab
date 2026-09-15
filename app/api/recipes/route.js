import { NextResponse } from "next/server";
import { db } from "../../db";

function costMeta(b){
  if((b.recipe_type||"menu")!=="menu") return b.kitchen_notes||null;
  return JSON.stringify({
    selling_price:Number(b.selling_price)||0,
    target_food_cost:Number(b.target_food_cost)||35
  });
}

function parseMeta(v){
  try { const x=JSON.parse(v||"{}"); return x&&typeof x==="object"?x:{}; }
  catch { return {}; }
}

async function importMenuRows(sql, rows){
  const results=[];
  for(let index=0; index<rows.length; index++){
    const row=rows[index]||{};
    const name=String(row.name||row.menu_item_name||"").trim();
    if(!name){ results.push({index,status:"skipped",reason:"Blank menu item name"}); continue; }

    const category=String(row.category||"").trim();
    if(category){
      await sql`INSERT INTO categories (name) VALUES (${category}) ON CONFLICT (name) DO UPDATE SET is_active=true,updated_at=now()`;
    }

    const [existing]=await sql`
      SELECT r.id,r.name,r.category,r.current_version_id,rv.kitchen_notes
      FROM recipes r
      LEFT JOIN recipe_versions rv ON rv.id=r.current_version_id
      WHERE r.recipe_type='menu' AND r.is_active=true AND lower(r.name)=lower(${name})
      LIMIT 1
    `;

    if(existing){
      const oldMeta=parseMeta(existing.kitchen_notes);
      const sellingRaw=row.selling_price;
      const targetRaw=row.target_food_cost;
      const selling=(sellingRaw!==""&&sellingRaw!==null&&sellingRaw!==undefined&&Number.isFinite(Number(sellingRaw)))?Number(sellingRaw):Number(oldMeta.selling_price||0);
      const target=(targetRaw!==""&&targetRaw!==null&&targetRaw!==undefined&&Number.isFinite(Number(targetRaw)))?Number(targetRaw):Number(oldMeta.target_food_cost||35);
      const nextMeta=JSON.stringify({selling_price:selling,target_food_cost:target});
      await sql`UPDATE recipes SET name=${name},category=${category||existing.category||null},updated_at=now() WHERE id=${existing.id}`;
      if(existing.current_version_id){
        await sql`UPDATE recipe_versions SET kitchen_notes=${nextMeta} WHERE id=${existing.current_version_id}`;
      }
      results.push({index,status:"updated",id:existing.id,name});
      continue;
    }

    const [recipe]=await sql`
      INSERT INTO recipes (name,recipe_type,category)
      VALUES (${name},'menu',${category||null}) RETURNING *
    `;
    const selling=Number.isFinite(Number(row.selling_price))&&String(row.selling_price).trim()!==""?Number(row.selling_price):0;
    const target=Number.isFinite(Number(row.target_food_cost))&&String(row.target_food_cost).trim()!==""?Number(row.target_food_cost):35;
    const [version]=await sql`
      INSERT INTO recipe_versions (recipe_id,version_no,status,kitchen_notes)
      VALUES (${recipe.id},1,'recorded',${JSON.stringify({selling_price:selling,target_food_cost:target})})
      RETURNING id
    `;
    await sql`UPDATE recipes SET current_version_id=${version.id},updated_at=now() WHERE id=${recipe.id}`;
    results.push({index,status:"created",id:recipe.id,name});
  }
  return {
    created:results.filter(r=>r.status==="created").length,
    updated:results.filter(r=>r.status==="updated").length,
    skipped:results.filter(r=>r.status==="skipped").length,
    results
  };
}

export async function POST(req) {
  const b = await req.json();
  const sql = db();
  let recipe=null;
  try {
    if(Array.isArray(b.rows) && (b.import_type==="menu" || b.type==="menu")){
      const summary=await importMenuRows(sql,b.rows);
      return NextResponse.json(summary,{status:201});
    }

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
