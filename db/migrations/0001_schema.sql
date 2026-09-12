-- Trellient Voice — baseline schema for plain Postgres 16.
--
-- Generated from the schema the earlier migrations built, minus everything
-- Supabase-specific: no auth schema, no Supabase roles or grants, and no
-- row-level-security policies. Workspace access is enforced by the server
-- functions instead (src/lib/auth/access.ts).
--
-- Add schema changes as new numbered files next to this one.

SET LOCAL check_function_bodies = false;

-- type: appointment_status
CREATE TYPE public.appointment_status AS ENUM (
    'requested',
    'confirmed',
    'rescheduled',
    'cancelled',
    'completed'
);

-- type: approval_decision
CREATE TYPE public.approval_decision AS ENUM (
    'approved',
    'edited',
    'rejected'
);

-- type: batch_status
CREATE TYPE public.batch_status AS ENUM (
    'draft',
    'queued',
    'running',
    'paused',
    'completed',
    'failed'
);

-- type: business_role
CREATE TYPE public.business_role AS ENUM (
    'owner',
    'manager',
    'agent'
);

-- type: call_direction
CREATE TYPE public.call_direction AS ENUM (
    'inbound',
    'outbound'
);

-- type: call_status
CREATE TYPE public.call_status AS ENUM (
    'ringing',
    'in_progress',
    'completed',
    'missed',
    'failed'
);

-- type: escalation_status
CREATE TYPE public.escalation_status AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'rejected'
);

-- type: provisioning_status
CREATE TYPE public.provisioning_status AS ENUM (
    'pending',
    'provisioning',
    'active',
    'error',
    'disabled'
);

-- type: quote_status
CREATE TYPE public.quote_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'sent'
);

-- function: appointment_check(uuid, date, time without time zone)
CREATE FUNCTION public.appointment_check(_business_id uuid, _date date, _time time without time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE cfg record; open_t time; close_t time; days jsonb; dow int; taken int;
BEGIN
  SELECT * INTO cfg FROM public.agent_configs WHERE business_id = _business_id ORDER BY created_at LIMIT 1;
  IF cfg.id IS NULL THEN RETURN jsonb_build_object('available', false, 'reason', 'no_agent_config'); END IF;
  open_t := (cfg.business_hours->>'open')::time;
  close_t := (cfg.business_hours->>'close')::time;
  days := cfg.business_hours->'days';
  dow := EXTRACT(DOW FROM _date)::int;
  IF days IS NOT NULL AND NOT (days @> to_jsonb(dow)) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'closed_that_day', 'open', open_t, 'close', close_t);
  END IF;
  IF _time < open_t OR _time >= close_t THEN
    RETURN jsonb_build_object('available', false, 'reason', 'outside_business_hours', 'open', open_t, 'close', close_t);
  END IF;
  SELECT count(*) INTO taken FROM public.appointments
    WHERE business_id = _business_id AND requested_date = _date AND requested_time = _time
      AND status IN ('requested','confirmed');
  IF taken >= 3 THEN
    RETURN jsonb_build_object('available', false, 'reason', 'slot_full', 'open', open_t, 'close', close_t);
  END IF;
  RETURN jsonb_build_object('available', true, 'open', open_t, 'close', close_t);
END; $$;

-- function: discount_request(uuid, uuid, numeric, uuid, uuid, text)
CREATE FUNCTION public.discount_request(_business_id uuid, _product_id uuid, _requested_price numeric, _customer_id uuid DEFAULT NULL::uuid, _call_id uuid DEFAULT NULL::uuid, _summary text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE p record; r record; esc_id uuid; floor_price numeric;
BEGIN

  SELECT * INTO p FROM public.products WHERE id = _product_id AND business_id = _business_id;
  IF p.id IS NULL THEN RETURN jsonb_build_object('accepted', false, 'reason', 'unknown_product'); END IF;
  SELECT * INTO r FROM public.pricing_rules
    WHERE business_id = _business_id AND product_id = p.id AND active LIMIT 1;

  floor_price := COALESCE(r.minimum_price,
    p.price - (p.price * COALESCE(r.maximum_discount_percent, 0) / 100));

  IF r.id IS NOT NULL AND NOT r.approval_required AND _requested_price >= floor_price THEN
    RETURN jsonb_build_object('accepted', true, 'approved_price', _requested_price,
      'listed_price', p.price, 'approval_required', false);
  END IF;

  INSERT INTO public.escalations
    (business_id, call_id, customer_id, reason, summary, status,
     requested_price, listed_price, product_id)
  VALUES (_business_id, _call_id, _customer_id, 'discount_approval',
     COALESCE(_summary, 'Customer requested a special price on ' || p.name),
     'open', _requested_price, p.price, p.id)
  RETURNING id INTO esc_id;

  RETURN jsonb_build_object('accepted', false, 'approval_required', true,
    'escalation_id', esc_id, 'listed_price', p.price, 'minimum_price', floor_price);
END; $$;

-- function: pricing_lookup(uuid, text)
CREATE FUNCTION public.pricing_lookup(_business_id uuid, _query text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE p record; r record;
BEGIN

  SELECT * INTO p FROM public.products
   WHERE business_id = _business_id AND active AND name ILIKE '%' || _query || '%'
   ORDER BY length(name) ASC LIMIT 1;
  IF p.id IS NOT NULL THEN
    SELECT * INTO r FROM public.pricing_rules
      WHERE business_id = _business_id AND product_id = p.id AND active LIMIT 1;
    RETURN jsonb_build_object(
      'found', true, 'kind', 'product', 'id', p.id, 'name', p.name,
      'listed_price', p.price, 'currency', p.currency, 'stock_status', p.stock_status,
      'minimum_price', r.minimum_price,
      'max_discount_percent', COALESCE(r.maximum_discount_percent, 0),
      'discount_allowed_without_approval',
        CASE WHEN r.id IS NULL THEN false ELSE (NOT r.approval_required AND COALESCE(r.maximum_discount_percent,0) > 0) END,
      'approval_required', COALESCE(r.approval_required, true));
  END IF;

  SELECT * INTO p FROM public.services
   WHERE business_id = _business_id AND active AND name ILIKE '%' || _query || '%'
   ORDER BY length(name) ASC LIMIT 1;
  IF p.id IS NOT NULL THEN
    SELECT * INTO r FROM public.pricing_rules
      WHERE business_id = _business_id AND service_id = p.id AND active LIMIT 1;
    RETURN jsonb_build_object(
      'found', true, 'kind', 'service', 'id', p.id, 'name', p.name,
      'listed_price', p.base_price, 'currency', 'INR',
      'minimum_price', r.minimum_price,
      'max_discount_percent', COALESCE(r.maximum_discount_percent, 0),
      'discount_allowed_without_approval',
        CASE WHEN r.id IS NULL THEN false ELSE (NOT r.approval_required AND COALESCE(r.maximum_discount_percent,0) > 0) END,
      'approval_required', COALESCE(r.approval_required, true));
  END IF;

  RETURN jsonb_build_object('found', false, 'query', _query);
END; $$;

-- function: touch_updated_at()
CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- table: agent_config_versions
CREATE TABLE public.agent_config_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_config_id uuid NOT NULL,
    business_id uuid NOT NULL,
    version integer NOT NULL,
    config_snapshot jsonb NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    published_by uuid
);

-- table: agent_configs
CREATE TABLE public.agent_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text DEFAULT 'Trellient Assistant'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    greeting text DEFAULT 'Thank you for calling. How can I help you today?'::text NOT NULL,
    personality text DEFAULT 'Calm, professional, concise.'::text NOT NULL,
    business_description text,
    primary_language text DEFAULT 'en'::text NOT NULL,
    supported_languages text[] DEFAULT ARRAY['en'::text, 'hi'::text, 'mr'::text] NOT NULL,
    model_provider text DEFAULT 'openai_realtime'::text NOT NULL,
    model_name text DEFAULT 'gpt-4o-realtime-preview'::text NOT NULL,
    voice_name text DEFAULT 'alloy'::text NOT NULL,
    voice_speed numeric(3,2) DEFAULT 1.0 NOT NULL,
    system_instructions text,
    allowed_actions text[] DEFAULT ARRAY['answer_questions'::text, 'lookup_pricing'::text, 'create_appointment'::text, 'create_quote'::text] NOT NULL,
    restricted_actions text[] DEFAULT ARRAY['negotiate_price'::text, 'confirm_payment'::text] NOT NULL,
    approval_required_actions text[] DEFAULT ARRAY['discount'::text] NOT NULL,
    escalation_enabled boolean DEFAULT true NOT NULL,
    escalation_rules text,
    business_hours jsonb DEFAULT '{"days": [1, 2, 3, 4, 5, 6, 0], "open": "09:00", "close": "20:00"}'::jsonb NOT NULL,
    after_hours_response text,
    max_call_seconds integer DEFAULT 900 NOT NULL,
    recording_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    published_at timestamp with time zone,
    is_draft boolean DEFAULT true NOT NULL
);

-- table: agent_knowledge
CREATE TABLE public.agent_knowledge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    source_type text DEFAULT 'manual'::text NOT NULL,
    source_reference text,
    embedding jsonb,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: agent_tools
CREATE TABLE public.agent_tools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    agent_config_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    tool_type text DEFAULT 'custom'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: alert_rules
CREATE TABLE public.alert_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    condition_type text NOT NULL,
    condition_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    notification_channels jsonb DEFAULT '["email"]'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_triggered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: appointments
CREATE TABLE public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    customer_id uuid,
    requested_date date NOT NULL,
    requested_time time without time zone NOT NULL,
    status public.appointment_status DEFAULT 'requested'::public.appointment_status NOT NULL,
    notes text,
    source_call_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: approvals
CREATE TABLE public.approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    escalation_id uuid,
    decided_by uuid NOT NULL,
    decision public.approval_decision NOT NULL,
    approved_price numeric(14,2),
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: batch_job_contacts
CREATE TABLE public.batch_job_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_job_id uuid NOT NULL,
    business_id uuid NOT NULL,
    phone_number text NOT NULL,
    name text,
    status text DEFAULT 'pending'::text NOT NULL,
    call_id uuid,
    attempted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: batch_jobs
CREATE TABLE public.batch_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    agent_config_id uuid NOT NULL,
    name text NOT NULL,
    status public.batch_status DEFAULT 'draft'::public.batch_status NOT NULL,
    total_contacts integer DEFAULT 0 NOT NULL,
    completed_contacts integer DEFAULT 0 NOT NULL,
    failed_contacts integer DEFAULT 0 NOT NULL,
    max_concurrency integer DEFAULT 1 NOT NULL,
    created_by uuid,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: business_policies
CREATE TABLE public.business_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    policy_type text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: business_users
CREATE TABLE public.business_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    auth_user_id uuid NOT NULL,
    role public.business_role DEFAULT 'owner'::public.business_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: businesses
CREATE TABLE public.businesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    legal_name text,
    phone text,
    email text,
    address text,
    timezone text DEFAULT 'Asia/Kolkata'::text NOT NULL,
    default_language text DEFAULT 'en'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: call_events
CREATE TABLE public.call_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    call_id uuid NOT NULL,
    business_id uuid NOT NULL,
    event_type text NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: call_transcripts
CREATE TABLE public.call_transcripts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    call_id uuid NOT NULL,
    business_id uuid NOT NULL,
    speaker text NOT NULL,
    text text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

-- table: calls
CREATE TABLE public.calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    customer_id uuid,
    agent_config_id uuid,
    provider text DEFAULT 'browser'::text NOT NULL,
    provider_call_id text,
    direction public.call_direction DEFAULT 'inbound'::public.call_direction NOT NULL,
    caller_number text,
    destination_number text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_seconds integer,
    status public.call_status DEFAULT 'in_progress'::public.call_status NOT NULL,
    language text,
    intent text,
    outcome text,
    escalation_required boolean DEFAULT false NOT NULL,
    escalation_reason text,
    recording_url text,
    summary text,
    tools_used text[] DEFAULT ARRAY[]::text[] NOT NULL,
    latency_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    room_name text,
    phone_number_id uuid,
    telephony_cost numeric(10,4),
    livekit_cost numeric(10,4),
    llm_cost numeric(10,4),
    stt_cost numeric(10,4),
    tts_cost numeric(10,4),
    total_cost numeric(10,4),
    currency text DEFAULT 'INR'::text NOT NULL
);

-- table: customers
CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text,
    phone text NOT NULL,
    email text,
    preferred_language text DEFAULT 'en'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: escalations
CREATE TABLE public.escalations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    call_id uuid,
    customer_id uuid,
    reason text NOT NULL,
    summary text,
    status public.escalation_status DEFAULT 'open'::public.escalation_status NOT NULL,
    assigned_to uuid,
    requested_price numeric(14,2),
    listed_price numeric(14,2),
    product_id uuid,
    service_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone
);

-- table: phone_numbers
CREATE TABLE public.phone_numbers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    agent_config_id uuid,
    phone_number text NOT NULL,
    label text,
    provider text DEFAULT 'exotel'::text NOT NULL,
    inbound_enabled boolean DEFAULT true NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_number_id text,
    inbound_trunk_id text,
    outbound_trunk_id text,
    dispatch_rule_id text,
    status public.provisioning_status DEFAULT 'pending'::public.provisioning_status NOT NULL,
    outbound_enabled boolean DEFAULT false NOT NULL,
    capabilities jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_provisioned_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

-- table: pricing_rules
CREATE TABLE public.pricing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    product_id uuid,
    service_id uuid,
    minimum_price numeric(14,2),
    maximum_discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
    approval_required boolean DEFAULT true NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: products
CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    price numeric(14,2),
    currency text DEFAULT 'INR'::text NOT NULL,
    stock_status text DEFAULT 'in_stock'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: quote_items
CREATE TABLE public.quote_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_id uuid NOT NULL,
    business_id uuid NOT NULL,
    product_id uuid,
    service_id uuid,
    description text NOT NULL,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    unit_price numeric(14,2) DEFAULT 0 NOT NULL,
    total numeric(14,2) DEFAULT 0 NOT NULL
);

-- table: quotes
CREATE TABLE public.quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    customer_id uuid,
    quote_number text NOT NULL,
    status public.quote_status DEFAULT 'draft'::public.quote_status NOT NULL,
    subtotal numeric(14,2) DEFAULT 0 NOT NULL,
    tax numeric(14,2) DEFAULT 0 NOT NULL,
    discount numeric(14,2) DEFAULT 0 NOT NULL,
    total numeric(14,2) DEFAULT 0 NOT NULL,
    approval_required boolean DEFAULT false NOT NULL,
    approved_by uuid,
    source_call_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: services
CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    base_price numeric(14,2),
    duration_minutes integer,
    active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: usage_records
CREATE TABLE public.usage_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_calls integer DEFAULT 0 NOT NULL,
    total_minutes numeric(10,2) DEFAULT 0 NOT NULL,
    total_cost numeric(10,4) DEFAULT 0 NOT NULL,
    inbound_calls integer DEFAULT 0 NOT NULL,
    outbound_calls integer DEFAULT 0 NOT NULL,
    escalated_calls integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- table: user_sessions
CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

-- table: users
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sign_in_at timestamp with time zone
);

-- constraint: agent_config_versions agent_config_versions_agent_config_id_version_key
ALTER TABLE ONLY public.agent_config_versions
    ADD CONSTRAINT agent_config_versions_agent_config_id_version_key UNIQUE (agent_config_id, version);

-- constraint: agent_config_versions agent_config_versions_pkey
ALTER TABLE ONLY public.agent_config_versions
    ADD CONSTRAINT agent_config_versions_pkey PRIMARY KEY (id);

-- constraint: agent_configs agent_configs_pkey
ALTER TABLE ONLY public.agent_configs
    ADD CONSTRAINT agent_configs_pkey PRIMARY KEY (id);

-- constraint: agent_knowledge agent_knowledge_pkey
ALTER TABLE ONLY public.agent_knowledge
    ADD CONSTRAINT agent_knowledge_pkey PRIMARY KEY (id);

-- constraint: agent_tools agent_tools_pkey
ALTER TABLE ONLY public.agent_tools
    ADD CONSTRAINT agent_tools_pkey PRIMARY KEY (id);

-- constraint: alert_rules alert_rules_pkey
ALTER TABLE ONLY public.alert_rules
    ADD CONSTRAINT alert_rules_pkey PRIMARY KEY (id);

-- constraint: appointments appointments_pkey
ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);

-- constraint: approvals approvals_pkey
ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_pkey PRIMARY KEY (id);

-- constraint: batch_job_contacts batch_job_contacts_pkey
ALTER TABLE ONLY public.batch_job_contacts
    ADD CONSTRAINT batch_job_contacts_pkey PRIMARY KEY (id);

-- constraint: batch_jobs batch_jobs_pkey
ALTER TABLE ONLY public.batch_jobs
    ADD CONSTRAINT batch_jobs_pkey PRIMARY KEY (id);

-- constraint: business_policies business_policies_pkey
ALTER TABLE ONLY public.business_policies
    ADD CONSTRAINT business_policies_pkey PRIMARY KEY (id);

-- constraint: business_users business_users_business_id_auth_user_id_key
ALTER TABLE ONLY public.business_users
    ADD CONSTRAINT business_users_business_id_auth_user_id_key UNIQUE (business_id, auth_user_id);

-- constraint: business_users business_users_pkey
ALTER TABLE ONLY public.business_users
    ADD CONSTRAINT business_users_pkey PRIMARY KEY (id);

-- constraint: businesses businesses_pkey
ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);

-- constraint: call_events call_events_pkey
ALTER TABLE ONLY public.call_events
    ADD CONSTRAINT call_events_pkey PRIMARY KEY (id);

-- constraint: call_transcripts call_transcripts_pkey
ALTER TABLE ONLY public.call_transcripts
    ADD CONSTRAINT call_transcripts_pkey PRIMARY KEY (id);

-- constraint: calls calls_pkey
ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_pkey PRIMARY KEY (id);

-- constraint: customers customers_business_id_phone_key
ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_business_id_phone_key UNIQUE (business_id, phone);

-- constraint: customers customers_pkey
ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);

-- constraint: escalations escalations_pkey
ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_pkey PRIMARY KEY (id);

-- constraint: phone_numbers phone_numbers_business_id_phone_number_key
ALTER TABLE ONLY public.phone_numbers
    ADD CONSTRAINT phone_numbers_business_id_phone_number_key UNIQUE (business_id, phone_number);

-- constraint: phone_numbers phone_numbers_pkey
ALTER TABLE ONLY public.phone_numbers
    ADD CONSTRAINT phone_numbers_pkey PRIMARY KEY (id);

-- constraint: pricing_rules pricing_rules_pkey
ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);

-- constraint: products products_pkey
ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);

-- constraint: quote_items quote_items_pkey
ALTER TABLE ONLY public.quote_items
    ADD CONSTRAINT quote_items_pkey PRIMARY KEY (id);

-- constraint: quotes quotes_business_id_quote_number_key
ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_business_id_quote_number_key UNIQUE (business_id, quote_number);

-- constraint: quotes quotes_pkey
ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);

-- constraint: services services_pkey
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);

-- constraint: usage_records usage_records_business_id_period_start_period_end_key
ALTER TABLE ONLY public.usage_records
    ADD CONSTRAINT usage_records_business_id_period_start_period_end_key UNIQUE (business_id, period_start, period_end);

-- constraint: usage_records usage_records_pkey
ALTER TABLE ONLY public.usage_records
    ADD CONSTRAINT usage_records_pkey PRIMARY KEY (id);

-- constraint: user_sessions user_sessions_pkey
ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);

-- constraint: user_sessions user_sessions_token_hash_key
ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_hash_key UNIQUE (token_hash);

-- constraint: users users_pkey
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- index: agent_config_versions_agent_idx
CREATE INDEX agent_config_versions_agent_idx ON public.agent_config_versions USING btree (agent_config_id, version DESC);

-- index: agent_configs_business_idx
CREATE INDEX agent_configs_business_idx ON public.agent_configs USING btree (business_id);

-- index: agent_knowledge_business_idx
CREATE INDEX agent_knowledge_business_idx ON public.agent_knowledge USING btree (business_id);

-- index: appointments_business_idx
CREATE INDEX appointments_business_idx ON public.appointments USING btree (business_id, requested_date);

-- index: approvals_business_idx
CREATE INDEX approvals_business_idx ON public.approvals USING btree (business_id, created_at DESC);

-- index: batch_job_contacts_job_idx
CREATE INDEX batch_job_contacts_job_idx ON public.batch_job_contacts USING btree (batch_job_id);

-- index: business_policies_business_idx
CREATE INDEX business_policies_business_idx ON public.business_policies USING btree (business_id);

-- index: business_users_auth_user_idx
CREATE INDEX business_users_auth_user_idx ON public.business_users USING btree (auth_user_id);

-- index: call_events_call_idx
CREATE INDEX call_events_call_idx ON public.call_events USING btree (call_id, created_at);

-- index: call_transcripts_call_idx
CREATE INDEX call_transcripts_call_idx ON public.call_transcripts USING btree (call_id, "timestamp");

-- index: calls_business_idx
CREATE INDEX calls_business_idx ON public.calls USING btree (business_id, started_at DESC);

-- index: calls_provider_call_id_idx
CREATE INDEX calls_provider_call_id_idx ON public.calls USING btree (provider_call_id);

-- index: calls_room_name_idx
CREATE INDEX calls_room_name_idx ON public.calls USING btree (room_name);

-- index: calls_status_idx
CREATE INDEX calls_status_idx ON public.calls USING btree (status) WHERE (status = ANY (ARRAY['ringing'::public.call_status, 'in_progress'::public.call_status]));

-- index: escalations_business_idx
CREATE INDEX escalations_business_idx ON public.escalations USING btree (business_id, created_at DESC);

-- index: phone_numbers_phone_idx
CREATE INDEX phone_numbers_phone_idx ON public.phone_numbers USING btree (phone_number);

-- index: pricing_rules_business_idx
CREATE INDEX pricing_rules_business_idx ON public.pricing_rules USING btree (business_id);

-- index: products_business_idx
CREATE INDEX products_business_idx ON public.products USING btree (business_id);

-- index: quote_items_quote_idx
CREATE INDEX quote_items_quote_idx ON public.quote_items USING btree (quote_id);

-- index: services_business_idx
CREATE INDEX services_business_idx ON public.services USING btree (business_id);

-- index: usage_records_business_idx
CREATE INDEX usage_records_business_idx ON public.usage_records USING btree (business_id, period_start DESC);

-- index: user_sessions_expires_idx
CREATE INDEX user_sessions_expires_idx ON public.user_sessions USING btree (expires_at);

-- index: user_sessions_user_idx
CREATE INDEX user_sessions_user_idx ON public.user_sessions USING btree (user_id);

-- index: users_email_idx
CREATE UNIQUE INDEX users_email_idx ON public.users USING btree (lower(email));

-- trigger: agent_tools agent_tools_touch
CREATE TRIGGER agent_tools_touch BEFORE UPDATE ON public.agent_tools FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: alert_rules alert_rules_touch
CREATE TRIGGER alert_rules_touch BEFORE UPDATE ON public.alert_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: batch_jobs batch_jobs_touch
CREATE TRIGGER batch_jobs_touch BEFORE UPDATE ON public.batch_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: phone_numbers phone_numbers_touch
CREATE TRIGGER phone_numbers_touch BEFORE UPDATE ON public.phone_numbers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: agent_configs t_agent_configs
CREATE TRIGGER t_agent_configs BEFORE UPDATE ON public.agent_configs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: agent_knowledge t_agent_knowledge
CREATE TRIGGER t_agent_knowledge BEFORE UPDATE ON public.agent_knowledge FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: appointments t_appointments
CREATE TRIGGER t_appointments BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: business_policies t_business_policies
CREATE TRIGGER t_business_policies BEFORE UPDATE ON public.business_policies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: businesses t_businesses
CREATE TRIGGER t_businesses BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: customers t_customers
CREATE TRIGGER t_customers BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: pricing_rules t_pricing_rules
CREATE TRIGGER t_pricing_rules BEFORE UPDATE ON public.pricing_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: products t_products
CREATE TRIGGER t_products BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: quotes t_quotes
CREATE TRIGGER t_quotes BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- trigger: services t_services
CREATE TRIGGER t_services BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- fk constraint: agent_config_versions agent_config_versions_agent_config_id_fkey
ALTER TABLE ONLY public.agent_config_versions
    ADD CONSTRAINT agent_config_versions_agent_config_id_fkey FOREIGN KEY (agent_config_id) REFERENCES public.agent_configs(id) ON DELETE CASCADE;

-- fk constraint: agent_config_versions agent_config_versions_business_id_fkey
ALTER TABLE ONLY public.agent_config_versions
    ADD CONSTRAINT agent_config_versions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: agent_configs agent_configs_business_id_fkey
ALTER TABLE ONLY public.agent_configs
    ADD CONSTRAINT agent_configs_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: agent_knowledge agent_knowledge_business_id_fkey
ALTER TABLE ONLY public.agent_knowledge
    ADD CONSTRAINT agent_knowledge_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: agent_tools agent_tools_agent_config_id_fkey
ALTER TABLE ONLY public.agent_tools
    ADD CONSTRAINT agent_tools_agent_config_id_fkey FOREIGN KEY (agent_config_id) REFERENCES public.agent_configs(id) ON DELETE CASCADE;

-- fk constraint: agent_tools agent_tools_business_id_fkey
ALTER TABLE ONLY public.agent_tools
    ADD CONSTRAINT agent_tools_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: alert_rules alert_rules_business_id_fkey
ALTER TABLE ONLY public.alert_rules
    ADD CONSTRAINT alert_rules_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: appointments appointments_business_id_fkey
ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: appointments appointments_customer_id_fkey
ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- fk constraint: appointments appointments_source_call_id_fkey
ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_source_call_id_fkey FOREIGN KEY (source_call_id) REFERENCES public.calls(id) ON DELETE SET NULL;

-- fk constraint: approvals approvals_business_id_fkey
ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: approvals approvals_escalation_id_fkey
ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_escalation_id_fkey FOREIGN KEY (escalation_id) REFERENCES public.escalations(id) ON DELETE CASCADE;

-- fk constraint: batch_job_contacts batch_job_contacts_batch_job_id_fkey
ALTER TABLE ONLY public.batch_job_contacts
    ADD CONSTRAINT batch_job_contacts_batch_job_id_fkey FOREIGN KEY (batch_job_id) REFERENCES public.batch_jobs(id) ON DELETE CASCADE;

-- fk constraint: batch_job_contacts batch_job_contacts_business_id_fkey
ALTER TABLE ONLY public.batch_job_contacts
    ADD CONSTRAINT batch_job_contacts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: batch_job_contacts batch_job_contacts_call_id_fkey
ALTER TABLE ONLY public.batch_job_contacts
    ADD CONSTRAINT batch_job_contacts_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE SET NULL;

-- fk constraint: batch_jobs batch_jobs_agent_config_id_fkey
ALTER TABLE ONLY public.batch_jobs
    ADD CONSTRAINT batch_jobs_agent_config_id_fkey FOREIGN KEY (agent_config_id) REFERENCES public.agent_configs(id) ON DELETE CASCADE;

-- fk constraint: batch_jobs batch_jobs_business_id_fkey
ALTER TABLE ONLY public.batch_jobs
    ADD CONSTRAINT batch_jobs_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: business_policies business_policies_business_id_fkey
ALTER TABLE ONLY public.business_policies
    ADD CONSTRAINT business_policies_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: business_users business_users_business_id_fkey
ALTER TABLE ONLY public.business_users
    ADD CONSTRAINT business_users_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: call_events call_events_business_id_fkey
ALTER TABLE ONLY public.call_events
    ADD CONSTRAINT call_events_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: call_events call_events_call_id_fkey
ALTER TABLE ONLY public.call_events
    ADD CONSTRAINT call_events_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE CASCADE;

-- fk constraint: call_transcripts call_transcripts_business_id_fkey
ALTER TABLE ONLY public.call_transcripts
    ADD CONSTRAINT call_transcripts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: call_transcripts call_transcripts_call_id_fkey
ALTER TABLE ONLY public.call_transcripts
    ADD CONSTRAINT call_transcripts_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE CASCADE;

-- fk constraint: calls calls_agent_config_id_fkey
ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_agent_config_id_fkey FOREIGN KEY (agent_config_id) REFERENCES public.agent_configs(id) ON DELETE SET NULL;

-- fk constraint: calls calls_business_id_fkey
ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: calls calls_customer_id_fkey
ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- fk constraint: calls calls_phone_number_id_fkey
ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_phone_number_id_fkey FOREIGN KEY (phone_number_id) REFERENCES public.phone_numbers(id) ON DELETE SET NULL;

-- fk constraint: customers customers_business_id_fkey
ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: escalations escalations_business_id_fkey
ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: escalations escalations_call_id_fkey
ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE SET NULL;

-- fk constraint: escalations escalations_customer_id_fkey
ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- fk constraint: escalations escalations_product_id_fkey
ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

-- fk constraint: escalations escalations_service_id_fkey
ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;

-- fk constraint: phone_numbers phone_numbers_agent_config_id_fkey
ALTER TABLE ONLY public.phone_numbers
    ADD CONSTRAINT phone_numbers_agent_config_id_fkey FOREIGN KEY (agent_config_id) REFERENCES public.agent_configs(id) ON DELETE SET NULL;

-- fk constraint: phone_numbers phone_numbers_business_id_fkey
ALTER TABLE ONLY public.phone_numbers
    ADD CONSTRAINT phone_numbers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: pricing_rules pricing_rules_business_id_fkey
ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: pricing_rules pricing_rules_product_id_fkey
ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

-- fk constraint: pricing_rules pricing_rules_service_id_fkey
ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;

-- fk constraint: products products_business_id_fkey
ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: quote_items quote_items_business_id_fkey
ALTER TABLE ONLY public.quote_items
    ADD CONSTRAINT quote_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: quote_items quote_items_product_id_fkey
ALTER TABLE ONLY public.quote_items
    ADD CONSTRAINT quote_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

-- fk constraint: quote_items quote_items_quote_id_fkey
ALTER TABLE ONLY public.quote_items
    ADD CONSTRAINT quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE CASCADE;

-- fk constraint: quote_items quote_items_service_id_fkey
ALTER TABLE ONLY public.quote_items
    ADD CONSTRAINT quote_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;

-- fk constraint: quotes quotes_business_id_fkey
ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: quotes quotes_customer_id_fkey
ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- fk constraint: quotes quotes_source_call_id_fkey
ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_source_call_id_fkey FOREIGN KEY (source_call_id) REFERENCES public.calls(id) ON DELETE SET NULL;

-- fk constraint: services services_business_id_fkey
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: usage_records usage_records_business_id_fkey
ALTER TABLE ONLY public.usage_records
    ADD CONSTRAINT usage_records_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- fk constraint: user_sessions user_sessions_user_id_fkey
ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
