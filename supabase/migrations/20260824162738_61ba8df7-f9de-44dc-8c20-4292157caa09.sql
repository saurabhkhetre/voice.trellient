REVOKE ALL ON FUNCTION public.is_business_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_business_role(uuid, public.business_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_business_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pricing_lookup(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.appointment_check(uuid, date, time) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.discount_request(uuid, uuid, numeric, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_business_role(uuid, public.business_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_business_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.pricing_lookup(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.appointment_check(uuid, date, time) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.discount_request(uuid, uuid, numeric, uuid, uuid, text) TO service_role;