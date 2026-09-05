-- ============ enums ============
CREATE TYPE public.business_role AS ENUM ('owner','manager','agent');
CREATE TYPE public.call_direction AS ENUM ('inbound','outbound');
CREATE TYPE public.call_status AS ENUM ('ringing','in_progress','completed','missed','failed');
CREATE TYPE public.appointment_status AS ENUM ('requested','confirmed','rescheduled','cancelled','completed');
CREATE TYPE public.quote_status AS ENUM ('draft','pending_approval','approved','rejected','sent');
CREATE TYPE public.escalation_status AS ENUM ('open','in_progress','resolved','rejected');
CREATE TYPE public.approval_decision AS ENUM ('approved','edited','rejected');

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ core tables ============
CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  phone text,
  email text,
  address text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  default_language text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.business_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  role public.business_role NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, auth_user_id)
);
CREATE INDEX business_users_auth_user_idx ON public.business_users(auth_user_id);

-- membership helpers (security definer -> no RLS recursion)
CREATE OR REPLACE FUNCTION public.is_business_member(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_users
    WHERE business_id = _business_id AND auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_business_role(_business_id uuid, _roles public.business_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_users
    WHERE business_id = _business_id AND auth_user_id = auth.uid() AND role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM public.business_users
  WHERE auth_user_id = auth.uid()
  ORDER BY created_at ASC LIMIT 1;
$$;

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text,
  phone text NOT NULL,
  email text,
  preferred_language text NOT NULL DEFAULT 'en',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, phone)
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  price numeric(14,2),
  currency text NOT NULL DEFAULT 'INR',
  stock_status text NOT NULL DEFAULT 'in_stock',
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_business_idx ON public.products(business_id);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  base_price numeric(14,2),
  duration_minutes integer,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_business_idx ON public.services(business_id);

CREATE TABLE public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  minimum_price numeric(14,2),
  maximum_discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  approval_required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pricing_rules_business_idx ON public.pricing_rules(business_id);

CREATE TABLE public.business_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  policy_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_policies_business_idx ON public.business_policies(business_id);

CREATE TABLE public.agent_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Trellient Assistant',
  enabled boolean NOT NULL DEFAULT true,
  greeting text NOT NULL DEFAULT 'Thank you for calling. How can I help you today?',
  personality text NOT NULL DEFAULT 'Calm, professional, concise.',
  business_description text,
  primary_language text NOT NULL DEFAULT 'en',
  supported_languages text[] NOT NULL DEFAULT ARRAY['en','hi','mr'],
  model_provider text NOT NULL DEFAULT 'openai_realtime',
  model_name text NOT NULL DEFAULT 'gpt-4o-realtime-preview',
  voice_name text NOT NULL DEFAULT 'alloy',
  voice_speed numeric(3,2) NOT NULL DEFAULT 1.0,
  system_instructions text,
  allowed_actions text[] NOT NULL DEFAULT ARRAY['answer_questions','lookup_pricing','create_appointment','create_quote'],
  restricted_actions text[] NOT NULL DEFAULT ARRAY['negotiate_price','confirm_payment'],
  approval_required_actions text[] NOT NULL DEFAULT ARRAY['discount'],
  escalation_enabled boolean NOT NULL DEFAULT true,
  escalation_rules text,
  business_hours jsonb NOT NULL DEFAULT '{"open":"09:00","close":"20:00","days":[1,2,3,4,5,6,0]}'::jsonb,
  after_hours_response text,
  max_call_seconds integer NOT NULL DEFAULT 900,
  recording_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_configs_business_idx ON public.agent_configs(business_id);

CREATE TABLE public.agent_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  source_type text NOT NULL DEFAULT 'manual',
  source_reference text,
  embedding jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_knowledge_business_idx ON public.agent_knowledge(business_id);

CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  agent_config_id uuid REFERENCES public.agent_configs(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'browser',
  provider_call_id text,
  direction public.call_direction NOT NULL DEFAULT 'inbound',
  caller_number text,
  destination_number text,
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  status public.call_status NOT NULL DEFAULT 'in_progress',
  language text,
  intent text,
  outcome text,
  escalation_required boolean NOT NULL DEFAULT false,
  escalation_reason text,
  recording_url text,
  summary text,
  tools_used text[] NOT NULL DEFAULT ARRAY[]::text[],
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calls_business_idx ON public.calls(business_id, started_at DESC);

CREATE TABLE public.call_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  speaker text NOT NULL,
  text text NOT NULL,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX call_transcripts_call_idx ON public.call_transcripts(call_id, "timestamp");

CREATE TABLE public.call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_events_call_idx ON public.call_events(call_id, created_at);

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  requested_date date NOT NULL,
  requested_time time NOT NULL,
  status public.appointment_status NOT NULL DEFAULT 'requested',
  notes text,
  source_call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointments_business_idx ON public.appointments(business_id, requested_date);

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  quote_number text NOT NULL,
  status public.quote_status NOT NULL DEFAULT 'draft',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  approval_required boolean NOT NULL DEFAULT false,
  approved_by uuid,
  source_call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, quote_number)
);

CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX quote_items_quote_idx ON public.quote_items(quote_id);

CREATE TABLE public.escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  reason text NOT NULL,
  summary text,
  status public.escalation_status NOT NULL DEFAULT 'open',
  assigned_to uuid,
  requested_price numeric(14,2),
  listed_price numeric(14,2),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX escalations_business_idx ON public.escalations(business_id, created_at DESC);

CREATE TABLE public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  escalation_id uuid REFERENCES public.escalations(id) ON DELETE CASCADE,
  decided_by uuid NOT NULL,
  decision public.approval_decision NOT NULL,
  approved_price numeric(14,2),
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approvals_business_idx ON public.approvals(business_id, created_at DESC);

-- ============ updated_at triggers ============
CREATE TRIGGER t_businesses BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_customers BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_products BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_services BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_pricing_rules BEFORE UPDATE ON public.pricing_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_business_policies BEFORE UPDATE ON public.business_policies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_agent_configs BEFORE UPDATE ON public.agent_configs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_agent_knowledge BEFORE UPDATE ON public.agent_knowledge FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_appointments BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_quotes BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ grants ============
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.businesses, public.business_users, public.customers, public.products,
  public.services, public.pricing_rules, public.business_policies, public.agent_configs,
  public.agent_knowledge, public.calls, public.call_transcripts, public.call_events,
  public.appointments, public.quotes, public.quote_items, public.escalations, public.approvals
  TO authenticated;
GRANT ALL ON
  public.businesses, public.business_users, public.customers, public.products,
  public.services, public.pricing_rules, public.business_policies, public.agent_configs,
  public.agent_knowledge, public.calls, public.call_transcripts, public.call_events,
  public.appointments, public.quotes, public.quote_items, public.escalations, public.approvals
  TO service_role;

-- ============ RLS ============
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY businesses_member_select ON public.businesses FOR SELECT TO authenticated USING (public.is_business_member(id));
CREATE POLICY businesses_owner_update ON public.businesses FOR UPDATE TO authenticated USING (public.has_business_role(id, ARRAY['owner','manager']::public.business_role[])) WITH CHECK (public.has_business_role(id, ARRAY['owner','manager']::public.business_role[]));

CREATE POLICY business_users_self_select ON public.business_users FOR SELECT TO authenticated USING (auth_user_id = auth.uid() OR public.is_business_member(business_id));
CREATE POLICY business_users_owner_manage ON public.business_users FOR ALL TO authenticated USING (public.has_business_role(business_id, ARRAY['owner']::public.business_role[])) WITH CHECK (public.has_business_role(business_id, ARRAY['owner']::public.business_role[]));

CREATE POLICY customers_member_all ON public.customers FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY products_member_all ON public.products FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY services_member_all ON public.services FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY pricing_rules_member_all ON public.pricing_rules FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY business_policies_member_all ON public.business_policies FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY agent_configs_member_all ON public.agent_configs FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY agent_knowledge_member_all ON public.agent_knowledge FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY calls_member_all ON public.calls FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY call_transcripts_member_all ON public.call_transcripts FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY call_events_member_all ON public.call_events FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY appointments_member_all ON public.appointments FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY quotes_member_all ON public.quotes FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY quote_items_member_all ON public.quote_items FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY escalations_member_all ON public.escalations FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY approvals_member_select ON public.approvals FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY approvals_manager_insert ON public.approvals FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id, ARRAY['owner','manager']::public.business_role[]) AND decided_by = auth.uid());

-- ============ business rule functions (single source of truth) ============
CREATE OR REPLACE FUNCTION public.pricing_lookup(_business_id uuid, _query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; r record; result jsonb;
BEGIN
  SELECT * INTO p FROM public.products
   WHERE business_id = _business_id AND active AND name ILIKE '%' || _query || '%'
   ORDER BY length(name) ASC LIMIT 1;
  IF p.id IS NOT NULL THEN
    SELECT * INTO r FROM public.pricing_rules
      WHERE business_id = _business_id AND product_id = p.id AND active LIMIT 1;
    result := jsonb_build_object(
      'found', true, 'kind', 'product', 'id', p.id, 'name', p.name,
      'listed_price', p.price, 'currency', p.currency, 'stock_status', p.stock_status,
      'minimum_price', r.minimum_price,
      'max_discount_percent', COALESCE(r.maximum_discount_percent, 0),
      'discount_allowed_without_approval',
        CASE WHEN r.id IS NULL THEN false ELSE (NOT r.approval_required AND COALESCE(r.maximum_discount_percent,0) > 0) END,
      'approval_required', COALESCE(r.approval_required, true));
    RETURN result;
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

CREATE OR REPLACE FUNCTION public.discount_request(
  _business_id uuid, _product_id uuid, _requested_price numeric,
  _customer_id uuid DEFAULT NULL, _call_id uuid DEFAULT NULL, _summary text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.appointment_check(_business_id uuid, _date date, _time time)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg record; open_t time; close_t time; days jsonb; dow int; taken int;
BEGIN
  SELECT * INTO cfg FROM public.agent_configs WHERE business_id = _business_id ORDER BY created_at LIMIT 1;
  IF cfg.id IS NULL THEN RETURN jsonb_build_object('available', false, 'reason', 'no_agent_config'); END IF;
  open_t := (cfg.business_hours->>'open')::time;
  close_t := (cfg.business_hours->>'close')::time;
  days := cfg.business_hours->'days';
  dow := EXTRACT(DOW FROM _date)::int;
  IF days IS NOT NULL AND NOT (days @> to_jsonb(dow)) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'closed_that_day',
      'open', open_t, 'close', close_t);
  END IF;
  IF _time < open_t OR _time >= close_t THEN
    RETURN jsonb_build_object('available', false, 'reason', 'outside_business_hours',
      'open', open_t, 'close', close_t);
  END IF;
  SELECT count(*) INTO taken FROM public.appointments
    WHERE business_id = _business_id AND requested_date = _date AND requested_time = _time
      AND status IN ('requested','confirmed');
  IF taken >= 3 THEN
    RETURN jsonb_build_object('available', false, 'reason', 'slot_full', 'open', open_t, 'close', close_t);
  END IF;
  RETURN jsonb_build_object('available', true, 'open', open_t, 'close', close_t);
END; $$;

REVOKE ALL ON FUNCTION public.pricing_lookup(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.discount_request(uuid, uuid, numeric, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.appointment_check(uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pricing_lookup(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.discount_request(uuid, uuid, numeric, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.appointment_check(uuid, date, time) TO authenticated, service_role;

-- ============ demo seed ============
INSERT INTO public.businesses (id, name, legal_name, phone, email, address, timezone, default_language)
VALUES ('11111111-1111-4111-8111-111111111111', 'Trellient Demo Auto', 'Trellient Demo Auto Pvt Ltd',
  '+912012345678', 'sales@trellient-demo.in', 'Baner Road, Pune, Maharashtra', 'Asia/Kolkata', 'en');

INSERT INTO public.products (id, business_id, name, description, category, price, currency, stock_status, metadata)
VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
  'Mahindra Thar', 'Mahindra Thar LX 4x4 hard top, diesel, manual.', 'SUV',
  1500000.00, 'INR', 'in_stock', '{"variants":["LX 4x4 Diesel MT"],"colors":["Red Rage","Everest White"]}'::jsonb),
 ('22222222-2222-4222-8222-222222222223', '11111111-1111-4111-8111-111111111111',
  'Mahindra Scorpio N', 'Mahindra Scorpio N Z8 diesel automatic.', 'SUV',
  1990000.00, 'INR', 'in_stock', '{}'::jsonb);

INSERT INTO public.services (id, business_id, name, description, base_price, duration_minutes)
VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
  'Test Drive', 'On-site test drive at the Baner showroom.', 0, 45),
 ('33333333-3333-4333-8333-333333333334', '11111111-1111-4111-8111-111111111111',
  'Periodic Service', 'Standard periodic service including oil and filter change.', 7500, 180);

INSERT INTO public.pricing_rules (business_id, product_id, minimum_price, maximum_discount_percent, approval_required)
VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 1450000.00, 0, true),
 ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222223', 1900000.00, 2, true);

INSERT INTO public.business_policies (business_id, policy_type, title, content)
VALUES ('11111111-1111-4111-8111-111111111111', 'payment', 'Payment terms',
  'Booking amount of Rs 25,000 is required to confirm an order. Balance is payable before delivery. Finance available through partner banks.'),
 ('11111111-1111-4111-8111-111111111111', 'cancellation', 'Cancellation policy',
  'Bookings may be cancelled within 7 days for a full refund of the booking amount. After 7 days a Rs 5,000 processing fee applies.'),
 ('11111111-1111-4111-8111-111111111111', 'hours', 'Working hours',
  'The showroom is open every day from 9:00 AM to 8:00 PM IST.'),
 ('11111111-1111-4111-8111-111111111111', 'delivery', 'Delivery',
  'Delivery timelines depend on variant availability and are confirmed by the sales team at booking.');

INSERT INTO public.agent_configs (business_id, name, greeting, personality, business_description,
  primary_language, supported_languages, escalation_rules, after_hours_response, system_instructions)
VALUES ('11111111-1111-4111-8111-111111111111', 'Trellient Assistant',
  'Thank you for calling Trellient Demo Auto. How can I help you today?',
  'Warm, efficient and precise. Speaks like an experienced showroom advisor.',
  'Authorised Mahindra dealership in Pune selling SUVs and offering service and test drives.',
  'en', ARRAY['en','hi','mr'],
  'Escalate to the owner for any discount request, payment dispute, or when the caller asks for a human.',
  'We are closed right now. Our showroom is open every day from 9 AM to 8 PM. I can take your details and have the team call you back.',
  'Always use verified business data from the Trellient tools. Never invent prices, availability, discounts or policies.');

INSERT INTO public.agent_knowledge (business_id, title, content, source_type)
VALUES ('11111111-1111-4111-8111-111111111111', 'Showroom location',
  'Trellient Demo Auto is on Baner Road, Pune. Parking is available on site.', 'manual'),
 ('11111111-1111-4111-8111-111111111111', 'Test drive process',
  'Test drives require a valid driving licence. Slots are 45 minutes and must be booked in advance.', 'manual');

INSERT INTO public.customers (id, business_id, name, phone, preferred_language, notes)
VALUES ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
  'Rahul Patil', '+919812345678', 'mr', 'Interested in the Thar LX 4x4. Asked about a discount.');