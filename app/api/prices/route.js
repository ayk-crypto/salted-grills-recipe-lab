import { NextResponse } from "next/server";
import { db } from "../../db";
import {requireTenant,requireRole} from "../../tenant";
import {readJson,text,uuid,positive,dateOnly,list,validationResponse} from "../../lib/validation.mjs";
import {recordAudit} from "../../lib/audit.mjs";
import {requestId,errorResponse} from "../../lib/api-errors.mjs";

function normalizeName(v){return String(v||"").trim().toLowerCase()}
function validNumber(v){return Number.isFinite(Number(v))&&Number(v)>0}
function blank(v){return v===null||v===undefined||String(v).trim()===""}

export async function GET(req){
  const rid=requestId(req);try{
    const {searchParams}=new URL(req.url),ingredientId=searchParams.get("ingredient_id"),sql=db(),tenant=await requireTenant(),tid=tenant.id;
    if(ingredientId){
      const rows=await sql`SELECT ip.*,i.name AS ingredient_name FROM ingredient_prices ip JOIN ingredients i ON i.id=ip.ingredient_id AND i.tenant_id=${tid} WHERE ip.tenant_id=${tid} AND ip.ingredient_id=${ingredientId} ORDER BY ip.price_date DESC,ip.created_at DESC`;
      return NextResponse.json(rows);
    }
    const rows=await sql`SELECT ip.*,i.name AS ingredient_name FROM ingredient_prices ip JOIN ingredients i ON i.id=ip.ingredient_id AND i.tenant_id=${tid} WHERE ip.tenant_id=${tid} ORDER BY ip.price_date DESC,ip.created_at DESC LIMIT 1000`;
    return NextResponse.json(rows);
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return errorResponse(e,NextResponse,{requestId:rid,route:"/api/prices",action:"list",fallback:"Price request failed"});}
}

export async function POST(req){
  const rid=requestId(req);try{
    const b=await readJson(req),sql=db(),tenant=await requireRole(['owner','admin','manager']),tid=tenant.id;
    if(Array.isArray(b.rows)){list(b.rows,{field:"rows",max:3000});
      const ingredients=await sql`SELECT id,name FROM ingredients WHERE tenant_id=${tid} AND is_active=true ORDER BY name`;
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
        const [dupe]=await sql`SELECT id FROM ingredient_prices WHERE tenant_id=${tid} AND ingredient_id=${ingredient.id} AND purchase_quantity=${Number(row.purchase_quantity)} AND purchase_unit=${unit} AND purchase_price=${Number(row.purchase_price)} AND price_date=${priceDate} AND COALESCE(supplier,'')=COALESCE(${supplier},'') LIMIT 1`;
        if(dupe){results.push({index,status:"skipped",reason:"duplicate",ingredient_name:ingredient.name});continue}
        const [created]=await sql`INSERT INTO ingredient_prices (tenant_id,ingredient_id,purchase_quantity,purchase_unit,purchase_price,price_date,supplier,source) VALUES (${tid},${ingredient.id},${Number(row.purchase_quantity)},${unit},${Number(row.purchase_price)},${priceDate},${supplier},'excel') RETURNING *`;
        results.push({index,status:"imported",ingredient_name:ingredient.name,id:created.id});
      }
      const summary={imported:results.filter(r=>r.status==="imported").length,skipped:results.filter(r=>r.status==="skipped").length,errors:results.filter(r=>r.status==="error").length};
      await recordAudit(sql,{tenant,action:"import",entityType:"ingredient_price",entityName:"Purchase price import",after:summary,metadata:{row_count:b.rows.length},requestId:rid});
      return NextResponse.json({...summary,results},{status:201});
    }
    const ingredientId=uuid(b.ingredient_id,{field:"Ingredient id"});
    const purchaseQuantity=positive(b.purchase_quantity,{field:"Purchase quantity"});
    const purchasePrice=positive(b.purchase_price,{field:"Purchase price"});
    const purchaseUnit=text(b.purchase_unit,{field:"Purchase unit",required:true,max:40});
    const priceDate=dateOnly(b.price_date,{field:"Price date"})||new Date().toISOString().slice(0,10);
    const supplier=text(b.supplier,{field:"Supplier",max:160})||null;
    const source=text(b.source||"manual",{field:"Source",required:true,max:40});
    const [owned]=await sql`SELECT id,name FROM ingredients WHERE id=${ingredientId} AND tenant_id=${tid} AND is_active=true`;
    if(!owned)return NextResponse.json({error:"Ingredient not found"},{status:404});
    const [row]=await sql`INSERT INTO ingredient_prices (tenant_id,ingredient_id,purchase_quantity,purchase_unit,purchase_price,price_date,supplier,source) VALUES (${tid},${ingredientId},${purchaseQuantity},${purchaseUnit},${purchasePrice},${priceDate},${supplier},${source}) RETURNING *`;
    await recordAudit(sql,{tenant,action:"create",entityType:"ingredient_price",entityId:row.id,entityName:owned.name,after:{ingredient_id:ingredientId,purchase_quantity:purchaseQuantity,purchase_unit:purchaseUnit,purchase_price:purchasePrice,price_date:priceDate,supplier,source},requestId:rid});
    return NextResponse.json(row,{status:201});
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return errorResponse(e,NextResponse,{requestId:rid,route:"/api/prices",action:"create",fallback:"Could not save purchase price"});}
}
