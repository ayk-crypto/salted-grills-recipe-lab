import { NextResponse } from "next/server";
import { db } from "../../db";
import {requireTenant,requireRole} from "../../tenant";

function cleanIds(v){return [...new Set((Array.isArray(v)?v:[]).map(x=>String(x||"").trim()).filter(Boolean))].slice(0,500)}
function parseMeta(v){try{const x=JSON.parse(v||"{}");return x&&typeof x==="object"?x:{}}catch{return {}}}

export async function PATCH(req){
  try{
    const body=await req.json(),ids=cleanIds(body.ids);
    if(!ids.length)return NextResponse.json({error:"Select at least one menu item"},{status:400});
    const hasCategory=Object.prototype.hasOwnProperty.call(body,"category");
    const hasSelling=Object.prototype.hasOwnProperty.call(body,"selling_price")&&body.selling_price!==""&&body.selling_price!=null;
    const hasTarget=Object.prototype.hasOwnProperty.call(body,"target_food_cost")&&body.target_food_cost!==""&&body.target_food_cost!=null;
    if(!hasCategory&&!hasSelling&&!hasTarget)return NextResponse.json({error:"Choose at least one field to update"},{status:400});
    const category=hasCategory?String(body.category||"").trim():null,selling=hasSelling?Number(body.selling_price):null,target=hasTarget?Number(body.target_food_cost):null;
    if(hasSelling&&(!Number.isFinite(selling)||selling<0))return NextResponse.json({error:"Selling price must be zero or greater"},{status:400});
    if(hasTarget&&(!Number.isFinite(target)||target<=0||target>100))return NextResponse.json({error:"Target food cost must be between 0 and 100"},{status:400});
    const sql=db(),tenant=await requireRole(['owner','admin','manager']),tid=tenant.id;
    if(hasCategory&&category){
      const [cat]=await sql`SELECT id FROM categories WHERE tenant_id=${tid} AND lower(name)=lower(${category}) LIMIT 1`;
      if(cat)await sql`UPDATE categories SET is_active=true,updated_at=now() WHERE id=${cat.id} AND tenant_id=${tid}`;
      else await sql`INSERT INTO categories(tenant_id,name) VALUES(${tid},${category})`;
    }
    let updated=0;
    for(const id of ids){
      const [row]=await sql`SELECT r.id,r.current_version_id,rv.kitchen_notes FROM recipes r LEFT JOIN recipe_versions rv ON rv.id=r.current_version_id WHERE r.id=${id} AND r.tenant_id=${tid} AND r.recipe_type='menu' AND r.is_active=true`;
      if(!row)continue;
      if(hasCategory)await sql`UPDATE recipes SET category=${category||null},updated_at=now() WHERE id=${row.id} AND tenant_id=${tid}`;
      if(row.current_version_id&&(hasSelling||hasTarget)){
        const meta=parseMeta(row.kitchen_notes);if(hasSelling)meta.selling_price=selling;if(hasTarget)meta.target_food_cost=target;
        await sql`UPDATE recipe_versions SET kitchen_notes=${JSON.stringify(meta)} WHERE id=${row.current_version_id}`;
        await sql`UPDATE recipes SET updated_at=now() WHERE id=${row.id} AND tenant_id=${tid}`;
      }
      updated++;
    }
    if(!updated)return NextResponse.json({error:"No active menu items found"},{status:404});
    return NextResponse.json({ok:true,updated});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function DELETE(req){
  try{
    const body=await req.json(),ids=cleanIds(body.ids);
    if(!ids.length)return NextResponse.json({error:"Select at least one menu item"},{status:400});
    const sql=db(),tenant=await requireRole(['owner','admin','manager']),tid=tenant.id,items=[];
    for(const id of ids){
      const [row]=await sql`UPDATE recipes SET is_active=false,updated_at=now() WHERE id=${id} AND tenant_id=${tid} AND recipe_type='menu' AND is_active=true RETURNING id,name`;
      if(row)items.push(row);
    }
    return NextResponse.json({ok:true,deleted:items.length,items});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
