import { NextResponse } from "next/server";
import { db } from "../../db";
import {requireTenant,requireRole} from "../../tenant";
import {readJson,text,uuid,positive,oneOf,validationResponse} from "../../lib/validation.mjs";

function norm(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
function unitInfo(unit){
  const u=norm(unit);
  if(u==='kg')return['weight',1000,'kg'];
  if(['g','gm','gram','grams'].includes(u))return['weight',1,'g'];
  if(['l','ltr','liter','litre'].includes(u))return['volume',1000,'l'];
  if(u==='ml')return['volume',1,'ml'];
  if(['pc','pcs','piece','pieces','each'].includes(u))return['count',1,'pc'];
  return[u||'other',1,u];
}

export async function GET(req){
  try{
    const tenant=await requireTenant(),sql=db();
    const ingredientId=new URL(req.url).searchParams.get('ingredient_id');
    const rows=ingredientId
      ?await sql`SELECT * FROM ingredient_costing_conversions WHERE tenant_id=${tenant.id} AND ingredient_id=${ingredientId} ORDER BY purchase_unit`
      :await sql`SELECT * FROM ingredient_costing_conversions WHERE tenant_id=${tenant.id} ORDER BY ingredient_id,purchase_unit`;
    return NextResponse.json({conversions:rows});
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Costing conversion request failed"},{status:500})}
}

export async function POST(req){
  try{
    const tenant=await requireRole(['owner','admin','manager']),sql=db(),body=await readJson(req);
    const ingredientId=uuid(body.ingredient_id||body.ingredientId,{field:"Ingredient id"});
    const purchaseUnit=text(body.purchase_unit||body.purchaseUnit,{field:"Purchase unit",required:true,max:40}).toLowerCase();
    const usableQuantity=positive(body.usable_quantity||body.usableQuantity,{field:"Usable quantity"});
    const [ingredient]=await sql`SELECT id,name,default_unit FROM ingredients WHERE id=${ingredientId} AND tenant_id=${tenant.id} AND is_active=TRUE`;
    if(!ingredient)return NextResponse.json({error:'Ingredient not found'},{status:404});
    const costingUnit=norm(body.costing_unit||body.costingUnit||ingredient.default_unit);
    const info=unitInfo(costingUnit);
    if(!['weight','volume','count'].includes(info[0]))return NextResponse.json({error:'Costing unit must be g/kg, ml/L, or pc'},{status:400});
    const source=oneOf(body.source||"manual",["manual","shelfsense"],{field:"Source"});
    const [saved]=await sql`
      INSERT INTO ingredient_costing_conversions
        (tenant_id,ingredient_id,purchase_unit,usable_quantity,costing_unit,source,notes,updated_at)
      VALUES
        (${tenant.id},${ingredient.id},${purchaseUnit},${usableQuantity},${costingUnit},${source},${body.notes||null},NOW())
      ON CONFLICT (tenant_id,ingredient_id,purchase_unit) DO UPDATE SET
        usable_quantity=EXCLUDED.usable_quantity,costing_unit=EXCLUDED.costing_unit,
        source=EXCLUDED.source,notes=EXCLUDED.notes,updated_at=NOW()
      RETURNING *
    `;
    return NextResponse.json({ok:true,conversion:saved});
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Costing conversion request failed"},{status:500})}
}

export async function DELETE(req){
  try{
    const tenant=await requireRole(['owner','admin','manager']),sql=db(),body=await req.json();
    const ingredientId=String(body.ingredient_id||body.ingredientId||'').trim();
    const purchaseUnit=norm(body.purchase_unit||body.purchaseUnit);
    if(!ingredientId||!purchaseUnit)return NextResponse.json({error:'Ingredient and purchase unit are required'},{status:400});
    await sql`DELETE FROM ingredient_costing_conversions WHERE tenant_id=${tenant.id} AND ingredient_id=${ingredientId} AND purchase_unit=${purchaseUnit}`;
    return NextResponse.json({ok:true});
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Costing conversion request failed"},{status:500})}
}
