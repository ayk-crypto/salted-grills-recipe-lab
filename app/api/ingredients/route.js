import { NextResponse } from "next/server";
import { db } from "../../db";
import { requireTenant } from "../../tenant";

const clean=v=>String(v||"").trim();
const norm=v=>clean(v).toLowerCase();

export async function POST(req){
  try{
    const body=await req.json(),sql=db(),tenant=await requireTenant(),tid=tenant.id;
    if(Array.isArray(body.rows)){
      const existing=await sql`SELECT id,name FROM ingredients WHERE tenant_id=${tid} ORDER BY name`;
      const byName=new Map(existing.map(i=>[norm(i.name),i])),results=[];
      for(let index=0;index<body.rows.length;index++){
        const r=body.rows[index]||{},name=clean(r.name||r.ingredient_name||r["Ingredient Name"]);
        if(!name){results.push({index,status:"error",error:"Ingredient name is required"});continue;}
        const defaultUnit=clean(r.default_unit||r["Default Unit"]||"g")||"g";
        const ingredientType=clean(r.ingredient_type||r.type||r["Type"]||"raw")||"raw";
        const ingredientCategory=clean(r.ingredient_category||r.category||r["Category"])||null;
        const notes=clean(r.notes||r["Notes"])||null,found=byName.get(norm(name));
        if(found){
          const [updated]=await sql`UPDATE ingredients SET name=${name},default_unit=${defaultUnit},ingredient_type=${ingredientType},ingredient_category=${ingredientCategory},notes=${notes},is_active=true,updated_at=now() WHERE id=${found.id} AND tenant_id=${tid} RETURNING id,name,default_unit,ingredient_type,ingredient_category`;
          results.push({index,status:"updated",...updated});
        }else{
          const [created]=await sql`INSERT INTO ingredients (tenant_id,name,default_unit,ingredient_type,ingredient_category,notes) VALUES (${tid},${name},${defaultUnit},${ingredientType},${ingredientCategory},${notes}) RETURNING id,name,default_unit,ingredient_type,ingredient_category`;
          byName.set(norm(name),created);results.push({index,status:"created",...created});
        }
      }
      return NextResponse.json({created:results.filter(x=>x.status==="created").length,updated:results.filter(x=>x.status==="updated").length,errors:results.filter(x=>x.status==="error").length,results},{status:201});
    }
    const name=clean(body.name);if(!name)return NextResponse.json({error:"Name is required"},{status:400});
    const [dupe]=await sql`SELECT id FROM ingredients WHERE tenant_id=${tid} AND lower(name)=lower(${name}) LIMIT 1`;
    if(dupe)return NextResponse.json({error:"An ingredient with this name already exists"},{status:409});
    const [row]=await sql`INSERT INTO ingredients (tenant_id,name,default_unit,ingredient_type,ingredient_category,notes) VALUES (${tid},${name},${body.default_unit||"g"},${body.ingredient_type||"raw"},${clean(body.ingredient_category)||null},${body.notes||null}) RETURNING *`;
    return NextResponse.json(row,{status:201});
  }catch(e){return NextResponse.json({error:e.message},{status:500});}
}

export async function PATCH(req){
  try{
    const body=await req.json();if(!body.id)return NextResponse.json({error:"Ingredient id is required"},{status:400});
    const name=clean(body.name);if(!name)return NextResponse.json({error:"Name is required"},{status:400});
    const sql=db(),tenant=await requireTenant(),tid=tenant.id;
    const [dupe]=await sql`SELECT id FROM ingredients WHERE tenant_id=${tid} AND lower(name)=lower(${name}) AND id<>${body.id} LIMIT 1`;
    if(dupe)return NextResponse.json({error:"An ingredient with this name already exists"},{status:409});
    const [row]=await sql`UPDATE ingredients SET name=${name},default_unit=${body.default_unit||"g"},ingredient_type=${body.ingredient_type||"raw"},ingredient_category=${clean(body.ingredient_category)||null},notes=${body.notes||null},updated_at=now() WHERE id=${body.id} AND tenant_id=${tid} AND is_active=true RETURNING *`;
    if(!row)return NextResponse.json({error:"Ingredient not found"},{status:404});
    return NextResponse.json(row);
  }catch(e){return NextResponse.json({error:e.message},{status:500});}
}

export async function DELETE(req){
  try{
    const body=await req.json(),sql=db(),tenant=await requireTenant(),tid=tenant.id;
    const requested=Array.isArray(body.ids)?body.ids.map(String).filter(Boolean):body.id?[String(body.id)]:[];
    if(!requested.length&&body.name){
      const [named]=await sql`SELECT id FROM ingredients WHERE tenant_id=${tid} AND lower(name)=lower(${clean(body.name)}) LIMIT 1`;
      if(named)requested.push(String(named.id));
    }
    if(!requested.length)return NextResponse.json({error:"Select at least one ingredient"},{status:400});
    const items=await sql`SELECT id,name FROM ingredients WHERE tenant_id=${tid} AND id = ANY(${requested}::uuid[]) AND is_active=TRUE ORDER BY name`;
    if(!items.length)return NextResponse.json({error:"No active ingredients found"},{status:404});
    const deleted=[],blocked=[];
    for(const item of items){
      const usage=await sql`
        SELECT DISTINCT r.id,r.name,r.recipe_type
        FROM recipes r
        JOIN recipe_versions rv ON rv.id=r.current_version_id
        JOIN recipe_components rc ON rc.recipe_version_id=rv.id
        WHERE r.tenant_id=${tid} AND r.is_active=TRUE AND rc.ingredient_id=${item.id}
        ORDER BY r.name`;
      if(usage.length){blocked.push({id:item.id,name:item.name,used_in:usage});continue}
      await sql`UPDATE ingredient_source_mappings SET is_active=FALSE,updated_at=NOW() WHERE tenant_id=${tid} AND ingredient_id=${item.id}`;
      await sql`UPDATE ingredients SET is_active=FALSE,updated_at=NOW() WHERE tenant_id=${tid} AND id=${item.id}`;
      deleted.push({id:item.id,name:item.name});
    }
    return NextResponse.json({ok:true,deleted,blocked,deletedCount:deleted.length,blockedCount:blocked.length});
  }catch(e){return NextResponse.json({error:e.message},{status:500});}
}
