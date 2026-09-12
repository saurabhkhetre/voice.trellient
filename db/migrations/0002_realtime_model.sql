-- OpenAI retired the gpt-4o realtime preview models; gpt-realtime and
-- gpt-realtime-mini replace them. Move the column default and existing agents.

ALTER TABLE public.agent_configs ALTER COLUMN model_name SET DEFAULT 'gpt-realtime';

UPDATE public.agent_configs
SET model_name = 'gpt-realtime', updated_at = now()
WHERE model_name = 'gpt-4o-realtime-preview';

UPDATE public.agent_configs
SET model_name = 'gpt-realtime-mini', updated_at = now()
WHERE model_name = 'gpt-4o-mini-realtime-preview';
