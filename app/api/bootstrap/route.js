import { NextResponse } from "next/server";
import { db } from "../../db";
import { requireTenant } from "../../tenant";

function norm(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}
function unitInfo(unit){
  const u=norm(unit);
  if(u==='kg')return['weight',1000,'g'];
  if(['g','gm','gram','grams'].includes(u))return['weight',1,'g'];
  if(['l','ltr','liter','litre'].includes(u))return['volume',1000,'ml'];
  if(u==='ml')return['volume',1,'ml'];
  if(['pc','pcs','piece','pieces','each'].includes(u))return['count',1,'pc'];
  return[u||'other',1,u||'other'];
}
function meta(v){if(!v)return{};if(typeof v==='object')return v;try{return JSON.parse(v)||{}}catch{return{}}}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function originalPurchase(p){
  if(!p)return null;
  let purchaseQuantity=Number(p.purchase_quantity),purchaseUnit=p.purchase_unit,purchasePrice=Number(p.purchase_price);
  if(p.source==='shelfsense'){
    const m=meta(p.source_metadata),q=finite(m.sourceEnteredQty),total=finite(m.sourceReceiptTotal),u=m.sourceEnteredUnit||m.sourcePurchaseUnit;
    if(q&&q>0&&u&&total!==null&&total>=0){purchaseQuantity=q;purchaseUnit=u;purchasePrice=total}
  }
  return{purchaseQuantity,purchaseUnit,purchasePrice};
}
function isDirect(fromUnit,toUnit){
  const a=unitInfo(fromUnit),b=unitInfo(toUnit);
  return ['weight','volume','count'].includes(a[0])&&a[0]===b[0];
}
function decoratePrice(p,ingredient,conversionMap){
  if(!p)return p;
  const original=originalPurchase(p),m=meta(p.source_metadata);
  const base={...p,
    display_purchase_quantity:original?.purchaseQuantity,
    display_purchase_unit:original?.purchaseUnit,
    display_purchase_price:original?.purchasePrice,
  };
  const target=ingredient.default_unit||'g';

  // ShelfSense owns purchase-to-storage conversion and storage unit cost.
  // PlateCost starts from the ShelfSense storage unit, then applies usable yield only when required.
  if(p.source==='shelfsense'){
    const storageUnit=m.sourceBaseUnit||null,storageCost=finite(m.sourceUnitCost);
    const shelfBase={...base,storage_unit:storageUnit,storage_unit_cost:storageCost};
    if(!storageUnit||storageCost===null)return{...shelfBase,costing_status:'invalid',costing_method:'storage_cost_missing'};
    if(isDirect(storageUnit,target))return{...shelfBase,
      purchase_quantity:1,purchase_unit:storageUnit,purchase_price:storageCost,
      costing_status:'ready',costing_unit:unitInfo(target)[2],costing_method:'storage_direct',source_purchase_unit:storageUnit
    };
    const conv=conversionMap.get(`${ingredient.id}|${norm(storageUnit)}`);
    if(conv)return{...shelfBase,
      purchase_quantity:Number(conv.usable_quantity),purchase_unit:conv.costing_unit,purchase_price:storageCost,
      costing_status:'ready',costing_unit:unitInfo(conv.costing_unit)[2],costing_method:'storage_yield',
      usable_quantity:Number(conv.usable_quantity),usable_costing_unit:conv.costing_unit,source_purchase_unit:storageUnit
    };
    return{...shelfBase,
      purchase_quantity:0,purchase_unit:target,purchase_price:storageCost,
      costing_status:'needs_yield',costing_unit:unitInfo(target)[2],costing_method:'storage_yield_required',source_purchase_unit:storageUnit
    };
  }

  // Manual prices retain the existing purchase-unit based behavior.
  if(!(Number.isFinite(original?.purchaseQuantity)&&original.purchaseQuantity>0&&Number.isFinite(original?.purchasePrice)))return{...base,costing_status:'invalid'};
  if(isDirect(original.purchaseUnit,target))return{...base,
    purchase_quantity:original.purchaseQuantity,purchase_unit:original.purchaseUnit,purchase_price:original.purchasePrice,
    costing_status:'ready',costing_unit:unitInfo(target)[2],costing_method:'direct'
  };
  const conv=conversionMap.get(`${ingredient.id}|${norm(original.purchaseUnit)}`);
  if(conv)return{...base,
    purchase_quantity:original.purchaseQuantity*Number(conv.usable_quantity),purchase_unit:conv.costing_unit,purchase_price:original.purchasePrice,
    costing_status:'ready',costing_unit:unitInfo(conv.costing_unit)[2],costing_method:'yield',
    usable_quantity:Number(conv.usable_quantity),usable_costing_unit:conv.costing_unit,source_purchase_unit:original.purchaseUnit
  };
  return{...base,
    purchase_quantity:0,purchase_unit:target,purchase_price:original.purchasePrice,
    costing_status:'needs_yield',costing_unit:unitInfo(target)[2],costing_method:'yield_required',source_purchase_unit:original.purchaseUnit
  };
}
function priceDerived(p,ingredient,conversionMap){
  const d=decoratePrice(p,ingredient,conversionMap);
  if(!d)return{costing_status:'invalid',normalized_cost:null,normalized_unit:null};
  const info=unitInfo(d.purchase_unit),base=Number(d.purchase_quantity||0)*info[1];
  return{costing_status:d.costing_status,normalized_cost:base>0?Number(d.purchase_price)/base:null,normalized_unit:info[2],source_purchase_unit:d.source_purchase_unit||d.display_purchase_unit,storage_unit:d.storage_unit||null,storage_unit_cost:d.storage_unit_cost??null,usable_quantity:d.usable_quantity||null,usable_costing_unit:d.usable_costing_unit||null};
}

export async function GET() {
  try {
    const sql = db();
    const tenant = await requireTenant();
    const tid = tenant.id;
    const ingredientRows = await sql`
      SELECT i.*,
        EXISTS(SELECT 1 FROM entity_flags ef WHERE ef.tenant_id=${tid} AND ef.entity_type='ingredient' AND ef.entity_id=i.id) AS is_flagged,
        (SELECT json_build_object(
          'id', ip.id,'purchase_quantity', ip.purchase_quantity,'purchase_unit', ip.purchase_unit,
          'purchase_price', ip.purchase_price,'price_date', ip.price_date,'supplier', ip.supplier,'source',ip.source,
          'source_metadata', ip.source_metadata
        ) FROM ingredient_prices ip
        WHERE ip.ingredient_id = i.id AND ip.tenant_id=${tid}
        ORDER BY ip.price_date DESC, ip.created_at DESC LIMIT 1) AS latest_price,
        (SELECT json_build_object(
          'purchase_quantity', ip.purchase_quantity,'purchase_unit', ip.purchase_unit,
          'purchase_price', ip.purchase_price,'price_date', ip.price_date,'supplier', ip.supplier,'source',ip.source,
          'source_metadata', ip.source_metadata
        ) FROM ingredient_prices ip
        WHERE ip.ingredient_id = i.id AND ip.tenant_id=${tid}
        ORDER BY ip.price_date DESC, ip.created_at DESC OFFSET 1 LIMIT 1) AS previous_price
      FROM ingredients i WHERE i.is_active = true AND i.tenant_id=${tid} ORDER BY i.name
    `;
    const costingConversions=await sql`
      SELECT id,tenant_id,ingredient_id,purchase_unit,usable_quantity,costing_unit,source,notes,created_at,updated_at
      FROM ingredient_costing_conversions WHERE tenant_id=${tid} ORDER BY ingredient_id,purchase_unit
    `;
    const conversionMap=new Map(costingConversions.map(c=>[`${c.ingredient_id}|${norm(c.purchase_unit)}`,c]));
    const ingredients=ingredientRows.map(i=>({...i,
      latest_price:decoratePrice(i.latest_price,i,conversionMap),
      previous_price:decoratePrice(i.previous_price,i,conversionMap),
      costing_conversions:costingConversions.filter(c=>String(c.ingredient_id)===String(i.id))
    }));
    const packaging = await sql`SELECT * FROM packaging_items WHERE is_active = true ORDER BY name`;
    const units = await sql`SELECT * FROM measurement_units WHERE is_active = true ORDER BY unit_group NULLS LAST, name`;
    const categories = await sql`
      SELECT c.*,EXISTS(SELECT 1 FROM entity_flags ef WHERE ef.tenant_id=${tid} AND ef.entity_type='category' AND ef.entity_id=c.id) AS is_flagged
      FROM categories c WHERE c.is_active = true AND c.tenant_id=${tid} ORDER BY c.name
    `;
    const recipes = await sql`
      SELECT r.*, rv.version_no, rv.status, rv.yield_quantity, rv.yield_unit, rv.kitchen_notes,
             EXISTS(SELECT 1 FROM entity_flags ef WHERE ef.tenant_id=${tid} AND ef.entity_type='recipe' AND ef.entity_id=r.id) AS is_flagged,
             (SELECT count(*)::int FROM recipe_components rc WHERE rc.recipe_version_id = rv.id) AS component_count,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'ingredient_id', rc.ingredient_id,'bulk_recipe_id', rc.bulk_recipe_id,
                 'ingredient_name', i.name,'bulk_recipe_name', br.name,'quantity', rc.quantity,'unit', rc.unit,'notes', rc.notes
               ) ORDER BY rc.sort_order, rc.id)
               FROM recipe_components rc
               LEFT JOIN ingredients i ON i.id = rc.ingredient_id AND i.tenant_id=${tid}
               LEFT JOIN recipes br ON br.id = rc.bulk_recipe_id AND br.tenant_id=${tid}
               WHERE rc.recipe_version_id = rv.id
             ), '[]'::json) AS components_summary
      FROM recipes r
      LEFT JOIN recipe_versions rv ON rv.id = r.current_version_id
      WHERE r.is_active = true AND r.tenant_id=${tid}
      ORDER BY r.updated_at DESC, r.name
    `;
    const rawPrices = await sql`
      SELECT ip.id,ip.ingredient_id,ip.purchase_quantity,ip.purchase_unit,ip.purchase_price,ip.price_date,ip.supplier,ip.source,ip.source_metadata,i.name AS ingredient_name,
             EXISTS(SELECT 1 FROM entity_flags ef WHERE ef.tenant_id=${tid} AND ef.entity_type='price' AND ef.entity_id=ip.id) AS is_flagged
      FROM ingredient_prices ip JOIN ingredients i ON i.id=ip.ingredient_id AND i.tenant_id=${tid}
      WHERE i.is_active=true AND ip.tenant_id=${tid}
      ORDER BY ip.price_date DESC,ip.created_at DESC LIMIT 1000
    `;
    const ingredientMap=new Map(ingredientRows.map(i=>[String(i.id),i]));
    const prices=rawPrices.map(p=>({...p,...priceDerived(p,ingredientMap.get(String(p.ingredient_id))||{id:p.ingredient_id,default_unit:p.purchase_unit},conversionMap)}));
    return NextResponse.json({tenant:{id:tenant.id,name:tenant.name,slug:tenant.slug},ingredients, packaging, units, categories, recipes, prices, costing_conversions:costingConversions});
  } catch (e) {
    return NextResponse.json({error: e.message}, {status: 500});
  }
}
