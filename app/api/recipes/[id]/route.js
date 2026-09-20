import { NextResponse } from "next/server";
import { db, getRecipe } from "../../../db";
import {requireTenant,requireRole} from "../../../tenant";

function costMeta(b){
  if((b.recipe_type||"menu")!=="menu") return b.kitchen_notes||null;
  return JSON.stringify({selling_price:Number(b.selling_price)||0,target_food_cost:Number(b.target_food_cost)||35,delivery_commission_pct:Number(b.delivery_commission_pct)||0,payment_fee_pct:Number(b.payment_fee_pct)||0,other_variable_pct:Number(b.other_variable_pct)||0,delivery_fixed_cost:Number(b.delivery_fixed_cost)||0});
}

export async function GET(req,{params}){
  try{
    const {id}=await params,tenant=await requireTenant();
    const row=await getRecipe(id,tenant.id);
    if(!row||row.is_active===false)return NextResponse.json({error:"Not found"},{status:404});
    return NextResponse.json(row);
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function DELETE(req,{params}){
  const {id}=await params,sql=db(),tenant=await requireRole(["owner","admin","manager"]),tid=tenant.id;
  try{
    const [recipe]=await sql`SELECT id,name,recipe_type FROM recipes WHERE id=${id} AND tenant_id=${tid} AND is_active=true`;
    if(!recipe)return NextResponse.json({error:"Item not found"},{status:404});
    if(recipe.recipe_type==="bulk"){
      const usage=await sql`
        SELECT DISTINCT r.id,r.name,r.recipe_type FROM recipes r
        JOIN recipe_versions rv ON rv.id=r.current_version_id
        JOIN recipe_components rc ON rc.recipe_version_id=rv.id
        WHERE r.tenant_id=${tid} AND r.is_active=true AND rc.bulk_recipe_id=${id} ORDER BY r.name
      `;
      if(usage.length)return NextResponse.json({error:`${recipe.name} is still used in ${usage.length} active item${usage.length===1?'':'s'}. Remove it from those items first.`,used_in:usage},{status:409});
    }
    const [deleted]=await sql`UPDATE recipes SET is_active=false,updated_at=now() WHERE id=${id} AND tenant_id=${tid} AND is_active=true RETURNING id,name,recipe_type`;
    return NextResponse.json({ok:true,item:deleted});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function PUT(req,{params}){
  const {id}=await params,b=await req.json(),sql=db(),tenant=await requireRole(["owner","admin","manager"]),tid=tenant.id;let version=null;
  try{
    const [recipeState]=await sql`SELECT is_active FROM recipes WHERE id=${id} AND tenant_id=${tid}`;
    if(!recipeState||!recipeState.is_active)return NextResponse.json({error:"Item not found"},{status:404});
    const name=String(b.name||"").trim();if(!name)return NextResponse.json({error:"Name is required"},{status:400});
    const [dupe]=await sql`SELECT id FROM recipes WHERE tenant_id=${tid} AND lower(name)=lower(${name}) AND id<>${id} LIMIT 1`;
    if(dupe)return NextResponse.json({error:"An item with this name already exists"},{status:409});
    const [current]=await sql`SELECT COALESCE(MAX(version_no),0)::int AS max_version FROM recipe_versions WHERE recipe_id=${id}`;
    const nextVersion=(current?.max_version||0)+1;
    [version]=await sql`INSERT INTO recipe_versions (recipe_id,version_no,status,yield_quantity,yield_unit,prep_time_minutes,cook_time_minutes,kitchen_notes) VALUES (${id},${nextVersion},${b.status||"recorded"},${b.yield_quantity||null},${b.yield_unit||null},null,null,${costMeta(b)}) RETURNING *`;
    for(let n=0;n<(b.components||[]).length;n++){
      const c=b.components[n];if(!(Number(c.quantity)>0)||!c.id)continue;
      if(c.kind==="ingredient"){
        const [owned]=await sql`SELECT id FROM ingredients WHERE id=${c.id} AND tenant_id=${tid} AND is_active=true`;if(!owned)throw new Error("Ingredient does not belong to this tenant");
      }else{
        const [owned]=await sql`SELECT id FROM recipes WHERE id=${c.id} AND tenant_id=${tid} AND recipe_type='bulk' AND is_active=true`;if(!owned)throw new Error("Bulk recipe does not belong to this tenant");
      }
      await sql`INSERT INTO recipe_components (recipe_version_id,sort_order,ingredient_id,bulk_recipe_id,quantity,unit,notes) VALUES (${version.id},${n},${c.kind==="ingredient"?c.id:null},${c.kind==="bulk"?c.id:null},${Number(c.quantity)},${c.unit},${c.notes||null})`;
    }
    await sql`DELETE FROM recipe_packaging WHERE recipe_id=${id}`;
    if((b.recipe_type||"menu")==="menu")for(const p of(b.packaging||[])){if(!p.packaging_item_id||!p.order_type||!(Number(p.quantity)>0))continue;const [ownedPackage]=await sql`SELECT id FROM packaging_items WHERE id=${p.packaging_item_id} AND tenant_id=${tid} AND is_active=TRUE`;if(!ownedPackage)throw new Error("Packaging item does not belong to this tenant");await sql`INSERT INTO recipe_packaging (recipe_id,order_type,packaging_item_id,quantity) VALUES (${id},${p.order_type},${p.packaging_item_id},${Number(p.quantity)})`;}
    await sql`UPDATE recipes SET name=${name},recipe_type=${b.recipe_type||"menu"},category=${b.category||null},current_version_id=${version.id},updated_at=now() WHERE id=${id} AND tenant_id=${tid}`;
    return NextResponse.json({version});
  }catch(e){
    if(version?.id){try{await sql`DELETE FROM recipe_versions WHERE id=${version.id} AND NOT EXISTS (SELECT 1 FROM recipes WHERE current_version_id=${version.id})`}catch{}}
    return NextResponse.json({error:e.message},{status:500});
  }
}
