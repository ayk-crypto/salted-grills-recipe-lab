import { NextResponse } from "next/server";
import { db } from "../../db";

function cleanIds(v){return [...new Set((Array.isArray(v)?v:[]).map(x=>String(x||"").trim()).filter(Boolean))].slice(0,500)}
function parseMeta(v){try{const x=JSON.parse(v||"{}");return x&&typeof x==="object"?x:{}}catch{return {}}}

export async function PATCH(req){
  try{
    const body=await req.json();
    const ids=cleanIds(body.ids);
    if(!ids.length)return NextResponse.json({error:"Select at least one menu item"},{status:400});
    const hasCategory=Object.prototype.hasOwnProperty.call(body,"category");
    const hasSelling=Object.prototype.hasOwnProperty.call(body,"selling_price") && body.selling_price!=="" && body.selling_price!=null;
    const hasTarget=Object.prototype.hasOwnProperty.call(body,"target_food_cost") && body.target_food_cost!=="" && body.target_food_cost!=null;
    if(!hasCategory&&!hasSelling&&!hasTarget)return NextResponse.json({error:"Choose at least one field to update"},{status:400});
    const category=hasCategory?String(body.category||"").trim():null;
    const selling=hasSelling?Number(body.selling_price):null;
    const target=hasTarget?Number(body.target_food_cost):null;
    if(hasSelling&&(!Number.isFinite(selling)||selling<0))return NextResponse.json({error:"Selling price must be zero or greater"},{status:400});
    if(hasTarget&&(!Number.isFinite(target)||target<=0||target>100))return NextResponse.json({error:"Target food cost must be between 0 and 100"},{status:400});
    const sql=db();
    if(hasCategory&&category){
      await sql`INSERT INTO categories(name) VALUES(${category}) ON CONFLICT(name) DO UPDATE SET is_active=true,updated_at=now()`;
    }
    let updated=0;
    for(const id of ids){
      const [row]=await sql`
        SELECT r.id,r.current_version_id,rv.kitchen_notes
        FROM recipes r
        LEFT JOIN recipe_versions rv ON rv.id=r.current_version_id
        WHERE r.id=${id} AND r.recipe_type='menu' AND r.is_active=true
      `;
      if(!row)continue;
      if(hasCategory)await sql`UPDATE recipes SET category=${category||null},updated_at=now() WHERE id=${row.id}`;
      if(row.current_version_id&&(hasSelling||hasTarget)){
        const meta=parseMeta(row.kitchen_notes);
        if(hasSelling)meta.selling_price=selling;
        if(hasTarget)meta.target_food_cost=target;
        await sql`UPDATE recipe_versions SET kitchen_notes=${JSON.stringify(meta)} WHERE id=${row.current_version_id}`;
        await sql`UPDATE recipes SET updated_at=now() WHERE id=${row.id}`;
      }
      updated++;
    }
    if(!updated)return NextResponse.json({error:"No active menu items found"},{status:404});
    return NextResponse.json({ok:true,updated});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function DELETE(req){
  try{
    const body=await req.json();
    const ids=cleanIds(body.ids);
    if(!ids.length)return NextResponse.json({error:"Select at least one menu item"},{status:400});
    const sql=db();
    const items=[];
    for(const id of ids){
      const [row]=await sql`
        UPDATE recipes SET is_active=false,updated_at=now()
        WHERE id=${id} AND recipe_type='menu' AND is_active=true
        RETURNING id,name
      `;
      if(row)items.push(row);
    }
    return NextResponse.json({ok:true,deleted:items.length,items});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
