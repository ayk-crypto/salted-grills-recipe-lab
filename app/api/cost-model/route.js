import {NextResponse} from "next/server";
import {db} from "../../db";
import {requireTenant,requireRole} from "../../tenant";
import {readJson,text,nonnegative,percentage,list,validationResponse} from "../../lib/validation.mjs";

const defaults={
  currency:"PKR",tax_enabled:false,tax_rate:0,prices_include_tax:true,
  payment_fee_pct:0,delivery_commission_pct:0,other_variable_pct:0,
  packaging_per_order:0,monthly_overheads:[],monthly_sales_basis:0,allocation_method:"revenue"
};
function normalizeRead(row={}){
  let overheads=row.monthly_overheads||[];
  if(typeof overheads==="string"){try{overheads=JSON.parse(overheads)}catch{overheads=[]}}
  if(!Array.isArray(overheads))overheads=[];
  overheads=overheads.map((x,i)=>({id:String(x.id||`cost-${i+1}`),name:String(x.name||"Other"),amount:Number(x.amount)||0})).filter(x=>x.name.trim());
  return {...defaults,...row,
    tax_enabled:Boolean(row.tax_enabled),prices_include_tax:row.prices_include_tax!==false,
    tax_rate:Number(row.tax_rate)||0,payment_fee_pct:Number(row.payment_fee_pct)||0,
    delivery_commission_pct:Number(row.delivery_commission_pct)||0,other_variable_pct:Number(row.other_variable_pct)||0,
    packaging_per_order:Number(row.packaging_per_order)||0,monthly_sales_basis:Number(row.monthly_sales_basis)||0,
    monthly_overheads:overheads,allocation_method:"revenue"
  };
}
function validateModel(body={}){
  const overheads=list(Array.isArray(body.monthly_overheads)?body.monthly_overheads:[],{field:"Monthly overheads",max:100}).map((x,i)=>({
    id:text(x?.id||`cost-${i+1}`,{field:`Monthly overhead #${i+1} id`,required:true,max:80}),
    name:text(x?.name,{field:`Monthly overhead #${i+1} name`,required:true,max:120}),
    amount:nonnegative(x?.amount,{field:`Monthly overhead #${i+1} amount`})
  }));
  return {
    currency:text(body.currency||"PKR",{field:"Currency",required:true,max:8}).toUpperCase(),
    tax_enabled:Boolean(body.tax_enabled),
    tax_rate:percentage(body.tax_rate??0,{field:"Tax rate"}),
    prices_include_tax:body.prices_include_tax!==false,
    payment_fee_pct:percentage(body.payment_fee_pct??0,{field:"Payment fee"}),
    delivery_commission_pct:percentage(body.delivery_commission_pct??0,{field:"Delivery commission"}),
    other_variable_pct:percentage(body.other_variable_pct??0,{field:"Other variable cost"}),
    packaging_per_order:nonnegative(body.packaging_per_order??0,{field:"Packaging per order"}),
    monthly_overheads:overheads,
    monthly_sales_basis:nonnegative(body.monthly_sales_basis??0,{field:"Monthly sales basis"}),
    allocation_method:"revenue"
  };
}

export async function GET(){
  try{
    const tenant=await requireTenant(),sql=db();
    const [row]=await sql`SELECT * FROM workspace_cost_models WHERE tenant_id=${tenant.id} LIMIT 1`;
    return NextResponse.json({tenant:{id:tenant.id,name:tenant.name},model:normalizeRead(row||{})});
  }catch(e){return NextResponse.json({error:"Could not load cost model"},{status:500})}
}
export async function POST(req){
  try{
    const tenant=await requireRole(["owner","admin"]),sql=db(),body=validateModel(await readJson(req));
    const [row]=await sql`
      INSERT INTO workspace_cost_models
      (tenant_id,currency,tax_enabled,tax_rate,prices_include_tax,payment_fee_pct,delivery_commission_pct,other_variable_pct,packaging_per_order,monthly_overheads,monthly_sales_basis,allocation_method,updated_at)
      VALUES(${tenant.id},${body.currency},${body.tax_enabled},${body.tax_rate},${body.prices_include_tax},${body.payment_fee_pct},${body.delivery_commission_pct},${body.other_variable_pct},${body.packaging_per_order},${JSON.stringify(body.monthly_overheads)}::jsonb,${body.monthly_sales_basis},'revenue',NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        currency=EXCLUDED.currency,tax_enabled=EXCLUDED.tax_enabled,tax_rate=EXCLUDED.tax_rate,
        prices_include_tax=EXCLUDED.prices_include_tax,payment_fee_pct=EXCLUDED.payment_fee_pct,
        delivery_commission_pct=EXCLUDED.delivery_commission_pct,other_variable_pct=EXCLUDED.other_variable_pct,
        packaging_per_order=EXCLUDED.packaging_per_order,monthly_overheads=EXCLUDED.monthly_overheads,
        monthly_sales_basis=EXCLUDED.monthly_sales_basis,allocation_method='revenue',updated_at=NOW()
      RETURNING *`;
    return NextResponse.json({ok:true,model:normalizeRead(row)});
  }catch(e){const v=validationResponse(e,NextResponse);if(v)return v;return NextResponse.json({error:"Could not save cost model"},{status:500})}
}
