CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id TEXT,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_name TEXT,
  before_data JSONB,
  after_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_events_tenant_created_idx ON audit_events(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_tenant_entity_idx ON audit_events(tenant_id,entity_type,entity_id);
CREATE INDEX IF NOT EXISTS audit_events_tenant_actor_idx ON audit_events(tenant_id,actor_user_id,created_at DESC);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_events_read ON public.audit_events FOR SELECT TO authenticated USING (public.app_has_tenant_access(tenant_id,'viewer'));
