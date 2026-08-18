import { NextResponse } from "next/server";
import { db, getRecipe } from "../../../db";

export async function GET(req, {params}) {
  try { const {id}=await params; const row=await getRecipe(id); if(!row || row.is_active===false) return NextResponse.json({error:"Not found"},{status:404}); return NextResponse.json(row); }
  catch(e){ return NextResponse.json({error:e.message},{status:500}); }
}

export async function PATCH(req,{params}){
  const {id}=await params,b=await req.json(),sql=db();
  try{ if(typeof b.is_locked!=="boolean") return NextResponse.json({error:"Invalid lock state"},{status:400}); const rows=await sql`UPDATE recipes SET is_locked=${b.is_locked}, locked_at=${b.is_locked?new Date():null}, updated_at=now() WHERE id=${id} AND is_active=true RETURNING id,name,is_locked,locked_at`; if(!rows.length)return NextResponse.json({error:"Recipe not found"},{status:404}); return NextResponse.json(rows[0]); }
  catch(e){return NextResponse.json({error:e.message},{status:500});}
}

export async function DELETE(req,{params}){
  const {id}=await params,sql=db();
  try{
    const [recipe]=await sql`SELECT id,name,recipe_type FROM recipes WHERE id=${id} AND is_active=true`;
    if(!recipe)return NextResponse.json({error:"Item not found"},{status:404});

    if(recipe.recipe_type==="bulk"){
      const usage=await sql`
        SELECT DISTINCT r.id,r.name,r.recipe_type
        FROM recipes r
        JOIN recipe_versions rv ON rv.id=r.current_version_id
        JOIN recipe_components rc ON rc.recipe_version_id=rv.id
        WHERE r.is_active=true AND rc.bulk_recipe_id=${id}
        ORDER BY r.name
      `;
      if(usage.length){
        return NextResponse.json({
          error:`${recipe.name} is still used in ${usage.length} active item${usage.length===1?'':'s'}. Remove it from those items first.`,
          used_in:usage
        },{status:409});
      }
    }

    const [deleted]=await sql`
      UPDATE recipes SET is_active=false, updated_at=now()
      WHERE id=${id} AND is_active=true
      RETURNING id,name,recipe_type
    `;
    return NextResponse.json({ok:true,item:deleted});
  }
  catch(e){return NextResponse.json({error:e.message},{status:500});}
}

export async function PUT(req,{params}){
  const {id}=await params,b=await req.json(),sql=db();
  let version=null;
  try{
    const [recipeState]=await sql`SELECT is_active,is_locked FROM recipes WHERE id=${id}`;
    if(!recipeState||!recipeState.is_active)return NextResponse.json({error:"Recipe not found"},{status:404});
    if(recipeState.is_locked)return NextResponse.json({error:"This recipe is locked. Unlock it before editing."},{status:423});
    const [current]=await sql`SELECT COALESCE(MAX(version_no),0)::int AS max_version FROM recipe_versions WHERE recipe_id=${id}`;
    const nextVersion=(current?.max_version||0)+1;
    [version]=await sql`INSERT INTO recipe_versions (recipe_id,version_no,status,yield_quantity,yield_unit,prep_time_minutes,cook_time_minutes,kitchen_notes) VALUES (${id},${nextVersion},${b.status||"draft"},${b.yield_quantity||null},${b.yield_unit||null},${b.prep_time_minutes||null},${b.cook_time_minutes||null},${b.kitchen_notes||null}) RETURNING *`;
    for(let n=0;n<(b.components||[]).length;n++){const c=b.components[n];await sql`INSERT INTO recipe_components (recipe_version_id,sort_order,ingredient_id,bulk_recipe_id,quantity,unit,notes) VALUES (${version.id},${n},${c.kind==="ingredient"?c.id:null},${c.kind==="bulk"?c.id:null},${c.quantity},${c.unit},${c.notes||null})`;}
    for(let n=0;n<(b.steps||[]).length;n++){const s=b.steps[n];await sql`INSERT INTO recipe_steps (recipe_version_id,step_no,instruction,duration_seconds) VALUES (${version.id},${n+1},${s.instruction},${s.duration_seconds||null})`;}
    for(const p of (b.photos||[])){if(!p.public_url)continue;await sql`INSERT INTO recipe_photos (recipe_version_id,photo_type,storage_key,public_url,caption) VALUES (${version.id},${p.photo_type},${p.storage_key||`inline:${Date.now()}`},${p.public_url},${p.caption||null})`;}
    await sql`DELETE FROM recipe_packaging WHERE recipe_id=${id}`;
    if((b.recipe_type||"menu")==="menu"){for(const p of(b.packaging||[])){if(!p.packaging_item_id||!p.order_type||!(Number(p.quantity)>0))continue;await sql`INSERT INTO recipe_packaging (recipe_id,order_type,packaging_item_id,quantity) VALUES (${id},${p.order_type},${p.packaging_item_id},${Number(p.quantity)})`;}}
    await sql`UPDATE recipes SET name=${String(b.name||"").trim()},recipe_type=${b.recipe_type||"menu"},category=${b.category||null},current_version_id=${version.id},updated_at=now() WHERE id=${id}`;
    return NextResponse.json({version});
  }catch(e){
    if(version?.id){try{await sql`DELETE FROM recipe_versions WHERE id=${version.id} AND NOT EXISTS (SELECT 1 FROM recipes WHERE current_version_id=${version.id})`}catch{}}
    return NextResponse.json({error:e.message},{status:500});
  }
}
