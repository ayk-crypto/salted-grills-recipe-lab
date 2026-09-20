-- Neon Data API / Neon Auth RLS boundary for multi-tenant PlateCost.
CREATE OR REPLACE FUNCTION public.app_role_rank(role_name text)
RETURNS integer LANGUAGE sql IMMUTABLE
AS 'SELECT CASE role_name WHEN ''owner'' THEN 4 WHEN ''admin'' THEN 3 WHEN ''manager'' THEN 2 WHEN ''viewer'' THEN 1 ELSE 0 END';

CREATE OR REPLACE FUNCTION public.app_has_tenant_access(target_tenant uuid, required_role text DEFAULT 'viewer')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,auth,pg_catalog
AS 'SELECT EXISTS(SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=target_tenant AND m.auth_user_id=(SELECT auth.user_id()) AND m.status=''active'' AND public.app_role_rank(m.role)>=public.app_role_rank(required_role))';

GRANT EXECUTE ON FUNCTION public.app_role_rank(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_has_tenant_access(uuid,text) TO authenticated;

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.ingredients FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.ingredients FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.ingredient_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.ingredient_prices FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.ingredient_prices FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.categories FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.categories FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.recipes FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.recipes FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.packaging_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.packaging_items FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.packaging_items FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.packaging_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.packaging_sets FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.packaging_sets FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.costing_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.costing_snapshots FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.costing_snapshots FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.workspace_cost_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.workspace_cost_models FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.workspace_cost_models FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'admin')) WITH CHECK (public.app_has_tenant_access(tenant_id,'admin'));

ALTER TABLE public.ingredient_costing_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.ingredient_costing_conversions FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.ingredient_costing_conversions FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.ingredient_source_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.ingredient_source_mappings FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.ingredient_source_mappings FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.category_packaging_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.category_packaging_defaults FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.category_packaging_defaults FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.recipe_packaging_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.recipe_packaging_defaults FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.recipe_packaging_defaults FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.entity_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.entity_flags FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.entity_flags FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.cost_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY platecost_read ON public.cost_alerts FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
CREATE POLICY platecost_write ON public.cost_alerts FOR ALL TO authenticated USING (public.app_has_tenant_access(tenant_id,'manager')) WITH CHECK (public.app_has_tenant_access(tenant_id,'manager'));

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_self_read ON public.tenant_memberships FOR SELECT TO authenticated USING (auth_user_id=(SELECT auth.user_id()));

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_member_read ON public.tenants FOR SELECT TO authenticated USING (public.app_has_tenant_access(id,'viewer'));

-- Sensitive integration secret rows remain server-only: RLS enabled with no authenticated policies.
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_bootstrap_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipe_versions_read ON public.recipe_versions FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.recipes r WHERE r.id=recipe_versions.recipe_id AND public.app_has_tenant_access(r.tenant_id,'viewer')));
CREATE POLICY recipe_versions_write ON public.recipe_versions FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.recipes r WHERE r.id=recipe_versions.recipe_id AND public.app_has_tenant_access(r.tenant_id,'manager'))) WITH CHECK (EXISTS(SELECT 1 FROM public.recipes r WHERE r.id=recipe_versions.recipe_id AND public.app_has_tenant_access(r.tenant_id,'manager')));

ALTER TABLE public.recipe_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipe_components_read ON public.recipe_components FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.recipe_versions rv JOIN public.recipes r ON r.id=rv.recipe_id WHERE rv.id=recipe_components.recipe_version_id AND public.app_has_tenant_access(r.tenant_id,'viewer')));
CREATE POLICY recipe_components_write ON public.recipe_components FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.recipe_versions rv JOIN public.recipes r ON r.id=rv.recipe_id WHERE rv.id=recipe_components.recipe_version_id AND public.app_has_tenant_access(r.tenant_id,'manager'))) WITH CHECK (EXISTS(SELECT 1 FROM public.recipe_versions rv JOIN public.recipes r ON r.id=rv.recipe_id WHERE rv.id=recipe_components.recipe_version_id AND public.app_has_tenant_access(r.tenant_id,'manager')));

ALTER TABLE public.recipe_packaging ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipe_packaging_read ON public.recipe_packaging FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.recipes r WHERE r.id=recipe_packaging.recipe_id AND public.app_has_tenant_access(r.tenant_id,'viewer')));
CREATE POLICY recipe_packaging_write ON public.recipe_packaging FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.recipes r WHERE r.id=recipe_packaging.recipe_id AND public.app_has_tenant_access(r.tenant_id,'manager'))) WITH CHECK (EXISTS(SELECT 1 FROM public.recipes r JOIN public.packaging_items p ON p.id=recipe_packaging.packaging_item_id WHERE r.id=recipe_packaging.recipe_id AND p.tenant_id=r.tenant_id AND public.app_has_tenant_access(r.tenant_id,'manager')));

ALTER TABLE public.packaging_set_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY packaging_set_items_read ON public.packaging_set_items FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.packaging_sets ps WHERE ps.id=packaging_set_items.packaging_set_id AND public.app_has_tenant_access(ps.tenant_id,'viewer')));
CREATE POLICY packaging_set_items_write ON public.packaging_set_items FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.packaging_sets ps WHERE ps.id=packaging_set_items.packaging_set_id AND public.app_has_tenant_access(ps.tenant_id,'manager'))) WITH CHECK (EXISTS(SELECT 1 FROM public.packaging_sets ps JOIN public.packaging_items pi ON pi.id=packaging_set_items.packaging_item_id WHERE ps.id=packaging_set_items.packaging_set_id AND pi.tenant_id=ps.tenant_id AND public.app_has_tenant_access(ps.tenant_id,'manager')));

ALTER TABLE public.costing_snapshot_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY snapshot_lines_read ON public.costing_snapshot_lines FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.costing_snapshots s WHERE s.id=costing_snapshot_lines.snapshot_id AND public.app_has_tenant_access(s.tenant_id,'viewer')));
CREATE POLICY snapshot_lines_write ON public.costing_snapshot_lines FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.costing_snapshots s WHERE s.id=costing_snapshot_lines.snapshot_id AND public.app_has_tenant_access(s.tenant_id,'manager'))) WITH CHECK (EXISTS(SELECT 1 FROM public.costing_snapshots s WHERE s.id=costing_snapshot_lines.snapshot_id AND public.app_has_tenant_access(s.tenant_id,'manager')));

-- Currently server-only recipe workflow tables; no direct authenticated Data API policies.
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_photos ENABLE ROW LEVEL SECURITY;
