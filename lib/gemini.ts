import { GoogleGenAI, Modality } from "@google/genai";
import {
  AudioValidationError,
  sanitizeAudioMimeType,
  validateAudioBase64,
} from "./audio";
import {
  GEMINI_FALLBACK_MODEL,
  GEMINI_REASONING_MODEL,
  GEMINI_TTS_MODEL,
  TTS_BITS_PER_SAMPLE,
  TTS_CHANNELS,
  TTS_SAMPLE_RATE,
  TTS_VOICE_NAME,
} from "./config";
import { loadContext } from "./context";
import { buildProfileMergePrompt } from "./decide-prompts";
import {
  decide as openRouterDecide,
  type DecideOutcome,
} from "./openrouter-decide";
import {
  buildCheckInContext,
  buildHistoryContext,
  buildSystemPrompt,
  interveneResponseSchema,
} from "./prompts";
import {
  InterveneResultSchema,
  type CheckIn,
  type HistoryTurn,
  type InterveneResult,
} from "./types";

export type { DecideOutcome };

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local (see .env.example) and restart the dev server."
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429|500)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|overloaded|high demand/i.test(
    msg
  );
}

function isDailyQuotaExhausted(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /RESOURCE_EXHAUSTED|\b429\b/i.test(msg) &&
    /FreeTier|PerDayPerProject|GenerateRequestsPerDay|quotaValue/i.test(msg)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withModelFallback<T>(
  models: string[],
  fn: (model: string) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fn(model);
      } catch (err) {
        if (!isTransientError(err)) throw err;
        lastError = err;
        console.warn(
          `Transient Gemini error on ${model} (attempt ${attempt + 1}):`,
          err
        );
        if (isDailyQuotaExhausted(err)) break;
        if (attempt === 0) await sleep(250);
      }
    }
  }
  throw lastError;
}

export async function intervene(
  audioBase64: string,
  mimeType: string,
  checkIn: CheckIn,
  history: HistoryTurn[]
): Promise<InterveneResult> {
  const ai = getClient();

  const textPrompt = [buildCheckInContext(checkIn), buildHistoryContext(history)]
    .filter(Boolean)
    .join("\n\n");

  const response = await withModelFallback(
    [GEMINI_REASONING_MODEL, GEMINI_FALLBACK_MODEL],
    (model) =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: textPrompt },
              { inlineData: { mimeType, data: audioBase64 } },
            ],
          },
        ],
        config: {
          systemInstruction: buildSystemPrompt(loadContext()),
          responseMimeType: "application/json",
          responseSchema: interveneResponseSchema,
        },
      })
  );

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini returned an empty response for the intervene call.");
  }

  const parsed = JSON.parse(raw);
  return InterveneResultSchema.parse(parsed);
}

/** Optional Gemini STT so voice still works while decide runs on OpenRouter. */
async function transcribeAudio(
  audioBase64: string,
  mimeType: string
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new AudioValidationError(
      "Voice needs GEMINI_API_KEY for transcription, or type instead."
    );
  }
  const ai = getClient();
  const response = await withModelFallback(
    [GEMINI_REASONING_MODEL, GEMINI_FALLBACK_MODEL],
    (model) =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Transcribe this voice memo verbatim. Return ONLY the transcript text.",
              },
              { inlineData: { mimeType, data: audioBase64 } },
            ],
          },
        ],
        config: { maxOutputTokens: 400 },
      })
  );
  const text = response.text?.trim();
  if (!text) {
    throw new AudioValidationError(
      "Couldn't understand that recording — try again or type instead."
    );
  }
  return text;
}

/**
 * Decide via OpenRouter tool-using agent. Voice is transcribed with Gemini
 * when audio is provided.
 */
export async function decide(args: {
  audioBase64?: string;
  mimeType?: string;
  textSituation?: string;
  history: HistoryTurn[];
  profileSummary: string;
  lat?: number;
  lon?: number;
  prefsBlock?: string;
  onProgress?: Parameters<typeof openRouterDecide>[0]["onProgress"];
}): Promise<DecideOutcome> {
  let textSituation = args.textSituation?.trim() || undefined;
  let transcriptHint: string | undefined;

  if (args.audioBase64 && args.mimeType) {
    const check = validateAudioBase64(args.audioBase64);
    if (!check.ok) throw new AudioValidationError(check.error);
    const safeMime = sanitizeAudioMimeType(args.mimeType);
    const safeAudio = args.audioBase64.replace(/\s/g, "");
    try {
      transcriptHint = await transcribeAudio(safeAudio, safeMime);
      if (!textSituation) textSituation = transcriptHint;
    } catch (err) {
      if (err instanceof AudioValidationError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/INVALID_ARGUMENT|invalid argument/i.test(msg)) {
        throw new AudioValidationError(
          "Couldn't process that recording — try again or type instead."
        );
      }
      throw err;
    }
  }

  if (!textSituation) {
    throw new AudioValidationError("Say or type what’s going on.");
  }

  return openRouterDecide({
    textSituation,
    transcriptHint,
    history: args.history,
    profileSummary: args.profileSummary,
    lat: args.lat,
    lon: args.lon,
    prefsBlock: args.prefsBlock,
    onProgress: args.onProgress,
  });
}

export async function mergeProfileSummary(
  currentSummary: string,
  newNotes: string[]
): Promise<string> {
  const notes = newNotes.map((n) => n.trim()).filter(Boolean);
  if (notes.length === 0) return currentSummary;

  if (!process.env.GEMINI_API_KEY) {
    return [currentSummary.trim(), ...notes.map((n) => `- ${n}`)]
      .filter(Boolean)
      .join("\n");
  }

  const ai = getClient();
  const response = await withModelFallback(
    [GEMINI_REASONING_MODEL, GEMINI_FALLBACK_MODEL],
    (model) =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ text: buildProfileMergePrompt(currentSummary, notes) }],
          },
        ],
        config: { maxOutputTokens: 400 },
      })
  );

  const text = response.text?.trim();
  if (!text) {
    return [currentSummary.trim(), ...notes.map((n) => `- ${n}`)]
      .filter(Boolean)
      .join("\n");
  }
  return text;
}

export async function tts(
  text: string
): Promise<{ audioBase64: string; mimeType: string }> {
  const ai = getClient();

  const response = await withModelFallback([GEMINI_TTS_MODEL], (model) =>
    ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: TTS_VOICE_NAME },
          },
        },
      },
    })
  );

  const part = response.candidates?.[0]?.content?.parts?.[0];
  const pcmBase64 = part?.inlineData?.data;
  if (!pcmBase64) {
    throw new Error("Gemini TTS returned no audio data.");
  }

  const pcmBuffer = Buffer.from(pcmBase64, "base64");
  const wavBuffer = pcmToWav(pcmBuffer);

  return { audioBase64: wavBuffer.toString("base64"), mimeType: "audio/wav" };
}

function pcmToWav(pcmData: Buffer): Buffer {
  const numChannels = TTS_CHANNELS;
  const sampleRate = TTS_SAMPLE_RATE;
  const bitsPerSample = TTS_BITS_PER_SAMPLE;

  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
