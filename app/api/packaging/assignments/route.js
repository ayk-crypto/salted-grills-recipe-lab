import {NextResponse} from "next/server";
import {db} from "../../../db";
import {requireTenant} from "../../../tenant";

export async function GET(){
 try{
  const t=await requireTenant(),sql=db();
  const [categories,recipes]=await Promise.all([
   sql`SELECT cpd.category_id,cpd.packaging_set_id,c.name AS category_name,ps.name AS set_name
       FROM category_packaging_defaults cpd JOIN categories c ON c.id=cpd.category_id JOIN packaging_sets ps ON ps.id=cpd.packaging_set_id
       WHERE cpd.tenant_id=${t.id}`,
   sql`SELECT rpd.recipe_id,rpd.packaging_set_id,r.name AS recipe_name,ps.name AS set_name
       FROM recipe_packaging_defaults rpd JOIN recipes r ON r.id=rpd.recipe_id JOIN packaging_sets ps ON ps.id=rpd.packaging_set_id
       WHERE rpd.tenant_id=${t.id}`
  ]);
  return NextResponse.json({categories,recipes});
 }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
export async function POST(req){
 try{
  const t=await requireTenant(),sql=db(),b=await req.json(),setId=b.packaging_set_id||null,orderType=['default','dine_in','takeaway','delivery'].includes(b.order_type)?b.order_type:'default';
  if(b.category_id){
   if(!setId){await sql`DELETE FROM category_packaging_defaults WHERE tenant_id=${t.id} AND category_id=${b.category_id} AND order_type=${orderType}`;return NextResponse.json({ok:true})}
   await sql`INSERT INTO category_packaging_defaults(tenant_id,category_id,packaging_set_id,order_type) VALUES(${t.id},${b.category_id},${setId},${orderType}) ON CONFLICT(tenant_id,category_id,order_type) DO UPDATE SET packaging_set_id=EXCLUDED.packaging_set_id,updated_at=NOW()`;
   return NextResponse.json({ok:true});
  }
  if(b.recipe_id){
   if(!setId){await sql`DELETE FROM recipe_packaging_defaults WHERE tenant_id=${t.id} AND recipe_id=${b.recipe_id} AND order_type=${orderType}`;return NextResponse.json({ok:true})}
   await sql`INSERT INTO recipe_packaging_defaults(tenant_id,recipe_id,packaging_set_id,order_type) VALUES(${t.id},${b.recipe_id},${setId},${orderType}) ON CONFLICT(tenant_id,recipe_id,order_type) DO UPDATE SET packaging_set_id=EXCLUDED.packaging_set_id,updated_at=NOW()`;
   return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"category_id or recipe_id is required"},{status:400});
 }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
