import { NextResponse } from "next/server";
import { db } from "../../db";

export async function GET() {
  try {
    const sql = db();
    const ingredients = await sql`
      SELECT i.*,
        (SELECT json_build_object(
          'purchase_quantity', ip.purchase_quantity,
          'purchase_unit', ip.purchase_unit,
          'purchase_price', ip.purchase_price,
          'price_date', ip.price_date,
          'supplier', ip.supplier
        ) FROM ingredient_prices ip
        WHERE ip.ingredient_id = i.id
        ORDER BY ip.price_date DESC, ip.created_at DESC LIMIT 1) AS latest_price
      FROM ingredients i WHERE i.is_active = true ORDER BY i.name
    `;
    const packaging = await sql`
      SELECT * FROM packaging_items WHERE is_active = true ORDER BY name
    `;
    const units = await sql`
      SELECT * FROM measurement_units WHERE is_active = true ORDER BY unit_group NULLS LAST, name
    `;
    const categories = await sql`
      SELECT * FROM categories WHERE is_active = true ORDER BY name
    `;
    const recipes = await sql`
      SELECT r.*, rv.version_no, rv.status, rv.yield_quantity, rv.yield_unit,
             rv.prep_time_minutes, rv.cook_time_minutes,
             (SELECT count(*)::int FROM recipe_components rc WHERE rc.recipe_version_id = rv.id) AS component_count,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'ingredient_id', rc.ingredient_id,
                 'bulk_recipe_id', rc.bulk_recipe_id,
                 'ingredient_name', i.name,
                 'bulk_recipe_name', br.name,
                 'quantity', rc.quantity,
                 'unit', rc.unit,
                 'notes', rc.notes
               ) ORDER BY rc.sort_order, rc.id)
               FROM recipe_components rc
               LEFT JOIN ingredients i ON i.id = rc.ingredient_id
               LEFT JOIN recipes br ON br.id = rc.bulk_recipe_id
               WHERE rc.recipe_version_id = rv.id
             ), '[]'::json) AS components_summary
      FROM recipes r
      LEFT JOIN recipe_versions rv ON rv.id = r.current_version_id
      WHERE r.is_active = true
      ORDER BY r.updated_at DESC, r.name
    `;
    return NextResponse.json({ingredients, packaging, units, categories, recipes});
  } catch (e) {
    return NextResponse.json({error: e.message}, {status: 500});
  }
}
