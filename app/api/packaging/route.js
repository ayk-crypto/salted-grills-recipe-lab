import {NextResponse} from "next/server";
import {db} from "../../db";
import {requireTenant} from "../../tenant";

const num=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:null};
const unitCost=(qty,price)=>{const q=num(qty),p=num(price);return q&&q>0&&p!==null?p/q:null};

export async function GET(){
 try{
  const tenant=await requireTenant(),sql=db();
  const rows=await sql`
    SELECT id,name,purchase_quantity,purchase_unit,purchase_price,unit_cost,notes,is_active,
           source_type,external_item_id,source_metadata,last_source_sync_at
    FROM packaging_items
    WHERE tenant_id=${tenant.id} AND is_active=TRUE
    ORDER BY name
  `;
  return NextResponse.json({items:rows});
 }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function POST(req){
 try{
  const tenant=await requireTenant(),sql=db(),b=await req.json(),name=String(b.name||"").trim();
  if(!name)return NextResponse.json({error:"Packaging name is required"},{status:400});
  const [dupe]=await sql`SELECT id FROM packaging_items WHERE tenant_id=${tenant.id} AND is_active=TRUE AND lower(name)=lower(${name}) LIMIT 1`;
  if(dupe)return NextResponse.json({error:"Packaging item already exists"},{status:409});
  const uc=unitCost(b.purchase_quantity,b.purchase_price);
  const [row]=await sql`
    INSERT INTO packaging_items(tenant_id,name,purchase_quantity,purchase_unit,purchase_price,unit_cost,notes,source_type)
    VALUES(${tenant.id},${name},${b.purchase_quantity||null},${b.purchase_unit||null},${b.purchase_price||null},${uc},${b.notes||null},'manual')
    RETURNING *`;
  return NextResponse.json(row,{status:201});
 }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function PUT(req){
 try{
  const tenant=await requireTenant(),sql=db(),b=await req.json();
  if(!b.id)return NextResponse.json({error:"Packaging id is required"},{status:400});
  const name=String(b.name||"").trim();if(!name)return NextResponse.json({error:"Packaging name is required"},{status:400});
  const uc=unitCost(b.purchase_quantity,b.purchase_price);
  const [row]=await sql`
    UPDATE packaging_items SET name=${name},purchase_quantity=${b.purchase_quantity||null},
      purchase_unit=${b.purchase_unit||null},purchase_price=${b.purchase_price||null},unit_cost=${uc},
      notes=${b.notes||null},updated_at=NOW()
    WHERE id=${b.id} AND tenant_id=${tenant.id} AND is_active=TRUE
    RETURNING *`;
  if(!row)return NextResponse.json({error:"Packaging item not found"},{status:404});
  return NextResponse.json(row);
 }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function DELETE(req){
 try{
  const tenant=await requireTenant(),sql=db(),{id}=await req.json();
  if(!id)return NextResponse.json({error:"Packaging id is required"},{status:400});
  const [usage]=await sql`
    SELECT (
      (SELECT count(*) FROM packaging_set_items psi JOIN packaging_sets ps ON ps.id=psi.packaging_set_id WHERE psi.packaging_item_id=${id} AND ps.tenant_id=${tenant.id}) +
      (SELECT count(*) FROM recipe_packaging rp JOIN recipes r ON r.id=rp.recipe_id WHERE rp.packaging_item_id=${id} AND r.tenant_id=${tenant.id})
    )::int AS count`;
  if((usage?.count||0)>0){
    await sql`UPDATE packaging_items SET is_active=FALSE,updated_at=NOW() WHERE id=${id} AND tenant_id=${tenant.id}`;
    return NextResponse.json({ok:true,mode:"deactivated"});
  }
  await sql`DELETE FROM packaging_items WHERE id=${id} AND tenant_id=${tenant.id}`;
  return NextResponse.json({ok:true,mode:"deleted"});
 }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
