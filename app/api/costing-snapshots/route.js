import { NextResponse } from "next/server";
import { db } from "../../db";
import { requireTenant } from "../../tenant";

function meta(v){if(!v)return{};if(typeof v==='object')return v;try{return JSON.parse(v)||{}}catch{return{}}}
function safeNum(v){const n=Number(v);return Number.isFinite(n)?n:null}

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
    const lines=await sql`
      SELECT l.snapshot_id,l.entity_type,l.entity_id,l.entity_name,l.cost,l.selling_price,l.food_cost_percent,l.contribution,l.source_breakdown
      FROM costing_snapshot_lines l
      JOIN costing_snapshots s ON s.id=l.snapshot_id
      WHERE s.tenant_id=${tenant.id} AND l.entity_type IN ('ingredient','menu')
      ORDER BY l.created_at
    `;
    return NextResponse.json({snapshots:snapshots.map(s=>({...s,summary:meta(s.summary),lines:lines.filter(l=>String(l.snapshot_id)===String(s.id)).map(l=>({...l,source_breakdown:meta(l.source_breakdown)}))}))});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}

export async function POST(req){
  try{
    const tenant=await requireTenant(),sql=db(),body=await req.json().catch(()=>({})),action=String(body.action||'');

    if(action==='create'){
      const ingredients=Array.isArray(body.ingredients)?body.ingredients:[];
      const menus=Array.isArray(body.menus)?body.menus:[];
      const summary=body.summary&&typeof body.summary==='object'?body.summary:{};
      const asOf=String(body.asOf||new Date().toISOString().slice(0,10)).slice(0,10);
      if(!ingredients.length)return NextResponse.json({error:'No ShelfSense ingredient data was supplied'},{status:400});
      const ingredientIds=ingredients.map(x=>String(x.ingredientId||x.entity_id||'')).filter(Boolean);
      const allowedIngredients=await sql`SELECT id FROM ingredients WHERE tenant_id=${tenant.id} AND is_active=TRUE`;
      const allowedSet=new Set(allowedIngredients.map(x=>String(x.id)));
      if(ingredientIds.some(id=>!allowedSet.has(id)))return NextResponse.json({error:'Snapshot contains an invalid ingredient'},{status:400});
      const allowedMenus=await sql`SELECT id FROM recipes WHERE tenant_id=${tenant.id} AND is_active=TRUE AND recipe_type='menu'`;
      const menuSet=new Set(allowedMenus.map(x=>String(x.id)));
      if(menus.some(x=>!menuSet.has(String(x.recipeId||x.entity_id||''))))return NextResponse.json({error:'Snapshot contains an invalid menu item'},{status:400});
      const label=`sync-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}`;
      const [snapshot]=await sql`INSERT INTO costing_snapshots(tenant_id,snapshot_date,label,status) VALUES(${tenant.id},${asOf}::date,${label},'draft') RETURNING *`;
      for(const r of ingredients){
        const cost=safeNum(r.kitchenCost)??0;
        const source={...r,changed:Boolean(r.changed),needsYield:Boolean(r.needsYield)};
        await sql`INSERT INTO costing_snapshot_lines(snapshot_id,entity_type,entity_id,entity_name,cost,source_breakdown) VALUES(${snapshot.id},'ingredient',${String(r.ingredientId)},${String(r.ingredientName||'Ingredient')},${cost},${JSON.stringify(source)}::jsonb)`;
      }
      for(const m of menus){
        const cost=safeNum(m.cost)??0,sell=safeNum(m.sellingPrice),food=safeNum(m.foodCostPercent),contribution=safeNum(m.contribution);
        await sql`INSERT INTO costing_snapshot_lines(snapshot_id,entity_type,entity_id,entity_name,cost,selling_price,food_cost_percent,contribution,source_breakdown) VALUES(${snapshot.id},'menu',${String(m.recipeId)},${String(m.name||'Menu item')},${cost},${sell},${food},${contribution},${JSON.stringify(m)}::jsonb)`;
      }
      await sql`INSERT INTO costing_snapshot_lines(snapshot_id,entity_type,entity_id,entity_name,cost,source_breakdown) VALUES(${snapshot.id},'summary','summary','Summary',0,${JSON.stringify(summary)}::jsonb)`;
      await sql`UPDATE integrations SET last_sync_at=NOW(),last_sync_status='success',last_sync_error=NULL,updated_at=NOW() WHERE tenant_id=${tenant.id} AND provider='shelfsense'`;
      return NextResponse.json({ok:true,snapshotId:snapshot.id,status:'draft',summary,message:'Review snapshot created. Live costing was not changed.'});
    }

    const snapshotId=String(body.snapshot_id||body.snapshotId||'');
    if(!snapshotId)return NextResponse.json({error:'Snapshot is required'},{status:400});
    const [snapshot]=await sql`SELECT * FROM costing_snapshots WHERE id=${snapshotId} AND tenant_id=${tenant.id} LIMIT 1`;
    if(!snapshot)return NextResponse.json({error:'Snapshot not found'},{status:404});
    const lines=await sql`SELECT * FROM costing_snapshot_lines WHERE snapshot_id=${snapshot.id} ORDER BY created_at`;
    const ingredientLines=lines.filter(l=>l.entity_type==='ingredient');
    const summary=meta(lines.find(l=>l.entity_type==='summary')?.source_breakdown);

    if(action==='publish'){
      if(snapshot.status!=='draft')return NextResponse.json({error:'Only draft snapshots can be published'},{status:409});
      await sql`UPDATE costing_snapshots SET status='archived' WHERE tenant_id=${tenant.id} AND status='published' AND id<>${snapshot.id}`;
      let inserted=0;
      for(const l of ingredientLines){
        const m=meta(l.source_breakdown);
        if(!(Number(m.purchaseQuantity)>0)||!Number.isFinite(Number(m.purchasePrice))||!m.purchaseUnit)continue;
        if(m.sourceExternalId){
          const [existing]=await sql`SELECT id FROM ingredient_prices WHERE tenant_id=${tenant.id} AND ingredient_id=${l.entity_id}::uuid AND source='shelfsense' AND source_external_id=${String(m.sourceExternalId)} LIMIT 1`;
          if(existing)continue;
        }else if(!m.changed)continue;
        await sql`INSERT INTO ingredient_prices(tenant_id,ingredient_id,purchase_quantity,purchase_unit,purchase_price,supplier,price_date,source,source_external_id,source_metadata) VALUES(${tenant.id},${l.entity_id}::uuid,${Number(m.purchaseQuantity)},${m.purchaseUnit},${Number(m.purchasePrice)},${m.supplier||'ShelfSense'},${m.priceDate||snapshot.snapshot_date}::date,'shelfsense',${m.sourceExternalId||null},${JSON.stringify({...m,publishedSnapshotId:snapshot.id,sourceBaseUnit:m.storageUnit||m.sourceBaseUnit,sourceUnitCost:m.storageUnitCost??m.sourceUnitCost})}::jsonb)`;
        inserted++;
      }
      await sql`UPDATE costing_snapshots SET status='published' WHERE id=${snapshot.id} AND tenant_id=${tenant.id}`;
      return NextResponse.json({ok:true,status:'published',inserted,needsYield:Number(summary.needsYield||0),snapshotId:snapshot.id});
    }

    if(action==='restore'){
      if(snapshot.status!=='archived'&&snapshot.status!=='published')return NextResponse.json({error:'Only published history can be restored'},{status:409});
      await sql`UPDATE costing_snapshots SET status='archived' WHERE tenant_id=${tenant.id} AND status='published' AND id<>${snapshot.id}`;
      let restored=0;
      for(const l of ingredientLines){
        const m=meta(l.source_breakdown);
        if(!(Number(m.purchaseQuantity)>0)||!Number.isFinite(Number(m.purchasePrice))||!m.purchaseUnit)continue;
        await sql`INSERT INTO ingredient_prices(tenant_id,ingredient_id,purchase_quantity,purchase_unit,purchase_price,supplier,price_date,source,source_external_id,source_metadata) VALUES(${tenant.id},${l.entity_id}::uuid,${Number(m.purchaseQuantity)},${m.purchaseUnit},${Number(m.purchasePrice)},${m.supplier||'Snapshot restore'},CURRENT_DATE,'restore',NULL,${JSON.stringify({...m,restoredFromSnapshotId:snapshot.id,originalPriceDate:m.priceDate||null,sourceBaseUnit:m.storageUnit||m.sourceBaseUnit,sourceUnitCost:m.storageUnitCost??m.sourceUnitCost})}::jsonb)`;
        if(m.yieldSourceUnit&&Number(m.yieldUsableQuantity)>0&&m.yieldCostingUnit){await sql`INSERT INTO ingredient_costing_conversions(tenant_id,ingredient_id,purchase_unit,usable_quantity,costing_unit,source,notes,updated_at) VALUES(${tenant.id},${l.entity_id}::uuid,${m.yieldSourceUnit},${Number(m.yieldUsableQuantity)},${m.yieldCostingUnit},'manual','Restored from costing snapshot',NOW()) ON CONFLICT (tenant_id,ingredient_id,purchase_unit) DO UPDATE SET usable_quantity=EXCLUDED.usable_quantity,costing_unit=EXCLUDED.costing_unit,notes=EXCLUDED.notes,updated_at=NOW()`;}
        restored++;
      }
      await sql`UPDATE costing_snapshots SET status='published' WHERE id=${snapshot.id} AND tenant_id=${tenant.id}`;
      return NextResponse.json({ok:true,status:'published',restored,snapshotId:snapshot.id});
    }

    return NextResponse.json({error:'Unsupported action'},{status:400});
  }catch(e){return NextResponse.json({error:e.message},{status:500})}
}
