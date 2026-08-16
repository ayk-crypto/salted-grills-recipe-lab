import { NextResponse } from "next/server";
import { db, getRecipe } from "../../../db";

export async function GET(req, {params}) {
  try {
    const {id}=await params;
    const row=await getRecipe(id);
    if(!row) return NextResponse.json({error:"Not found"}, {status:404});
    return NextResponse.json(row);
  } catch(e) {
    return NextResponse.json({error:e.message}, {status:500});
  }
}

export async function PUT(req, {params}) {
  const {id}=await params;
  const b=await req.json();
  const sql=db();
  try {
    const result=await sql.transaction(async tx=>{
      const [current]=await tx`SELECT COALESCE(MAX(version_no),0)::int AS max_version FROM recipe_versions WHERE recipe_id=${id}`;
      const nextVersion=(current?.max_version||0)+1;
      const [version]=await tx`
        INSERT INTO recipe_versions
        (recipe_id, version_no, status, yield_quantity, yield_unit, prep_time_minutes, cook_time_minutes, kitchen_notes)
        VALUES (${id}, ${nextVersion}, ${b.status||"draft"}, ${b.yield_quantity||null}, ${b.yield_unit||null},
                ${b.prep_time_minutes||null}, ${b.cook_time_minutes||null}, ${b.kitchen_notes||null})
        RETURNING *
      `;
      for(let n=0;n<(b.components||[]).length;n++){
        const c=b.components[n];
        await tx`
          INSERT INTO recipe_components
          (recipe_version_id, sort_order, ingredient_id, bulk_recipe_id, quantity, unit, notes)
          VALUES (${version.id},${n},${c.kind==="ingredient"?c.id:null},${c.kind==="bulk"?c.id:null},${c.quantity},${c.unit},${c.notes||null})
        `;
      }
      for(let n=0;n<(b.steps||[]).length;n++){
        const s=b.steps[n];
        await tx`INSERT INTO recipe_steps (recipe_version_id,step_no,instruction,duration_seconds)
                 VALUES (${version.id},${n+1},${s.instruction},${s.duration_seconds||null})`;
      }
      for(const p of (b.photos||[])){
        if(!p.public_url) continue;
        await tx`INSERT INTO recipe_photos (recipe_version_id,photo_type,storage_key,public_url,caption)
                 VALUES (${version.id},${p.photo_type},${p.storage_key||`inline:${Date.now()}`},${p.public_url},${p.caption||null})`;
      }
      await tx`DELETE FROM recipe_packaging WHERE recipe_id=${id}`;
      if ((b.recipe_type||"menu") === "menu") {
        for (const p of (b.packaging||[])) {
          if(!p.packaging_item_id || !p.order_type || !(Number(p.quantity)>0)) continue;
          await tx`INSERT INTO recipe_packaging (recipe_id,order_type,packaging_item_id,quantity)
                   VALUES (${id},${p.order_type},${p.packaging_item_id},${Number(p.quantity)})`;
        }
      }
      await tx`UPDATE recipes SET name=${String(b.name||"").trim()}, recipe_type=${b.recipe_type||"menu"}, category=${b.category||null}, current_version_id=${version.id}, updated_at=now() WHERE id=${id}`;
      return {version};
    });
    return NextResponse.json(result);
  } catch(e){return NextResponse.json({error:e.message},{status:500});}
}
