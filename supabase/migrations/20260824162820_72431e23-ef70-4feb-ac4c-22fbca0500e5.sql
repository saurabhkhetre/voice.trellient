CREATE OR REPLACE FUNCTION public.pricing_lookup(_business_id uuid, _query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; r record;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'not a member of this business';
  END IF;

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

CREATE OR REPLACE FUNCTION public.appointment_check(_business_id uuid, _date date, _time time)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg record; open_t time; close_t time; days jsonb; dow int; taken int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'not a member of this business';
  END IF;
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

REVOKE ALL ON FUNCTION public.pricing_lookup(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.appointment_check(uuid, date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pricing_lookup(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.appointment_check(uuid, date, time) TO authenticated, service_role;