export const GEMINI_REASONING_MODEL = "gemini-2.5-flash";
export const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";

// Prebuilt Gemini TTS voice. See:
// https://ai.google.dev/gemini-api/docs/speech-generation#voices
export const TTS_VOICE_NAME = "Kore";

// Gemini TTS returns raw PCM audio at this fixed rate/format.
export const TTS_SAMPLE_RATE = 24000;
export const TTS_BITS_PER_SAMPLE = 16;
export const TTS_CHANNELS = 1;
