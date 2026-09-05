-- ============================================================
-- Phase: Phone number enhancement + call enhancements + agent versioning
-- ============================================================

-- Provisioning status enum for phone numbers
CREATE TYPE public.provisioning_status AS ENUM (
  'pending', 'provisioning', 'active', 'error', 'disabled'
);

-- ---- Extend phone_numbers table ----
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS provider_number_id text,
  ADD COLUMN IF NOT EXISTS inbound_trunk_id text,
  ADD COLUMN IF NOT EXISTS outbound_trunk_id text,
  ADD COLUMN IF NOT EXISTS dispatch_rule_id text,
  ADD COLUMN IF NOT EXISTS status public.provisioning_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outbound_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_provisioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Index for webhook lookups by phone number
CREATE INDEX IF NOT EXISTS phone_numbers_phone_idx
  ON public.phone_numbers(phone_number);

-- ---- Extend calls table ----
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS room_name text,
  ADD COLUMN IF NOT EXISTS phone_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS telephony_cost numeric(10,4),
  ADD COLUMN IF NOT EXISTS livekit_cost numeric(10,4),
  ADD COLUMN IF NOT EXISTS llm_cost numeric(10,4),
  ADD COLUMN IF NOT EXISTS stt_cost numeric(10,4),
  ADD COLUMN IF NOT EXISTS tts_cost numeric(10,4),
  ADD COLUMN IF NOT EXISTS total_cost numeric(10,4),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';

-- Index for room name lookups (live monitoring)
CREATE INDEX IF NOT EXISTS calls_room_name_idx ON public.calls(room_name);
-- Index for provider call ID (idempotency)
CREATE INDEX IF NOT EXISTS calls_provider_call_id_idx ON public.calls(provider_call_id);
-- Index for status (live calls query)
CREATE INDEX IF NOT EXISTS calls_status_idx ON public.calls(status) WHERE status IN ('ringing', 'in_progress');

-- ---- Agent versioning ----
ALTER TABLE public.agent_configs
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.agent_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_config_id uuid NOT NULL REFERENCES public.agent_configs(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  version integer NOT NULL,
  config_snapshot jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid,
  UNIQUE (agent_config_id, version)
);

CREATE INDEX IF NOT EXISTS agent_config_versions_agent_idx
  ON public.agent_config_versions(agent_config_id, version DESC);

GRANT SELECT, INSERT ON public.agent_config_versions TO authenticated;
GRANT ALL ON public.agent_config_versions TO service_role;
ALTER TABLE public.agent_config_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view agent versions" ON public.agent_config_versions
  FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY "Managers publish agent versions" ON public.agent_config_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner','manager']::public.business_role[]));

-- ---- Usage tracking ----
CREATE TABLE IF NOT EXISTS public.usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_calls integer NOT NULL DEFAULT 0,
  total_minutes numeric(10,2) NOT NULL DEFAULT 0,
  total_cost numeric(10,4) NOT NULL DEFAULT 0,
  inbound_calls integer NOT NULL DEFAULT 0,
  outbound_calls integer NOT NULL DEFAULT 0,
  escalated_calls integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS usage_records_business_idx
  ON public.usage_records(business_id, period_start DESC);

GRANT SELECT ON public.usage_records TO authenticated;
GRANT ALL ON public.usage_records TO service_role;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view usage" ON public.usage_records
  FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));

-- ---- Alert rules ----
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  condition_type text NOT NULL,
  condition_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_channels jsonb NOT NULL DEFAULT '["email"]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO authenticated;
GRANT ALL ON public.alert_rules TO service_role;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage alerts" ON public.alert_rules FOR ALL TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));
CREATE TRIGGER alert_rules_touch BEFORE UPDATE ON public.alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- Batch call jobs ----
CREATE TYPE public.batch_status AS ENUM ('draft', 'queued', 'running', 'paused', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS public.batch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_config_id uuid NOT NULL REFERENCES public.agent_configs(id) ON DELETE CASCADE,
  name text NOT NULL,
  status public.batch_status NOT NULL DEFAULT 'draft',
  total_contacts integer NOT NULL DEFAULT 0,
  completed_contacts integer NOT NULL DEFAULT 0,
  failed_contacts integer NOT NULL DEFAULT 0,
  max_concurrency integer NOT NULL DEFAULT 1,
  created_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.batch_job_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_job_id uuid NOT NULL REFERENCES public.batch_jobs(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'pending',
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS batch_job_contacts_job_idx
  ON public.batch_job_contacts(batch_job_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_job_contacts TO authenticated;
GRANT ALL ON public.batch_jobs TO service_role;
GRANT ALL ON public.batch_job_contacts TO service_role;

ALTER TABLE public.batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_job_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage batch jobs" ON public.batch_jobs FOR ALL TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "Members manage batch contacts" ON public.batch_job_contacts FOR ALL TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

CREATE TRIGGER batch_jobs_touch BEFORE UPDATE ON public.batch_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
