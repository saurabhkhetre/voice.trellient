-- Harden discount_request with an explicit membership check for signed-in callers
CREATE OR REPLACE FUNCTION public.discount_request(_business_id uuid, _product_id uuid, _requested_price numeric, _customer_id uuid DEFAULT NULL::uuid, _call_id uuid DEFAULT NULL::uuid, _summary text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p record; r record; esc_id uuid; floor_price numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'not a member of this business';
  END IF;

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
END; $function$;

-- Agent-runtime-only functions: not callable from the browser at all
REVOKE ALL ON FUNCTION public.pricing_lookup(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.appointment_check(uuid, date, time without time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discount_request(uuid, uuid, numeric, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pricing_lookup(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.appointment_check(uuid, date, time without time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.discount_request(uuid, uuid, numeric, uuid, uuid, text) TO service_role;

-- RLS helpers: needed by policies for signed-in users, never by anonymous visitors
REVOKE ALL ON FUNCTION public.is_business_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_business_role(uuid, business_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_business_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_business_role(uuid, business_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_business_id() TO authenticated, service_role;

-- Trigger-only helper should not be callable via the API
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;