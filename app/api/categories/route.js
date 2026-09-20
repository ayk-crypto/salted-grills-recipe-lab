import {NextResponse} from "next/server";
import {db} from "../../db";
import {requireTenant,requireRole} from "../../tenant";
import {readJson,text,uuid,validationResponse} from "../../lib/validation.mjs";

export async function POST(req){
  try{
    const body=await readJson(req),name=text(body.name,{field:"Category name",required:true,max:120});
    const sql=db(),tenant=await requireRole(["owner","admin","manager"]),tid=tenant.id;
    const [existing]=await sql`SELECT * FROM categories WHERE tenant_id=${tid} AND lower(name)=lower(${name}) LIMIT 1`;
    if(existing){
      const [row]=await sql`UPDATE categories SET name=${name},is_active=true,updated_at=now() WHERE id=${existing.id} AND tenant_id=${tid} RETURNING *`;
      return NextResponse.json(row);
    }
    const [row]=await sql`INSERT INTO categories (tenant_id,name) VALUES (${tid},${name}) RETURNING *`;
    return NextResponse.json(row,{status:201});
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Category request failed"},{status:500})}
}

export async function PATCH(req){
  try{
    const body=await readJson(req),id=uuid(body.id,{field:"Category id"}),name=text(body.name,{field:"Category name",required:true,max:120});
    const sql=db(),tenant=await requireRole(["owner","admin","manager"]),tid=tenant.id;
    const [current]=await sql`SELECT id,name FROM categories WHERE id=${id} AND tenant_id=${tid}`;
    if(!current)return NextResponse.json({error:"Category not found"},{status:404});
    const [dupe]=await sql`SELECT id FROM categories WHERE tenant_id=${tid} AND lower(name)=lower(${name}) AND id<>${id} LIMIT 1`;
    if(dupe)return NextResponse.json({error:"A category with this name already exists"},{status:409});
    const queries=[
      sql`UPDATE recipes SET category=${name},updated_at=now() WHERE tenant_id=${tid} AND category=${current.name} AND is_active=true`,
      sql`UPDATE categories SET name=${name},updated_at=now() WHERE id=${id} AND tenant_id=${tid}`
    ];
    await sql.transaction(queries,{isolationLevel:"Serializable"});
    const [row]=await sql`SELECT * FROM categories WHERE id=${id} AND tenant_id=${tid}`;
    return NextResponse.json(row);
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Category request failed"},{status:500})}
}

export async function DELETE(req){
  try{
    const body=await readJson(req),sql=db(),tenant=await requireRole(["owner","admin","manager"]),tid=tenant.id;
    let item=null;
    if(body.id){
      const id=uuid(body.id,{field:"Category id"});[item]=await sql`SELECT id,name FROM categories WHERE id=${id} AND tenant_id=${tid}`;
    }else if(body.name){
      const name=text(body.name,{field:"Category name",required:true,max:120});[item]=await sql`SELECT id,name FROM categories WHERE tenant_id=${tid} AND name=${name}`;
    }else return NextResponse.json({error:"Category id or name is required"},{status:400});
    if(!item)return NextResponse.json({error:"Category not found"},{status:404});
    const usage=await sql`SELECT id,name,recipe_type FROM recipes WHERE tenant_id=${tid} AND category=${item.name} AND is_active=true ORDER BY name`;
    if(usage.length)return NextResponse.json({error:`${item.name} is assigned to ${usage.length} active menu item${usage.length===1?"":"s"}. Move those items to another category first.`,used_in:usage},{status:409});
    await sql`DELETE FROM categories WHERE id=${item.id} AND tenant_id=${tid}`;
    return NextResponse.json({ok:true,item});
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Category request failed"},{status:500})}
}
