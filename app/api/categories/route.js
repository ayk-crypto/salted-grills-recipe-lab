import { NextResponse } from "next/server";
import { db } from "../../db";
import {requireTenant,requireRole} from "../../tenant";

const clean=v=>String(v||"").trim();

export async function POST(req) {
  try {
    const body=await req.json(),name=clean(body.name);
    if(!name)return NextResponse.json({error:"Category name is required"},{status:400});
    const sql=db(),tenant=await requireRole(['owner','admin','manager']),tid=tenant.id;
    const [existing]=await sql`SELECT * FROM categories WHERE tenant_id=${tid} AND lower(name)=lower(${name}) LIMIT 1`;
    if(existing){
      const [row]=await sql`UPDATE categories SET name=${name},is_active=true,updated_at=now() WHERE id=${existing.id} AND tenant_id=${tid} RETURNING *`;
      return NextResponse.json(row,{status:200});
    }
    const [row]=await sql`INSERT INTO categories (tenant_id,name) VALUES (${tid},${name}) RETURNING *`;
    return NextResponse.json(row,{status:201});
  }catch(e){return NextResponse.json({error:e.message},{status:500});}
}

export async function PATCH(req){
  try{
    const body=await req.json();if(!body.id)return NextResponse.json({error:"Category id is required"},{status:400});
    const name=clean(body.name);if(!name)return NextResponse.json({error:"Category name is required"},{status:400});
    const sql=db(),tenant=await requireRole(['owner','admin','manager']),tid=tenant.id;
    const [current]=await sql`SELECT id,name FROM categories WHERE id=${body.id} AND tenant_id=${tid}`;
    if(!current)return NextResponse.json({error:"Category not found"},{status:404});
    const [dupe]=await sql`SELECT id FROM categories WHERE tenant_id=${tid} AND lower(name)=lower(${name}) AND id<>${body.id} LIMIT 1`;
    if(dupe)return NextResponse.json({error:"A category with this name already exists"},{status:409});
    await sql`UPDATE recipes SET category=${name},updated_at=now() WHERE tenant_id=${tid} AND category=${current.name} AND is_active=true`;
    const [row]=await sql`UPDATE categories SET name=${name},updated_at=now() WHERE id=${body.id} AND tenant_id=${tid} RETURNING *`;
    return NextResponse.json(row);
  }catch(e){return NextResponse.json({error:e.message},{status:500});}
}

export async function DELETE(req){
  try{
    const body=await req.json(),sql=db(),tenant=await requireRole(['owner','admin','manager']),tid=tenant.id;let item;
    if(body.id)[item]=await sql`SELECT id,name FROM categories WHERE id=${body.id} AND tenant_id=${tid}`;
    else if(body.name)[item]=await sql`SELECT id,name FROM categories WHERE tenant_id=${tid} AND name=${clean(body.name)}`;
    if(!item)return NextResponse.json({error:"Category not found"},{status:404});
    const usage=await sql`SELECT id,name,recipe_type FROM recipes WHERE tenant_id=${tid} AND category=${item.name} AND is_active=true ORDER BY name`;
    if(usage.length)return NextResponse.json({error:`${item.name} is assigned to ${usage.length} active menu item${usage.length===1?'':'s'}. Move those items to another category first.`,used_in:usage},{status:409});
    await sql`DELETE FROM categories WHERE id=${item.id} AND tenant_id=${tid}`;
    return NextResponse.json({ok:true,item});
  }catch(e){return NextResponse.json({error:e.message},{status:500});}
}
