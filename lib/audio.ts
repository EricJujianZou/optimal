/** Minimum decoded byte length for a usable voice memo (~0.25s of compressed audio). */
export const MIN_AUDIO_BYTES = 800;

/**
 * Gemini rejects some codec-parameterized MIME strings (e.g. audio/webm;codecs=opus).
 * Strip parameters and map to a supported base type.
 */
export function sanitizeAudioMimeType(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() || "audio/webm";
  if (base.includes("mp4") || base.includes("m4a") || base.includes("aac")) {
    return "audio/mp4";
  }
  if (base.includes("mpeg") || base.includes("mp3")) {
    return "audio/mpeg";
  }
  if (base.includes("wav") || base.includes("wave")) {
    return "audio/wav";
  }
  if (base.includes("ogg")) {
    return "audio/ogg";
  }
  // webm / opus / unknown → webm
  return "audio/webm";
}

export function validateAudioBase64(audioBase64: string): {
  ok: true;
  bytes: number;
} | { ok: false; error: string } {
  const cleaned = audioBase64.replace(/\s/g, "");
  if (!cleaned) {
    return { ok: false, error: "No audio captured — try again or type instead." };
  }
  // Rough decoded size: 3/4 of base64 length (ignore padding).
  const bytes = Math.floor((cleaned.length * 3) / 4);
  if (bytes < MIN_AUDIO_BYTES) {
    return {
      ok: false,
      error: "Recording too short — tap the mic, speak, then tap again to stop.",
    };
  }
  return { ok: true, bytes };
}

export class AudioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioValidationError";
  }
}
