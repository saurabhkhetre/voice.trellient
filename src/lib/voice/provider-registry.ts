/**
 * Canonical provider/model/voice definitions.
 *
 * This is the single source of truth for what the platform supports.
 * The dashboard UI reads this to populate dropdowns.
 * The Python agent uses the same canonical identifiers from the DB.
 */

export interface VoiceOption {
  id: string;
  label: string;
}

export interface ModelOption {
  id: string;
  label: string;
  voices: VoiceOption[];
}

export interface ProviderDefinition {
  id: string;
  label: string;
  available: boolean;
  models: ModelOption[];
  /** Languages the provider handles well for realtime voice. */
  languages: string[];
}

/** Canonical provider registry. Keep in sync with Python agent providers/. */
export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "openai_realtime",
    label: "OpenAI Realtime",
    available: true,
    languages: ["en", "hi", "mr", "es", "fr", "de", "ja", "zh", "ko", "pt"],
    models: [
      {
        id: "gpt-4o-realtime-preview",
        label: "GPT-4o Realtime",
        voices: [
          { id: "alloy", label: "Alloy" },
          { id: "ash", label: "Ash" },
          { id: "ballad", label: "Ballad" },
          { id: "coral", label: "Coral" },
          { id: "echo", label: "Echo" },
          { id: "sage", label: "Sage" },
          { id: "shimmer", label: "Shimmer" },
          { id: "verse", label: "Verse" },
        ],
      },
      {
        id: "gpt-4o-mini-realtime-preview",
        label: "GPT-4o Mini Realtime",
        voices: [
          { id: "alloy", label: "Alloy" },
          { id: "ash", label: "Ash" },
          { id: "ballad", label: "Ballad" },
          { id: "coral", label: "Coral" },
          { id: "echo", label: "Echo" },
          { id: "sage", label: "Sage" },
          { id: "shimmer", label: "Shimmer" },
          { id: "verse", label: "Verse" },
        ],
      },
    ],
  },
  {
    id: "gemini_live",
    label: "Gemini Live",
    available: true,
    languages: ["en", "hi", "es", "fr", "de", "ja", "zh", "ko", "pt"],
    models: [
      {
        id: "gemini-2.0-flash-live-001",
        label: "Gemini 2.0 Flash Live",
        voices: [
          { id: "Puck", label: "Puck" },
          { id: "Charon", label: "Charon" },
          { id: "Kore", label: "Kore" },
          { id: "Fenrir", label: "Fenrir" },
          { id: "Aoede", label: "Aoede" },
        ],
      },
    ],
  },
];

/** Look up a provider by its canonical ID. */
export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Get all available providers (ones that can actually run). */
export function getAvailableProviders(): ProviderDefinition[] {
  return PROVIDERS.filter((p) => p.available);
}

/** Validate that a provider/model/voice combination is supported. */
export function validateProviderConfig(
  providerId: string,
  modelId: string,
  voiceId: string,
): { valid: boolean; error?: string } {
  const provider = getProvider(providerId);
  if (!provider) return { valid: false, error: `Unknown provider: ${providerId}` };
  if (!provider.available) return { valid: false, error: `${provider.label} is not available yet.` };

  const model = provider.models.find((m) => m.id === modelId);
  if (!model) return { valid: false, error: `Model ${modelId} is not supported by ${provider.label}.` };

  const voice = model.voices.find((v) => v.id === voiceId);
  if (!voice) return { valid: false, error: `Voice ${voiceId} is not available for ${model.label}.` };

  return { valid: true };
}
