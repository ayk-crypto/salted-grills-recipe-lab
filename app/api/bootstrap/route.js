import { NextResponse } from "next/server";
import { db } from "../../db";
import { requireTenant } from "../../tenant";

export async function GET() {
  try {
    const sql = db();
    const tenant = await requireTenant();
    const tid = tenant.id;
    const ingredients = await sql`
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
    const prices = await sql`
      SELECT ip.id,ip.ingredient_id,ip.purchase_quantity,ip.purchase_unit,ip.purchase_price,ip.price_date,ip.supplier,ip.source,ip.source_metadata,i.name AS ingredient_name,
             EXISTS(SELECT 1 FROM entity_flags ef WHERE ef.tenant_id=${tid} AND ef.entity_type='price' AND ef.entity_id=ip.id) AS is_flagged
      FROM ingredient_prices ip JOIN ingredients i ON i.id=ip.ingredient_id AND i.tenant_id=${tid}
      WHERE i.is_active=true AND ip.tenant_id=${tid}
      ORDER BY ip.price_date DESC,ip.created_at DESC LIMIT 1000
    `;
    return NextResponse.json({tenant:{id:tenant.id,name:tenant.name,slug:tenant.slug},ingredients, packaging, units, categories, recipes, prices});
  } catch (e) {
    return NextResponse.json({error: e.message}, {status: 500});
  }
}
