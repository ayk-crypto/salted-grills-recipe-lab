import {NextResponse} from "next/server";
import {db} from "../../../db";
import {requireTenant,requireRole} from "../../../tenant";
import {readJson,uuid,oneOf,validationResponse} from "../../../lib/validation.mjs";

export async function GET(){
 try{
  const t=await requireTenant(),sql=db();
  const [categories,recipes]=await Promise.all([
   sql`SELECT cpd.category_id,cpd.packaging_set_id,cpd.order_type,c.name AS category_name,ps.name AS set_name
       FROM category_packaging_defaults cpd JOIN categories c ON c.id=cpd.category_id JOIN packaging_sets ps ON ps.id=cpd.packaging_set_id
       WHERE cpd.tenant_id=${t.id}`,
   sql`SELECT rpd.recipe_id,rpd.packaging_set_id,rpd.order_type,r.name AS recipe_name,ps.name AS set_name
       FROM recipe_packaging_defaults rpd JOIN recipes r ON r.id=rpd.recipe_id JOIN packaging_sets ps ON ps.id=rpd.packaging_set_id
       WHERE rpd.tenant_id=${t.id}`
  ]);
  return NextResponse.json({categories,recipes});
 }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Packaging assignment request failed"},{status:500})}
}
export async function POST(req){
 try{
  const t=await requireRole(['owner','admin','manager']),sql=db(),b=await readJson(req),setId=b.packaging_set_id?uuid(b.packaging_set_id,{field:"Packaging set id"}):null,orderType=oneOf(b.order_type||"default",["default","dine_in","takeaway","delivery"],{field:"Order type"});
  if(setId){const [ownedSet]=await sql`SELECT id FROM packaging_sets WHERE id=${setId} AND tenant_id=${t.id} AND is_active=TRUE`;if(!ownedSet)return NextResponse.json({error:"Packaging set not found in this workspace"},{status:404});}
  if(b.category_id){
   const categoryId=uuid(b.category_id,{field:"Category id"});
   const [ownedCategory]=await sql`SELECT id FROM categories WHERE id=${categoryId} AND tenant_id=${t.id} AND is_active=TRUE`;if(!ownedCategory)return NextResponse.json({error:"Category not found in this workspace"},{status:404});
   if(!setId){await sql`DELETE FROM category_packaging_defaults WHERE tenant_id=${t.id} AND category_id=${categoryId} AND order_type=${orderType}`;return NextResponse.json({ok:true})}
   await sql`INSERT INTO category_packaging_defaults(tenant_id,category_id,packaging_set_id,order_type) VALUES(${t.id},${categoryId},${setId},${orderType}) ON CONFLICT(tenant_id,category_id,order_type) DO UPDATE SET packaging_set_id=EXCLUDED.packaging_set_id,updated_at=NOW()`;
   return NextResponse.json({ok:true});
  }
  if(b.recipe_id){
   const recipeId=uuid(b.recipe_id,{field:"Recipe id"});
   const [ownedRecipe]=await sql`SELECT id FROM recipes WHERE id=${recipeId} AND tenant_id=${t.id} AND is_active=TRUE`;if(!ownedRecipe)return NextResponse.json({error:"Menu item not found in this workspace"},{status:404});
   if(!setId){await sql`DELETE FROM recipe_packaging_defaults WHERE tenant_id=${t.id} AND recipe_id=${recipeId} AND order_type=${orderType}`;return NextResponse.json({ok:true})}
   await sql`INSERT INTO recipe_packaging_defaults(tenant_id,recipe_id,packaging_set_id,order_type) VALUES(${t.id},${recipeId},${setId},${orderType}) ON CONFLICT(tenant_id,recipe_id,order_type) DO UPDATE SET packaging_set_id=EXCLUDED.packaging_set_id,updated_at=NOW()`;
   return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"category_id or recipe_id is required"},{status:400});
 }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Packaging assignment request failed"},{status:500})}
}
