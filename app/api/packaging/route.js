import { NextResponse } from "next/server";
import { db } from "../../db";

function cost(qty, price) {
  const q = Number(qty), p = Number(price);
  return q > 0 && p >= 0 ? p / q : null;
}

export async function POST(req) {
  try {
    const b = await req.json();
    const name = String(b.name || "").trim();
    if (!name) return NextResponse.json({error:"Packaging name is required"},{status:400});
    const unitCost = cost(b.purchase_quantity, b.purchase_price);
    const sql = db();
    const [row] = await sql`
      INSERT INTO packaging_items (name, purchase_quantity, purchase_unit, purchase_price, unit_cost, notes)
      VALUES (${name}, ${b.purchase_quantity || null}, ${b.purchase_unit || null}, ${b.purchase_price || null}, ${unitCost}, ${b.notes || null})
      RETURNING *
    `;
    return NextResponse.json(row,{status:201});
  } catch(e) { return NextResponse.json({error:e.message},{status:500}); }
}

export async function PUT(req) {
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({error:"Packaging id is required"},{status:400});
    const unitCost = cost(b.purchase_quantity, b.purchase_price);
    const sql = db();
    const [row] = await sql`
      UPDATE packaging_items SET name=${String(b.name||"").trim()}, purchase_quantity=${b.purchase_quantity||null},
      purchase_unit=${b.purchase_unit||null}, purchase_price=${b.purchase_price||null}, unit_cost=${unitCost},
      notes=${b.notes||null}, updated_at=now() WHERE id=${b.id} RETURNING *
    `;
    return NextResponse.json(row);
  } catch(e) { return NextResponse.json({error:e.message},{status:500}); }
}

export async function DELETE(req) {
  try {
    const {id}=await req.json();
    if(!id) return NextResponse.json({error:"Packaging id is required"},{status:400});
    const sql=db();
    const [usage]=await sql`SELECT count(*)::int AS count FROM recipe_packaging WHERE packaging_item_id=${id}`;
    if((usage?.count||0)>0){
      await sql`UPDATE packaging_items SET is_active=false,updated_at=now() WHERE id=${id}`;
      return NextResponse.json({ok:true,mode:"deactivated"});
    }
    await sql`DELETE FROM packaging_items WHERE id=${id}`;
    return NextResponse.json({ok:true,mode:"deleted"});
  } catch(e){return NextResponse.json({error:e.message},{status:500});}
}
