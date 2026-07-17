// NOTE: "gemini-2.5-flash" 404s ("no longer available to new users") on
// freshly-provisioned API keys as of 2026-07. Verified live against the
// v1beta REST endpoint: gemini-2.5-flash -> 404, gemini-flash-latest -> 200.
export const GEMINI_REASONING_MODEL = "gemini-flash-latest";
// Used when the primary model returns a transient 503/429 (capacity spikes).
// Verified live: gemini-2.5-flash-lite 404s on this key ("no longer available
// to new users") even though ListModels returns it; gemini-flash-lite-latest
// and gemini-3-flash-preview both return 200.
export const GEMINI_FALLBACK_MODEL = "gemini-flash-lite-latest";
export const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";

// Prebuilt Gemini TTS voice. See:
// https://ai.google.dev/gemini-api/docs/speech-generation#voices
export const TTS_VOICE_NAME = "Kore";

// Gemini TTS returns raw PCM audio at this fixed rate/format.
export const TTS_SAMPLE_RATE = 24000;
export const TTS_BITS_PER_SAMPLE = 16;
export const TTS_CHANNELS = 1;
