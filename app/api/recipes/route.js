import {randomUUID} from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "../../db";
import {requireTenant,requireRole} from "../../tenant";
import {readJson,list,validationResponse} from "../../lib/validation.mjs";
import {validateRecipePayload} from "../../lib/recipe-validation.mjs";
import {recordAudit} from "../../lib/audit.mjs";
import {requestId,errorResponse} from "../../lib/api-errors.mjs";

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

async function importBulkRows(sql,rows,tid){
  const grouped=new Map();
  for(let index=0;index<rows.length;index++){
    const row=rows[index]||{};
    const name=String(row.recipe_name||row.name||"").trim();
    const groupKey=name.toLowerCase()||("__blank_"+index);
    if(!grouped.has(groupKey))grouped.set(groupKey,{name,yield_quantity:row.yield_quantity,yield_unit:row.yield_unit,rows:[]});
    const g=grouped.get(groupKey);
    if(!g.yield_quantity&&row.yield_quantity)g.yield_quantity=row.yield_quantity;
    if(!g.yield_unit&&row.yield_unit)g.yield_unit=row.yield_unit;
    g.rows.push({...row,_index:index});
  }

  const results=[];
  for(const g of grouped.values()){
    if(!g.name){results.push({status:"skipped",name:"",reason:"Blank recipe name"});continue;}
    const yieldQty=Number(g.yield_quantity),yieldUnit=String(g.yield_unit||"").trim();
    if(!(yieldQty>0)||!yieldUnit){results.push({status:"skipped",name:g.name,reason:"Batch Yield and Yield Unit are required"});continue;}
    if(g.rows.length>500){results.push({status:"skipped",name:g.name,reason:"Recipe has more than 500 component rows"});continue;}

    const components=[];
    const missing=[];
    for(const row of g.rows){
      const componentName=String(row.component_name||row.ingredient_name||"").trim();
      const type=String(row.component_type||"ingredient").trim().toLowerCase();
      const qty=Number(row.quantity),unit=String(row.unit||"").trim();
      if(!componentName){missing.push("row "+(row.source_row||row._index+2)+": component name is blank");continue;}
      if(!(qty>0)||!unit){missing.push(componentName+": quantity and unit are required");continue;}
      if(type==="bulk"){
        const [found]=await sql`SELECT id,name FROM recipes WHERE tenant_id=${tid} AND recipe_type='bulk' AND is_active=true AND lower(name)=lower(${componentName}) LIMIT 1`;
        if(!found){missing.push(componentName+" (bulk recipe not found)");continue;}
        components.push({kind:"bulk",id:found.id,quantity:qty,unit,notes:String(row.notes||"").trim()||null,name:found.name});
      }else if(type==="ingredient"){
        const [found]=await sql`SELECT id,name FROM ingredients WHERE tenant_id=${tid} AND is_active=true AND lower(name)=lower(${componentName}) LIMIT 1`;
        if(!found){missing.push(componentName+" (ingredient not found)");continue;}
        components.push({kind:"ingredient",id:found.id,quantity:qty,unit,notes:String(row.notes||"").trim()||null,name:found.name});
      }else{
        missing.push(componentName+" (Component Type must be ingredient or bulk)");
      }
    }
    if(missing.length){results.push({status:"skipped",name:g.name,reason:missing.slice(0,5).join("; ")+(missing.length>5?"; +"+(missing.length-5)+" more":"")});continue;}
    if(!components.length){results.push({status:"skipped",name:g.name,reason:"No valid components found"});continue;}

    const [existing]=await sql`SELECT id,current_version_id FROM recipes WHERE tenant_id=${tid} AND recipe_type='bulk' AND is_active=true AND lower(name)=lower(${g.name}) LIMIT 1`;
    const recipeId=existing?.id||randomUUID();
    let versionNo=1;
    if(existing){
      const [last]=await sql`SELECT COALESCE(MAX(version_no),0) AS version_no FROM recipe_versions WHERE recipe_id=${recipeId}`;
      versionNo=Number(last?.version_no||0)+1;
    }
    const versionId=randomUUID();
    const queries=[];
    if(existing)queries.push(sql`UPDATE recipes SET name=${g.name},updated_at=NOW() WHERE id=${recipeId} AND tenant_id=${tid}`);
    else queries.push(sql`INSERT INTO recipes (id,tenant_id,name,recipe_type,category) VALUES (${recipeId},${tid},${g.name},'bulk',null)`);
    queries.push(sql`INSERT INTO recipe_versions (id,recipe_id,version_no,status,yield_quantity,yield_unit,prep_time_minutes,cook_time_minutes,kitchen_notes,selling_price,target_food_cost,delivery_commission_pct,payment_fee_pct,other_variable_pct,delivery_fixed_cost) VALUES (${versionId},${recipeId},${versionNo},'recorded',${yieldQty},${yieldUnit},null,null,null,null,35,0,0,0,0)`);
    components.forEach((x,n)=>queries.push(sql`INSERT INTO recipe_components (recipe_version_id,sort_order,ingredient_id,bulk_recipe_id,quantity,unit,notes) VALUES (${versionId},${n},${x.kind==="ingredient"?x.id:null},${x.kind==="bulk"?x.id:null},${x.quantity},${x.unit},${x.notes})`));
    queries.push(sql`UPDATE recipes SET current_version_id=${versionId},updated_at=NOW() WHERE id=${recipeId} AND tenant_id=${tid}`);
    await sql.transaction(queries,{isolationLevel:"Serializable"});
    results.push({status:existing?"updated":"created",id:recipeId,name:g.name,component_count:components.length});
  }
  return{
    created:results.filter(r=>r.status==="created").length,
    updated:results.filter(r=>r.status==="updated").length,
    skipped:results.filter(r=>r.status==="skipped").length,
    results
  };
}

export async function POST(req){
  const rid=requestId(req);try{
    const raw=await readJson(req),sql=db(),tenant=await requireRole(['owner','admin','manager']),tid=tenant.id;
    if(Array.isArray(raw.rows)&&(raw.import_type==="bulk"||raw.type==="bulk")){
      list(raw.rows,{field:"rows",max:5000});
      const result=await importBulkRows(sql,raw.rows,tid);
      await recordAudit(sql,{tenant,action:"import",entityType:"bulk_recipe",entityName:"Bulk recipe import",after:{created:result.created,updated:result.updated,skipped:result.skipped},metadata:{row_count:raw.rows.length},requestId:rid});
      return NextResponse.json(result,{status:201});
    }
    if(Array.isArray(raw.rows)&&(raw.import_type==="menu"||raw.type==="menu")){
      list(raw.rows,{field:"rows",max:2000});
      const result=await importMenuRows(sql,raw.rows,tid);
      await recordAudit(sql,{tenant,action:"import",entityType:"menu",entityName:"Menu import",after:{created:result.created,updated:result.updated,skipped:result.skipped},metadata:{row_count:raw.rows.length},requestId:rid});
      return NextResponse.json(result,{status:201});
    }
    const b=validateRecipePayload(raw),name=b.name;
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
    await recordAudit(sql,{tenant,action:"create",entityType:b.recipe_type==="bulk"?"bulk_recipe":"menu_item",entityId:recipeId,entityName:name,after:{name,recipe_type:b.recipe_type,category:b.category,yield_quantity:b.yield_quantity,yield_unit:b.yield_unit,selling_price:b.selling_price,target_food_cost:b.target_food_cost,component_count:components.length,packaging_count:packaging.length},requestId:rid});
    return NextResponse.json({recipe:{id:recipeId,name,recipe_type:b.recipe_type||"menu",category:b.category||null},version:{id:versionId,version_no:1}},{status:201});
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return errorResponse(e,NextResponse,{requestId:rid,route:"/api/recipes",action:"create",fallback:"Could not save recipe"});}
}
