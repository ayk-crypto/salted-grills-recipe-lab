import { NextResponse } from "next/server";
import { db } from "../../db";
import {requireTenant,requireRole} from "../../tenant";
import {readJson,list,uuid,text,nonnegative,percentage,validationResponse} from "../../lib/validation.mjs";
import {errorResponse,requestId,okJson} from "../../lib/api-errors.mjs";

function cleanIds(v){return [...new Set((Array.isArray(v)?v:[]).map(x=>String(x||"").trim()).filter(Boolean))].slice(0,500)}
function parseMeta(v){try{const x=JSON.parse(v||"{}");return x&&typeof x==="object"?x:{}}catch{return {}}}

export async function PATCH(req){
const rid=requestId(req);try{
    const body=await readJson(req),ids=list(body.ids||[],{field:"ids",max:500}).map(x=>uuid(x,{field:"Menu item id"}));
    if(!ids.length)return NextResponse.json({error:"Select at least one menu item"},{status:400});
    const hasCategory=Object.prototype.hasOwnProperty.call(body,"category");
    const hasSelling=Object.prototype.hasOwnProperty.call(body,"selling_price")&&body.selling_price!==""&&body.selling_price!=null;
    const hasTarget=Object.prototype.hasOwnProperty.call(body,"target_food_cost")&&body.target_food_cost!==""&&body.target_food_cost!=null;
    if(!hasCategory&&!hasSelling&&!hasTarget)return NextResponse.json({error:"Choose at least one field to update"},{status:400});
    const category=hasCategory?text(body.category,{field:"Category",max:120}):null,selling=hasSelling?nonnegative(body.selling_price,{field:"Selling price"}):null,target=hasTarget?percentage(body.target_food_cost,{field:"Target food cost"}):null;
    const sql=db(),tenant=await requireRole(['owner','admin','manager']),tid=tenant.id;
    if(hasCategory&&category){
      const [cat]=await sql`SELECT id FROM categories WHERE tenant_id=${tid} AND lower(name)=lower(${category}) LIMIT 1`;
      if(cat)await sql`UPDATE categories SET is_active=true,updated_at=now() WHERE id=${cat.id} AND tenant_id=${tid}`;
      else await sql`INSERT INTO categories(tenant_id,name) VALUES(${tid},${category})`;
    }
    let updated=0;
    for(const id of ids){
      const [row]=await sql`SELECT r.id,r.current_version_id FROM recipes r WHERE r.id=${id} AND r.tenant_id=${tid} AND r.recipe_type='menu' AND r.is_active=true`;
      if(!row)continue;
      if(hasCategory)await sql`UPDATE recipes SET category=${category||null},updated_at=now() WHERE id=${row.id} AND tenant_id=${tid}`;
      if(row.current_version_id&&(hasSelling||hasTarget)){
        await sql`UPDATE recipe_versions SET selling_price=CASE WHEN ${hasSelling} THEN ${selling} ELSE selling_price END,target_food_cost=CASE WHEN ${hasTarget} THEN ${target} ELSE target_food_cost END WHERE id=${row.current_version_id}`;
        await sql`UPDATE recipes SET updated_at=now() WHERE id=${row.id} AND tenant_id=${tid}`;
      }
      updated++;
    }
    if(!updated)return NextResponse.json({error:"No active menu items found"},{status:404});
    return okJson(NextResponse,{ok:true,updated},{requestId:rid});
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return errorResponse(e,NextResponse,{requestId:rid,route:"/api/menu-bulk",action:"bulk_update",fallback:"Could not update menu items"})}
}

export async function DELETE(req){
  const rid=requestId(req);try{
    const body=await readJson(req),ids=list(body.ids||[],{field:"ids",max:500}).map(x=>uuid(x,{field:"Menu item id"}));
    if(!ids.length)return NextResponse.json({error:"Select at least one menu item"},{status:400});
    const sql=db(),tenant=await requireRole(['owner','admin','manager']),tid=tenant.id,items=[];
    for(const id of ids){
      const [row]=await sql`UPDATE recipes SET is_active=false,updated_at=now() WHERE id=${id} AND tenant_id=${tid} AND recipe_type='menu' AND is_active=true RETURNING id,name`;
      if(row)items.push(row);
    }
    return okJson(NextResponse,{ok:true,deleted:items.length,items},{requestId:rid});
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return errorResponse(e,NextResponse,{requestId:rid,route:"/api/menu-bulk",action:"bulk_delete",fallback:"Could not delete menu items"})}
}
