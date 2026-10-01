package com.trellient.voice.api.web;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Which realtime models and voices each provider accepts.
 *
 * This exists because a provider/model/voice mismatch is silent until a caller
 * is already on the line: the agent connects, greets, and the provider then
 * rejects the session. It has happened twice — a Gemini model left on an OpenAI
 * provider (2026-09-20) and gpt-realtime left on gemini_live (2026-09-26,
 * "1007 Unsupported"). Both were saved through the dashboard, which offered one
 * flat model list and only ever listed OpenAI voices.
 *
 * The values mirror the agent worker's providers
 * (services/agent/src/voice_agent/providers). Gemini's voice list is the
 * authoritative one from gemini_live.VOICES; adding a model or voice here
 * without adding it there will fail at call time, so the two move together.
 *
 * Served to the dashboard by GET /api/agents/voice-catalog so the dropdowns are
 * built from this map rather than a second copy that can drift — the drift is
 * what caused both outages.
 */
public final class VoiceCatalog {

    public record Provider(String value, String label, List<Option> models, List<Option> voices) {}

    public record Option(String value, String label) {}

    private static final Map<String, Provider> PROVIDERS = new LinkedHashMap<>();

    static {
        register(new Provider("openai_realtime", "OpenAI Realtime",
                List.of(
                        new Option("gpt-realtime", "OpenAI gpt-realtime"),
                        new Option("gpt-realtime-mini", "OpenAI gpt-realtime mini (lower cost)")),
                List.of(
                        new Option("alloy", "Alloy"),
                        new Option("echo", "Echo"),
                        new Option("shimmer", "Shimmer"),
                        new Option("verse", "Verse"),
                        new Option("sage", "Sage"),
                        new Option("coral", "Coral"))));

        register(new Provider("gemini_live", "Gemini Live",
                List.of(
                        new Option("gemini-2.5-flash-native-audio-latest",
                                "Gemini 2.5 Flash native audio"),
                        new Option("gemini-3.1-flash-live-preview",
                                "Gemini 3.1 Flash Live (preview)")),
                // gemini_live.VOICES — the plugin rejects anything else.
                List.of(
                        new Option("Puck", "Puck"),
                        new Option("Charon", "Charon"),
                        new Option("Kore", "Kore"),
                        new Option("Fenrir", "Fenrir"),
                        new Option("Aoede", "Aoede"),
                        new Option("Leda", "Leda"),
                        new Option("Orus", "Orus"),
                        new Option("Zephyr", "Zephyr"))));
    }

    private static void register(Provider provider) {
        PROVIDERS.put(provider.value(), provider);
    }

    private VoiceCatalog() {}

    /** Every provider with its models and voices, in dashboard order. */
    public static List<Provider> providers() {
        return List.copyOf(PROVIDERS.values());
    }

    public static Set<String> providerValues() {
        return new LinkedHashSet<>(PROVIDERS.keySet());
    }

    public static boolean isProvider(String provider) {
        return PROVIDERS.containsKey(provider);
    }

    /**
     * Rejects a provider/model/voice combination the agent worker could not run.
     *
     * A null model or voice is left alone: the column is nullable and each
     * provider falls back to its own default, so "unset" is always valid. Only a
     * value that is set and wrong is an error.
     */
    public static void requireValidCombination(String provider, String model, String voice) {
        Provider entry = PROVIDERS.get(provider);
        if (entry == null) {
            throw Validate.bad("model_provider must be one of: " + String.join(", ", PROVIDERS.keySet()) + ".");
        }
        if (model != null && entry.models().stream().noneMatch(o -> o.value().equals(model))) {
            throw Validate.bad(describe(entry.label(), "model", model, entry.models()));
        }
        if (voice != null && entry.voices().stream().noneMatch(o -> o.value().equals(voice))) {
            throw Validate.bad(describe(entry.label(), "voice", voice, entry.voices()));
        }
    }

    private static String describe(String providerLabel, String kind, String value, List<Option> allowed) {
        String options = allowed.stream().map(Option::value).reduce((a, b) -> a + ", " + b).orElse("");
        return providerLabel + " does not support the " + kind + " \"" + value
                + "\". Valid options: " + options + ".";
    }
}
