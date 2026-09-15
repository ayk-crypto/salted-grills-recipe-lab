import { NextResponse } from "next/server";
import { db } from "../../db";

function normalizeName(v){return String(v||"").trim().toLowerCase()}
function validNumber(v){return Number.isFinite(Number(v))&&Number(v)>0}
function blank(v){return v===null||v===undefined||String(v).trim()===""}

export async function GET(req) {
  try {
    const {searchParams}=new URL(req.url),ingredientId=searchParams.get("ingredient_id"),sql=db();
    if(ingredientId){
      const rows=await sql`SELECT ip.*,i.name AS ingredient_name FROM ingredient_prices ip JOIN ingredients i ON i.id=ip.ingredient_id WHERE ip.ingredient_id=${ingredientId} ORDER BY ip.price_date DESC,ip.created_at DESC`;
      return NextResponse.json(rows);
    }
    const rows=await sql`SELECT ip.*,i.name AS ingredient_name FROM ingredient_prices ip JOIN ingredients i ON i.id=ip.ingredient_id ORDER BY ip.price_date DESC,ip.created_at DESC LIMIT 1000`;
    return NextResponse.json(rows);
  } catch (e) { return NextResponse.json({error:e.message}, {status:500}); }
}

export async function POST(req) {
  try {
    const b = await req.json(),sql = db();
    if(Array.isArray(b.rows)){
      const ingredients=await sql`SELECT id,name FROM ingredients WHERE is_active=true ORDER BY name`;
      const byName=new Map(ingredients.map(i=>[normalizeName(i.name),i])),results=[];
      for(let index=0;index<b.rows.length;index++){
        const row=b.rows[index]||{},name=normalizeName(row.ingredient_name);
        if(!name)continue;
        const ingredient=byName.get(name);
        if(!ingredient){results.push({index,status:"error",error:"Ingredient not found",ingredient_name:row.ingredient_name});continue}
        if(blank(row.purchase_quantity)&&blank(row.purchase_price)){results.push({index,status:"skipped",reason:"blank",ingredient_name:ingredient.name});continue}
        if(!validNumber(row.purchase_quantity)||!validNumber(row.purchase_price)||!String(row.purchase_unit||"").trim()){
          results.push({index,status:"error",error:"Quantity, unit and price are required",ingredient_name:ingredient.name});continue;
        }
        const priceDate=row.price_date||new Date().toISOString().slice(0,10),unit=String(row.purchase_unit).trim(),supplier=String(row.supplier||"").trim()||null;
        const [dupe]=await sql`
          SELECT id FROM ingredient_prices
          WHERE ingredient_id=${ingredient.id} AND purchase_quantity=${Number(row.purchase_quantity)} AND purchase_unit=${unit}
            AND purchase_price=${Number(row.purchase_price)} AND price_date=${priceDate}
            AND COALESCE(supplier,'')=COALESCE(${supplier},'') LIMIT 1
        `;
        if(dupe){results.push({index,status:"skipped",reason:"duplicate",ingredient_name:ingredient.name});continue}
        const [created]=await sql`
          INSERT INTO ingredient_prices (ingredient_id,purchase_quantity,purchase_unit,purchase_price,price_date,supplier)
          VALUES (${ingredient.id},${Number(row.purchase_quantity)},${unit},${Number(row.purchase_price)},${priceDate},${supplier}) RETURNING *
        `;
        results.push({index,status:"imported",ingredient_name:ingredient.name,id:created.id});
      }
      return NextResponse.json({
        imported:results.filter(r=>r.status==="imported").length,
        skipped:results.filter(r=>r.status==="skipped").length,
        errors:results.filter(r=>r.status==="error").length,
        results
      },{status:201});
    }
    if(!validNumber(b.purchase_quantity)||!validNumber(b.purchase_price)||!String(b.purchase_unit||"").trim())return NextResponse.json({error:"Quantity, unit and price are required"},{status:400});
    const [row] = await sql`
      INSERT INTO ingredient_prices (ingredient_id,purchase_quantity,purchase_unit,purchase_price,price_date,supplier)
      VALUES (${b.ingredient_id},${b.purchase_quantity},${b.purchase_unit},${b.purchase_price},${b.price_date || new Date().toISOString().slice(0,10)},${b.supplier || null}) RETURNING *
    `;
    return NextResponse.json(row, {status:201});
  } catch (e) { return NextResponse.json({error:e.message}, {status:500}); }
}
