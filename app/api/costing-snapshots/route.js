import { NextResponse } from "next/server";
import { db } from "../../db";
import { requireTenant } from "../../tenant";

function meta(v){if(!v)return{};if(typeof v==='object')return v;try{return JSON.parse(v)||{}}catch{return{}}}

export async function GET(){
  try{
    const tenant=await requireTenant(),sql=db();
    const snapshots=await sql`
      SELECT s.id,s.snapshot_date,s.label,s.status,s.created_at,
        COALESCE((SELECT source_breakdown FROM costing_snapshot_lines l WHERE l.snapshot_id=s.id AND l.entity_type='summary' LIMIT 1),'{}'::jsonb) AS summary
      FROM costing_snapshots s
      WHERE s.tenant_id=${tenant.id}
      ORDER BY s.created_at DESC
      LIMIT 30
    `;
    const ids=snapshots.map(x=>x.id);
    let lines=[];
    if(ids.length){
      lines=await sql`
        SELECT snapshot_id,entity_type,entity_id,entity_name,cost,selling_price,food_cost_percent,contribution,source_breakdown
        FROM costing_snapshot_lines
        WHERE snapshot_id = ANY(${ids}::uuid[]) AND entity_type IN ('ingredient','menu')
        ORDER BY created_at
      `;
    }
    return NextResponse.json({snapshots:snapshots.map(s=>({...s,summary:meta(s.summary),lines:lines.filter(l=>String(l.snapshot_id)===String(s.id)).map(l=>({...l,source_breakdown:meta(l.source_breakdown)}))}))});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function POST(req){
  try{
    const tenant=await requireTenant(),sql=db(),body=await req.json().catch(()=>({})),action=String(body.action||'');
    const snapshotId=String(body.snapshot_id||body.snapshotId||'');
    if(!snapshotId)return NextResponse.json({error:'Snapshot is required'},{status:400});
    const [snapshot]=await sql`SELECT * FROM costing_snapshots WHERE id=${snapshotId} AND tenant_id=${tenant.id} LIMIT 1`;
    if(!snapshot)return NextResponse.json({error:'Snapshot not found'},{status:404});
    const lines=await sql`SELECT * FROM costing_snapshot_lines WHERE snapshot_id=${snapshot.id} ORDER BY created_at`;
    const ingredientLines=lines.filter(l=>l.entity_type==='ingredient');
    const summaryLine=lines.find(l=>l.entity_type==='summary');
    const summary=meta(summaryLine?.source_breakdown);

    if(action==='publish'){
      if(snapshot.status!=='draft')return NextResponse.json({error:'Only draft snapshots can be published'},{status:409});
      if(Number(summary.needsYield||0)>0)return NextResponse.json({error:`${summary.needsYield} ingredient${Number(summary.needsYield)===1?'':'s'} still need yield before publishing.`},{status:409});
      await sql`UPDATE costing_snapshots SET status='archived' WHERE tenant_id=${tenant.id} AND status='published' AND id<>${snapshot.id}`;
      let inserted=0;
      for(const l of ingredientLines){
        const m=meta(l.source_breakdown);
        if(!m.changed)continue;
        if(!(Number(m.purchaseQuantity)>0)||!Number.isFinite(Number(m.purchasePrice))||!m.purchaseUnit)continue;
        await sql`
          INSERT INTO ingredient_prices(tenant_id,ingredient_id,purchase_quantity,purchase_unit,purchase_price,supplier,price_date,source,source_external_id,source_metadata)
          VALUES(${tenant.id},${l.entity_id}::uuid,${Number(m.purchaseQuantity)},${m.purchaseUnit},${Number(m.purchasePrice)},${m.supplier||'ShelfSense'},${m.priceDate||snapshot.snapshot_date}::date,'shelfsense',${m.sourceExternalId||null},${JSON.stringify({...m,publishedSnapshotId:snapshot.id})}::jsonb)
        `;
        inserted++;
      }
      await sql`UPDATE costing_snapshots SET status='published' WHERE id=${snapshot.id} AND tenant_id=${tenant.id}`;
      return NextResponse.json({ok:true,status:'published',inserted,snapshotId:snapshot.id});
    }

    if(action==='restore'){
      if(snapshot.status!=='archived'&&snapshot.status!=='published')return NextResponse.json({error:'Only published history can be restored'},{status:409});
      await sql`UPDATE costing_snapshots SET status='archived' WHERE tenant_id=${tenant.id} AND status='published' AND id<>${snapshot.id}`;
      let restored=0;
      for(const l of ingredientLines){
        const m=meta(l.source_breakdown);
        if(!(Number(m.purchaseQuantity)>0)||!Number.isFinite(Number(m.purchasePrice))||!m.purchaseUnit)continue;
        await sql`
          INSERT INTO ingredient_prices(tenant_id,ingredient_id,purchase_quantity,purchase_unit,purchase_price,supplier,price_date,source,source_external_id,source_metadata)
          VALUES(${tenant.id},${l.entity_id}::uuid,${Number(m.purchaseQuantity)},${m.purchaseUnit},${Number(m.purchasePrice)},${m.supplier||'Snapshot restore'},CURRENT_DATE,'restore',NULL,${JSON.stringify({...m,restoredFromSnapshotId:snapshot.id,originalPriceDate:m.priceDate||null})}::jsonb)
        `;
        if(m.yieldSourceUnit&&Number(m.yieldUsableQuantity)>0&&m.yieldCostingUnit){
          await sql`
            INSERT INTO ingredient_costing_conversions(tenant_id,ingredient_id,purchase_unit,usable_quantity,costing_unit,source,notes,updated_at)
            VALUES(${tenant.id},${l.entity_id}::uuid,${m.yieldSourceUnit},${Number(m.yieldUsableQuantity)},${m.yieldCostingUnit},'manual','Restored from costing snapshot',NOW())
            ON CONFLICT (tenant_id,ingredient_id,purchase_unit) DO UPDATE SET usable_quantity=EXCLUDED.usable_quantity,costing_unit=EXCLUDED.costing_unit,notes=EXCLUDED.notes,updated_at=NOW()
          `;
        }
        restored++;
      }
      await sql`UPDATE costing_snapshots SET status='published' WHERE id=${snapshot.id} AND tenant_id=${tenant.id}`;
      return NextResponse.json({ok:true,status:'published',restored,snapshotId:snapshot.id});
    }

    return NextResponse.json({error:'Unsupported action'},{status:400});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
