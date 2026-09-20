import {randomUUID} from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "../../db";
import {requireTenant,requireRole} from "../../tenant";

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


async function importMenuRows(sql,rows,tid){
  const results=[];
  for(let index=0;index<rows.length;index++){
    const row=rows[index]||{},name=String(row.name||row.menu_item_name||"").trim();
    if(!name){results.push({index,status:"skipped",reason:"Blank menu item name"});continue;}
    const category=String(row.category||"").trim();
    if(category){
      const [cat]=await sql`SELECT id FROM categories WHERE tenant_id=${tid} AND lower(name)=lower(${category}) LIMIT 1`;
      if(cat)await sql`UPDATE categories SET is_active=true,updated_at=now() WHERE id=${cat.id} AND tenant_id=${tid}`;
      else await sql`INSERT INTO categories (tenant_id,name) VALUES (${tid},${category})`;
    }
    const [existing]=await sql`SELECT r.id,r.name,r.category,r.current_version_id,rv.selling_price,rv.target_food_cost FROM recipes r LEFT JOIN recipe_versions rv ON rv.id=r.current_version_id WHERE r.tenant_id=${tid} AND r.recipe_type='menu' AND r.is_active=true AND lower(r.name)=lower(${name}) LIMIT 1`;
    if(existing){
      const sellingRaw=row.selling_price,targetRaw=row.target_food_cost;
      const selling=(sellingRaw!==""&&sellingRaw!=null&&Number.isFinite(Number(sellingRaw)))?Math.max(0,Number(sellingRaw)):Number(existing.selling_price||0);
      const target=(targetRaw!==""&&targetRaw!=null&&Number.isFinite(Number(targetRaw)))?Math.max(0,Math.min(100,Number(targetRaw))):Number(existing.target_food_cost||35);
      await sql`UPDATE recipes SET name=${name},category=${category||existing.category||null},updated_at=now() WHERE id=${existing.id} AND tenant_id=${tid}`;
      if(existing.current_version_id)await sql`UPDATE recipe_versions SET selling_price=${selling},target_food_cost=${target} WHERE id=${existing.current_version_id}`;
      results.push({index,status:"updated",id:existing.id,name});continue;
    }
    const [recipe]=await sql`INSERT INTO recipes (tenant_id,name,recipe_type,category) VALUES (${tid},${name},'menu',${category||null}) RETURNING *`;
    const selling=Number.isFinite(Number(row.selling_price))&&String(row.selling_price).trim()!==""?Number(row.selling_price):0;
    const target=Number.isFinite(Number(row.target_food_cost))&&String(row.target_food_cost).trim()!==""?Number(row.target_food_cost):35;
    const [version]=await sql`INSERT INTO recipe_versions (recipe_id,version_no,status,selling_price,target_food_cost) VALUES (${recipe.id},1,'recorded',${selling},${target}) RETURNING id`;
    await sql`UPDATE recipes SET current_version_id=${version.id},updated_at=now() WHERE id=${recipe.id} AND tenant_id=${tid}`;
    results.push({index,status:"created",id:recipe.id,name});
  }
  return{created:results.filter(r=>r.status==="created").length,updated:results.filter(r=>r.status==="updated").length,skipped:results.filter(r=>r.status==="skipped").length,results};
}

export async function POST(req){
  const b=await req.json(),sql=db(),tenant=await requireRole(['owner','admin','manager']),tid=tenant.id;
  try{
    if(Array.isArray(b.rows)&&(b.import_type==="menu"||b.type==="menu"))return NextResponse.json(await importMenuRows(sql,b.rows,tid),{status:201});
    const name=String(b.name||"").trim();if(!name)return NextResponse.json({error:"Name is required"},{status:400});
    const [dupe]=await sql`SELECT id FROM recipes WHERE tenant_id=${tid} AND lower(name)=lower(${name}) LIMIT 1`;
    if(dupe)return NextResponse.json({error:"An item with this name already exists"},{status:409});

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

    const recipeId=randomUUID(),versionId=randomUUID();
    const queries=[
      sql`INSERT INTO recipes (id,tenant_id,name,recipe_type,category) VALUES (${recipeId},${tid},${name},${b.recipe_type||"menu"},${b.category||null})`,
      (()=>{const f=menuFinancials(b);return sql`INSERT INTO recipe_versions (id,recipe_id,version_no,status,yield_quantity,yield_unit,prep_time_minutes,cook_time_minutes,kitchen_notes,selling_price,target_food_cost,delivery_commission_pct,payment_fee_pct,other_variable_pct,delivery_fixed_cost) VALUES (${versionId},${recipeId},1,${b.status||"recorded"},${b.yield_quantity||null},${b.yield_unit||null},null,null,${b.recipe_type==="bulk"?(b.kitchen_notes||null):null},${f.sellingPrice},${f.targetFoodCost},${f.deliveryCommissionPct},${f.paymentFeePct},${f.otherVariablePct},${f.deliveryFixedCost})`})()
    ];
    components.forEach((x,n)=>queries.push(sql`INSERT INTO recipe_components (recipe_version_id,sort_order,ingredient_id,bulk_recipe_id,quantity,unit,notes) VALUES (${versionId},${n},${x.kind==="ingredient"?x.id:null},${x.kind==="bulk"?x.id:null},${Number(x.quantity)},${x.unit},${x.notes||null})`));
    packaging.forEach(p=>queries.push(sql`INSERT INTO recipe_packaging (recipe_id,order_type,packaging_item_id,quantity) VALUES (${recipeId},${p.order_type},${p.packaging_item_id},${Number(p.quantity)})`));
    queries.push(sql`UPDATE recipes SET current_version_id=${versionId},updated_at=NOW() WHERE id=${recipeId} AND tenant_id=${tid}`);
    await sql.transaction(queries,{isolationLevel:"Serializable"});
    return NextResponse.json({recipe:{id:recipeId,name,recipe_type:b.recipe_type||"menu",category:b.category||null},version:{id:versionId,version_no:1}},{status:201});
  }catch(e){return NextResponse.json({error:"Could not save recipe"},{status:500});}
}
