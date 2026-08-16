import { neon } from "@neondatabase/serverless";

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(process.env.DATABASE_URL);
}

export async function getRecipe(id) {
  const sql = db();
  const [recipe] = await sql`
    SELECT r.*, rv.id AS version_id, rv.version_no, rv.status,
           rv.yield_quantity, rv.yield_unit, rv.prep_time_minutes,
           rv.cook_time_minutes, rv.kitchen_notes
    FROM recipes r
    LEFT JOIN recipe_versions rv ON rv.id = r.current_version_id
    WHERE r.id = ${id}
  `;
  if (!recipe) return null;
  const components = recipe.version_id ? await sql`
    SELECT rc.*, i.name AS ingredient_name, br.name AS bulk_recipe_name
    FROM recipe_components rc
    LEFT JOIN ingredients i ON i.id = rc.ingredient_id
    LEFT JOIN recipes br ON br.id = rc.bulk_recipe_id
    WHERE rc.recipe_version_id = ${recipe.version_id}
    ORDER BY rc.sort_order, rc.id
  ` : [];
  const steps = recipe.version_id ? await sql`
    SELECT * FROM recipe_steps
    WHERE recipe_version_id = ${recipe.version_id}
    ORDER BY step_no
  ` : [];
  const photos = recipe.version_id ? await sql`
    SELECT id, photo_type, storage_key, public_url, caption, created_at
    FROM recipe_photos
    WHERE recipe_version_id = ${recipe.version_id}
    ORDER BY created_at
  ` : [];
  const packaging = await sql`
    SELECT rp.id, rp.order_type, rp.packaging_item_id, rp.quantity,
           p.name, p.unit_cost, p.purchase_unit
    FROM recipe_packaging rp
    JOIN packaging_items p ON p.id = rp.packaging_item_id
    WHERE rp.recipe_id = ${id}
    ORDER BY rp.order_type, p.name
  `;
  const versions = await sql`
    SELECT id, version_no, status, yield_quantity, yield_unit,
           prep_time_minutes, cook_time_minutes, created_at
    FROM recipe_versions
    WHERE recipe_id = ${id}
    ORDER BY version_no DESC
  `;
  return {...recipe, components, steps, photos, packaging, versions};
}
