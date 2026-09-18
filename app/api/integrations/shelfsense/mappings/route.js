import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { requireTenant } from "../../../../tenant";
import { fetchShelfSenseItems, getShelfSenseIntegration } from "../../../../integrations/shelfsense";

function norm(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}

export async function POST(req){
  try{
    const tenant=await requireTenant(),sql=db();
    const body=await req.json();
    const integration=await getShelfSenseIntegration(tenant.id);
    if(!integration)return NextResponse.json({error:'ShelfSense is not connected'},{status:400});

    if(body.action==='auto_map'){
      const remote=await fetchShelfSenseItems(tenant.id);
      const byName=new Map((remote.items||[]).map(x=>[norm(x.name),x]));
      const ingredients=await sql`SELECT id,name,default_unit FROM ingredients WHERE tenant_id=${tenant.id} AND is_active=TRUE ORDER BY name`;
      let mapped=0;
      for(const i of ingredients){
        const match=byName.get(norm(i.name));
        if(!match)continue;
        const kitchenUnit=i.default_unit||match.issueUnit||match.unit||'g';
        await sql`
          INSERT INTO ingredient_source_mappings
            (tenant_id,ingredient_id,source_type,integration_id,external_item_id,external_item_name,kitchen_unit,conversion_factor,is_active,updated_at)
          VALUES
            (${tenant.id},${i.id},'shelfsense',${integration.id},${String(match.id)},${match.name},${kitchenUnit},1,TRUE,NOW())
          ON CONFLICT (tenant_id,ingredient_id) DO UPDATE SET
            source_type='shelfsense',integration_id=EXCLUDED.integration_id,
            external_item_id=EXCLUDED.external_item_id,external_item_name=EXCLUDED.external_item_name,
            kitchen_unit=EXCLUDED.kitchen_unit,conversion_factor=1,is_active=TRUE,updated_at=NOW()
        `;
        mapped++;
      }
      return NextResponse.json({ok:true,mapped,total:ingredients.length});
    }


    if(body.action==='bulk_add'){
      const selected=Array.isArray(body.items)?body.items:[];
      if(!selected.length)return NextResponse.json({error:'Select at least one ShelfSense item'},{status:400});
      const remote=await fetchShelfSenseItems(tenant.id);
      const remoteMap=new Map((remote.items||[]).map(x=>[String(x.id),x]));
      const allowedUnits=new Set(['g','ml','pc','kg','L']);
      let created=0,mapped=0,skipped=0;const results=[];
      for(const choice of selected){
        const externalId=String(choice.external_item_id||choice.externalItemId||'');
        const item=remoteMap.get(externalId);
        if(!item){results.push({externalId,status:'error',error:'ShelfSense item not found'});continue}
        const kitchenUnit=String(choice.kitchen_unit||choice.kitchenUnit||'').trim();
        if(!allowedUnits.has(kitchenUnit)){results.push({externalId,name:item.name,status:'error',error:'Choose a recipe unit (g, ml, pc, kg or L)'});continue}
        const [already]=await sql`SELECT ingredient_id FROM ingredient_source_mappings WHERE tenant_id=${tenant.id} AND integration_id=${integration.id} AND external_item_id=${externalId} AND is_active=TRUE LIMIT 1`;
        if(already){skipped++;results.push({externalId,name:item.name,status:'skipped',reason:'Already mapped'});continue}
        let [ingredient]=await sql`SELECT id,name,default_unit FROM ingredients WHERE tenant_id=${tenant.id} AND lower(name)=lower(${item.name}) LIMIT 1`;
        let wasCreated=false;
        if(!ingredient){
          [ingredient]=await sql`INSERT INTO ingredients(tenant_id,name,default_unit,ingredient_type,notes,is_active) VALUES(${tenant.id},${item.name},${kitchenUnit},'raw','Added from ShelfSense reconciliation',TRUE) RETURNING id,name,default_unit`;
          created++;wasCreated=true;
        }
        await sql`
          INSERT INTO ingredient_source_mappings
            (tenant_id,ingredient_id,source_type,integration_id,external_item_id,external_item_name,kitchen_unit,conversion_factor,is_active,updated_at)
          VALUES
            (${tenant.id},${ingredient.id},'shelfsense',${integration.id},${externalId},${item.name},${kitchenUnit},1,TRUE,NOW())
          ON CONFLICT (tenant_id,ingredient_id) DO UPDATE SET
            source_type='shelfsense',integration_id=EXCLUDED.integration_id,
            external_item_id=EXCLUDED.external_item_id,external_item_name=EXCLUDED.external_item_name,
            kitchen_unit=EXCLUDED.kitchen_unit,conversion_factor=1,is_active=TRUE,updated_at=NOW()
        `;
        mapped++;results.push({externalId,name:item.name,status:'mapped',ingredientId:ingredient.id,created:wasCreated,kitchenUnit});
      }
      return NextResponse.json({ok:true,created,mapped,skipped,results});
    }

    const ingredientId=String(body.ingredient_id||body.ingredientId||'').trim();
    if(!ingredientId)return NextResponse.json({error:'ingredient_id is required'},{status:400});
    const [ingredient]=await sql`SELECT id,name,default_unit FROM ingredients WHERE id=${ingredientId} AND tenant_id=${tenant.id} AND is_active=TRUE`;
    if(!ingredient)return NextResponse.json({error:'Ingredient not found'},{status:404});

    const source=body.source_type==='shelfsense'?'shelfsense':'manual';
    if(source==='manual'){
      await sql`
        INSERT INTO ingredient_source_mappings (tenant_id,ingredient_id,source_type,kitchen_unit,conversion_factor,is_active,updated_at)
        VALUES (${tenant.id},${ingredient.id},'manual',${body.kitchen_unit||ingredient.default_unit},1,TRUE,NOW())
        ON CONFLICT (tenant_id,ingredient_id) DO UPDATE SET
          source_type='manual',integration_id=NULL,external_item_id=NULL,external_item_name=NULL,
          kitchen_unit=EXCLUDED.kitchen_unit,conversion_factor=1,is_active=TRUE,updated_at=NOW()
      `;
      return NextResponse.json({ok:true,source:'manual'});
    }

    const externalItemId=String(body.external_item_id||body.externalItemId||'').trim();
    if(!externalItemId)return NextResponse.json({error:'ShelfSense item is required'},{status:400});
    const remote=await fetchShelfSenseItems(tenant.id);
    const item=(remote.items||[]).find(x=>String(x.id)===externalItemId);
    if(!item)return NextResponse.json({error:'ShelfSense item not found'},{status:404});
    const factor=Number(body.conversion_factor||body.conversionFactor||1);
    if(!Number.isFinite(factor)||factor<=0)return NextResponse.json({error:'Conversion factor must be greater than zero'},{status:400});
    const kitchenUnit=String(body.kitchen_unit||body.kitchenUnit||ingredient.default_unit||item.issueUnit||item.unit||'g');
    await sql`
      INSERT INTO ingredient_source_mappings
        (tenant_id,ingredient_id,source_type,integration_id,external_item_id,external_item_name,kitchen_unit,conversion_factor,is_active,updated_at)
      VALUES
        (${tenant.id},${ingredient.id},'shelfsense',${integration.id},${externalItemId},${item.name},${kitchenUnit},${factor},TRUE,NOW())
      ON CONFLICT (tenant_id,ingredient_id) DO UPDATE SET
        source_type='shelfsense',integration_id=EXCLUDED.integration_id,
        external_item_id=EXCLUDED.external_item_id,external_item_name=EXCLUDED.external_item_name,
        kitchen_unit=EXCLUDED.kitchen_unit,conversion_factor=EXCLUDED.conversion_factor,
        is_active=TRUE,updated_at=NOW()
    `;
    return NextResponse.json({ok:true,source:'shelfsense',item});
  }catch(e){
    if(String(e.message||'').includes('ingredient_source_mappings_integration_id_external_item_id_key')){
      return NextResponse.json({error:'That ShelfSense item is already mapped to another ingredient'},{status:409});
    }
    return NextResponse.json({error:e.message},{status:500})
  }
}
