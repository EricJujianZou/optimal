/**
 * OpenRouter config for the Megamind decide agent.
 * Gemini remains for TTS / legacy diet intervene / optional STT.
 */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_DEFAULT_MODEL = "inclusionai/ling-3.0-flash:free";

export function getOpenRouterModel(): string {
  return (
    process.env.OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL
  );
}

export function getOpenRouterApiKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  return key || null;
}

export function getExaApiKey(): string | null {
  const key = process.env.EXA_API_KEY?.trim();
  return key || null;
}

// Prefer flash-lite for TTFT/latency/quota. flash-latest as single fallback.
// gemini-3-flash kept available but off the hot path (tiny free-tier RPD).
export const GEMINI_REASONING_MODEL = "gemini-flash-lite-latest";
export const GEMINI_FALLBACK_MODEL = "gemini-flash-latest";
export const GEMINI_QUALITY_MODEL = "gemini-3-flash-preview";
export const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";

export const TTS_VOICE_NAME = "Kore";
export const TTS_SAMPLE_RATE = 24000;
export const TTS_BITS_PER_SAMPLE = 16;
export const TTS_CHANNELS = 1;
