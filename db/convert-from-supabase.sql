-- One-off conversion for a database built from the old Supabase-era
-- migrations (supabase/migrations, removed 2026-09-11). scripts/db-init.mjs
-- runs this automatically when it finds such a database, then records
-- 0001_schema.sql as applied. It leaves the data alone and brings the schema
-- to the baseline: row-level-security policies and their helper functions,
-- the auth.uid() shim and the Supabase roles go away, and the agent's SQL
-- functions are redefined without the auth.uid() check.

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', item.policyname, item.schemaname, item.tablename);
  END LOOP;
  FOR item IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', item.relname);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.is_business_member(uuid);
DROP FUNCTION IF EXISTS public.has_business_role(uuid, public.business_role[]);
DROP FUNCTION IF EXISTS public.current_business_id();

-- function: appointment_check(uuid, date, time without time zone)
CREATE OR REPLACE FUNCTION public.appointment_check(_business_id uuid, _date date, _time time without time zone) RETURNS jsonb
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
CREATE OR REPLACE FUNCTION public.discount_request(_business_id uuid, _product_id uuid, _requested_price numeric, _customer_id uuid DEFAULT NULL::uuid, _call_id uuid DEFAULT NULL::uuid, _summary text DEFAULT NULL::text) RETURNS jsonb
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
CREATE OR REPLACE FUNCTION public.pricing_lookup(_business_id uuid, _query text) RETURNS jsonb
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

DROP SCHEMA IF EXISTS auth CASCADE;
-- Migration bookkeeping moved to public.schema_migrations.
DROP SCHEMA IF EXISTS local_dev CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) THEN
    EXECUTE 'DROP OWNED BY ' || (
      SELECT string_agg(quote_ident(rolname), ', ') FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated', 'service_role')
    );
    DROP ROLE IF EXISTS anon, authenticated, service_role;
  END IF;
EXCEPTION WHEN dependent_objects_still_exist THEN
  RAISE NOTICE 'Supabase roles still referenced by another database; left in place.';
END $$;

-- Sign-in tables, for databases converted before they were added.
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON public.users (lower(email));

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON public.user_sessions (user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON public.user_sessions (expires_at);
