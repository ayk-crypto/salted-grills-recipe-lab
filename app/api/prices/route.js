import { NextResponse } from "next/server";
import { db } from "../../db";

export async function POST(req) {
  try {
    const b = await req.json();
    const sql = db();
    const [row] = await sql`
      INSERT INTO ingredient_prices
      (ingredient_id, purchase_quantity, purchase_unit, purchase_price, price_date, supplier)
      VALUES (${b.ingredient_id}, ${b.purchase_quantity}, ${b.purchase_unit},
              ${b.purchase_price}, ${b.price_date || new Date().toISOString().slice(0,10)}, ${b.supplier || null})
      RETURNING *
    `;
    return NextResponse.json(row, {status:201});
  } catch (e) {
    return NextResponse.json({error:e.message}, {status:500});
  }
}
