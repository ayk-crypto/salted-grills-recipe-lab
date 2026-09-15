import { NextResponse } from "next/server";
import { db } from "../../db";

const clean=v=>String(v||"").trim();
const norm=v=>clean(v).toLowerCase();

export async function POST(req) {
  try {
    const body = await req.json();
    const sql = db();

    if (Array.isArray(body.rows)) {
      const existing = await sql`SELECT id,name FROM ingredients ORDER BY name`;
      const byName = new Map(existing.map(i=>[norm(i.name),i]));
      const results=[];
      for(let index=0; index<body.rows.length; index++){
        const r=body.rows[index]||{};
        const name=clean(r.name || r.ingredient_name || r["Ingredient Name"]);
        if(!name){results.push({index,status:"error",error:"Ingredient name is required"});continue;}
        const defaultUnit=clean(r.default_unit || r["Default Unit"] || "g") || "g";
        const ingredientType=clean(r.ingredient_type || r.type || r["Type"] || "raw") || "raw";
        const notes=clean(r.notes || r["Notes"]) || null;
        const found=byName.get(norm(name));
        if(found){
          const [updated]=await sql`
            UPDATE ingredients
            SET name=${name}, default_unit=${defaultUnit}, ingredient_type=${ingredientType}, notes=${notes}, is_active=true, updated_at=now()
            WHERE id=${found.id}
            RETURNING id,name,default_unit,ingredient_type
          `;
          results.push({index,status:"updated",...updated});
        } else {
          const [created]=await sql`
            INSERT INTO ingredients (name,default_unit,ingredient_type,notes)
            VALUES (${name},${defaultUnit},${ingredientType},${notes})
            RETURNING id,name,default_unit,ingredient_type
          `;
          byName.set(norm(name),created);
          results.push({index,status:"created",...created});
        }
      }
      return NextResponse.json({
        created:results.filter(x=>x.status==="created").length,
        updated:results.filter(x=>x.status==="updated").length,
        errors:results.filter(x=>x.status==="error").length,
        results
      },{status:201});
    }

    const name = clean(body.name);
    if (!name) return NextResponse.json({error:"Name is required"}, {status:400});
    const [dupe]=await sql`SELECT id FROM ingredients WHERE lower(name)=lower(${name}) LIMIT 1`;
    if(dupe) return NextResponse.json({error:"An ingredient with this name already exists"},{status:409});
    const [row] = await sql`
      INSERT INTO ingredients (name, default_unit, ingredient_type, notes)
      VALUES (${name}, ${body.default_unit || "g"}, ${body.ingredient_type || "raw"}, ${body.notes || null})
      RETURNING *
    `;
    return NextResponse.json(row, {status:201});
  } catch (e) {
    return NextResponse.json({error:e.message}, {status:500});
  }
}

export async function PATCH(req){
  try{
    const body=await req.json();
    if(!body.id)return NextResponse.json({error:"Ingredient id is required"},{status:400});
    const name=clean(body.name);
    if(!name)return NextResponse.json({error:"Name is required"},{status:400});
    const sql=db();
    const [dupe]=await sql`SELECT id FROM ingredients WHERE lower(name)=lower(${name}) AND id<>${body.id} LIMIT 1`;
    if(dupe)return NextResponse.json({error:"An ingredient with this name already exists"},{status:409});
    const [row]=await sql`
      UPDATE ingredients SET name=${name}, default_unit=${body.default_unit||"g"}, ingredient_type=${body.ingredient_type||"raw"}, notes=${body.notes||null}, updated_at=now()
      WHERE id=${body.id} AND is_active=true RETURNING *
    `;
    if(!row)return NextResponse.json({error:"Ingredient not found"},{status:404});
    return NextResponse.json(row);
  }catch(e){return NextResponse.json({error:e.message},{status:500});}
}

export async function DELETE(req) {
  try {
    const body = await req.json();
    const sql = db();
    let item;
    if (body.id) [item] = await sql`SELECT id, name FROM ingredients WHERE id = ${body.id}`;
    else if (body.name) [item] = await sql`SELECT id, name FROM ingredients WHERE name = ${clean(body.name)}`;
    if (!item) return NextResponse.json({error:"Ingredient not found"}, {status:404});

    const usage = await sql`
      SELECT DISTINCT r.id,r.name,r.recipe_type
      FROM recipes r
      JOIN recipe_versions rv ON rv.id=r.current_version_id
      JOIN recipe_components rc ON rc.recipe_version_id=rv.id
      WHERE r.is_active=true AND rc.ingredient_id=${item.id}
      ORDER BY r.name
    `;
    if (usage.length) return NextResponse.json({
      error:`${item.name} is still used in ${usage.length} active item${usage.length===1?'':'s'}. Remove it from those items first.`,
      used_in:usage
    }, {status:409});

    await sql`DELETE FROM ingredient_prices WHERE ingredient_id = ${item.id}`;
    await sql`DELETE FROM ingredients WHERE id = ${item.id}`;
    return NextResponse.json({ok:true, item});
  } catch (e) {
    return NextResponse.json({error:e.message}, {status:500});
  }
}
