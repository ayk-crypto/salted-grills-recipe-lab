import {NextResponse} from "next/server";
import {db} from "../../db";
import {requireTenant,requireRole} from "../../tenant";

const defaults={
  currency:"PKR",tax_enabled:false,tax_rate:0,prices_include_tax:true,
  payment_fee_pct:0,delivery_commission_pct:0,other_variable_pct:0,
  packaging_per_order:0,monthly_overheads:[],monthly_sales_basis:0,allocation_method:"revenue"
};
const num=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:0};
function normalize(row={}){
  let overheads=row.monthly_overheads||[];
  if(typeof overheads==="string"){try{overheads=JSON.parse(overheads)}catch{overheads=[]}}
  if(!Array.isArray(overheads))overheads=[];
  overheads=overheads.map((x,i)=>({id:String(x.id||`cost-${i+1}`),name:String(x.name||"Other"),amount:num(x.amount)})).filter(x=>x.name.trim());
  return {...defaults,...row,
    tax_enabled:Boolean(row.tax_enabled),prices_include_tax:row.prices_include_tax!==false,
    tax_rate:num(row.tax_rate),payment_fee_pct:num(row.payment_fee_pct),
    delivery_commission_pct:num(row.delivery_commission_pct),other_variable_pct:num(row.other_variable_pct),
    packaging_per_order:num(row.packaging_per_order),monthly_sales_basis:num(row.monthly_sales_basis),
    monthly_overheads:overheads,allocation_method:"revenue"
  };
}
export async function GET(){
  try{
    const tenant=await requireTenant(),sql=db();
    const [row]=await sql`SELECT * FROM workspace_cost_models WHERE tenant_id=${tenant.id} LIMIT 1`;
    return NextResponse.json({tenant:{id:tenant.id,name:tenant.name},model:normalize(row||{})});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
export async function POST(req){
  try{
    const tenant=await requireRole(['owner','admin']),sql=db(),body=normalize(await req.json().catch(()=>({})));
    if(body.tax_rate>100||body.payment_fee_pct>100||body.delivery_commission_pct>100||body.other_variable_pct>100)
      return NextResponse.json({error:"Percentage values cannot exceed 100"},{status:400});
    const [row]=await sql`
      INSERT INTO workspace_cost_models
      (tenant_id,currency,tax_enabled,tax_rate,prices_include_tax,payment_fee_pct,delivery_commission_pct,other_variable_pct,packaging_per_order,monthly_overheads,monthly_sales_basis,allocation_method,updated_at)
      VALUES(${tenant.id},${String(body.currency||"PKR").slice(0,8)},${body.tax_enabled},${body.tax_rate},${body.prices_include_tax},${body.payment_fee_pct},${body.delivery_commission_pct},${body.other_variable_pct},${body.packaging_per_order},${JSON.stringify(body.monthly_overheads)}::jsonb,${body.monthly_sales_basis},'revenue',NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        currency=EXCLUDED.currency,tax_enabled=EXCLUDED.tax_enabled,tax_rate=EXCLUDED.tax_rate,
        prices_include_tax=EXCLUDED.prices_include_tax,payment_fee_pct=EXCLUDED.payment_fee_pct,
        delivery_commission_pct=EXCLUDED.delivery_commission_pct,other_variable_pct=EXCLUDED.other_variable_pct,
        packaging_per_order=EXCLUDED.packaging_per_order,monthly_overheads=EXCLUDED.monthly_overheads,
        monthly_sales_basis=EXCLUDED.monthly_sales_basis,allocation_method='revenue',updated_at=NOW()
      RETURNING *`;
    return NextResponse.json({ok:true,model:normalize(row)});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
