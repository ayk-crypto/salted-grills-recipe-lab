import {randomUUID} from "node:crypto";
import { NextResponse } from "next/server";
import { db, getRecipe } from "../../../db";
import {requireTenant,requireRole} from "../../../tenant";
import {readJson,uuid,validationResponse} from "../../../lib/validation.mjs";
import {validateRecipePayload} from "../../../lib/recipe-validation.mjs";

function menuFinancials(b){
  if((b.recipe_type||"menu")!=="menu")return{sellingPrice:null,targetFoodCost:35,deliveryCommissionPct:0,paymentFeePct:0,otherVariablePct:0,deliveryFixedCost:0};
  const bounded=(v,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):fallback};
  const money=(v,fallback=0)=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:fallback};
  return{
    sellingPrice:money(b.selling_price,0),
    targetFoodCost:bounded(b.target_food_cost,35),
    deliveryCommissionPct:bounded(b.delivery_commission_pct,0),
    paymentFeePct:bounded(b.payment_fee_pct,0),
    otherVariablePct:bounded(b.other_variable_pct,0),
    deliveryFixedCost:money(b.delivery_fixed_cost,0)
  };
}


export async function GET(req,{params}){
  try{
    const raw=await params,id=uuid(raw.id,{field:"Recipe id"}),tenant=await requireTenant();
    const row=await getRecipe(id,tenant.id);
    if(!row||row.is_active===false)return NextResponse.json({error:"Not found"},{status:404});
    return NextResponse.json(row);
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function DELETE(req,{params}){
  try{
    const raw=await params,id=uuid(raw.id,{field:"Recipe id"}),sql=db(),tenant=await requireRole(["owner","admin","manager"]),tid=tenant.id;
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
  const {id}=await params,b=await req.json(),sql=db(),tenant=await requireRole(["owner","admin","manager"]),tid=tenant.id;
  try{
    const [recipeState]=await sql`SELECT is_active FROM recipes WHERE id=${id} AND tenant_id=${tid}`;
    if(!recipeState||!recipeState.is_active)return NextResponse.json({error:"Item not found"},{status:404});
    const name=b.name;
    const [dupe]=await sql`SELECT id FROM recipes WHERE tenant_id=${tid} AND lower(name)=lower(${name}) AND id<>${id} LIMIT 1`;
    if(dupe)return NextResponse.json({error:"An item with this name already exists"},{status:409});
    const [current]=await sql`SELECT COALESCE(MAX(version_no),0)::int AS max_version FROM recipe_versions WHERE recipe_id=${id}`;
    const nextVersion=(current?.max_version||0)+1,versionId=randomUUID();

    const components=(b.components||[]).filter(x=>x?.id&&Number(x.quantity)>0);
    for(const x of components){
      if(x.kind==="ingredient"){
        const [owned]=await sql`SELECT id FROM ingredients WHERE id=${x.id} AND tenant_id=${tid} AND is_active=TRUE`;if(!owned)return NextResponse.json({error:"Ingredient does not belong to this workspace"},{status:400});
      }else{
        const [owned]=await sql`SELECT id FROM recipes WHERE id=${x.id} AND tenant_id=${tid} AND recipe_type='bulk' AND is_active=TRUE`;if(!owned)return NextResponse.json({error:"Prepared component does not belong to this workspace"},{status:400});
      }
    }
    const packaging=(b.recipe_type||"menu")==="menu"?(b.packaging||[]).filter(x=>x?.packaging_item_id&&x?.order_type&&Number(x.quantity)>0):[];
    for(const p of packaging){
      const [owned]=await sql`SELECT id FROM packaging_items WHERE id=${p.packaging_item_id} AND tenant_id=${tid} AND is_active=TRUE`;
      if(!owned)return NextResponse.json({error:"Packaging item does not belong to this workspace"},{status:400});
    }

    const queries=[
      (()=>{const f=menuFinancials(b);return sql`INSERT INTO recipe_versions (id,recipe_id,version_no,status,yield_quantity,yield_unit,prep_time_minutes,cook_time_minutes,kitchen_notes,selling_price,target_food_cost,delivery_commission_pct,payment_fee_pct,other_variable_pct,delivery_fixed_cost) VALUES (${versionId},${id},${nextVersion},${b.status||"recorded"},${b.yield_quantity||null},${b.yield_unit||null},null,null,${b.recipe_type==="bulk"?(b.kitchen_notes||null):null},${f.sellingPrice},${f.targetFoodCost},${f.deliveryCommissionPct},${f.paymentFeePct},${f.otherVariablePct},${f.deliveryFixedCost})`})()
    ];
    components.forEach((x,n)=>queries.push(sql`INSERT INTO recipe_components (recipe_version_id,sort_order,ingredient_id,bulk_recipe_id,quantity,unit,notes) VALUES (${versionId},${n},${x.kind==="ingredient"?x.id:null},${x.kind==="bulk"?x.id:null},${Number(x.quantity)},${x.unit},${x.notes||null})`));
    queries.push(sql`DELETE FROM recipe_packaging WHERE recipe_id=${id}`);
    packaging.forEach(p=>queries.push(sql`INSERT INTO recipe_packaging (recipe_id,order_type,packaging_item_id,quantity) VALUES (${id},${p.order_type},${p.packaging_item_id},${Number(p.quantity)})`));
    queries.push(sql`UPDATE recipes SET name=${name},recipe_type=${b.recipe_type||"menu"},category=${b.category||null},current_version_id=${versionId},updated_at=NOW() WHERE id=${id} AND tenant_id=${tid}`);
    await sql.transaction(queries,{isolationLevel:"Serializable"});
    return NextResponse.json({version:{id:versionId,version_no:nextVersion}});
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Could not update recipe"},{status:500});}
}
