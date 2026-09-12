-- Google retired gemini-2.0-flash-live-001; the current Live API model for
-- spoken conversations is gemini-2.5-flash-native-audio-latest.

UPDATE public.agent_configs
SET model_name = 'gemini-2.5-flash-native-audio-latest', updated_at = now()
WHERE model_name IN ('gemini-2.0-flash-live-001', 'gemini-2.0-flash-live');
