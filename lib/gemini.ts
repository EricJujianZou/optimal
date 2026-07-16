import { GoogleGenAI, Modality } from "@google/genai";
import {
  GEMINI_REASONING_MODEL,
  GEMINI_TTS_MODEL,
  TTS_BITS_PER_SAMPLE,
  TTS_CHANNELS,
  TTS_SAMPLE_RATE,
  TTS_VOICE_NAME,
} from "./config";
import {
  buildCheckInContext,
  buildHistoryContext,
  buildSystemPrompt,
  interveneResponseSchema,
} from "./prompts";
import { InterveneResultSchema, type CheckIn, type HistoryTurn, type InterveneResult } from "./types";

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

/**
 * Sends the user's push-to-talk audio plus check-in context to Gemini and
 * gets back structured JSON: transcript, extracted variables, reasoning
 * trace, and the intervention message text.
 */
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

  const response = await ai.models.generateContent({
    model: GEMINI_REASONING_MODEL,
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
      systemInstruction: buildSystemPrompt(),
      responseMimeType: "application/json",
      responseSchema: interveneResponseSchema,
    },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini returned an empty response for the intervene call.");
  }

  const parsed = JSON.parse(raw);
  return InterveneResultSchema.parse(parsed);
}

/**
 * Synthesizes speech for the given text via Gemini TTS. The API returns raw
 * 24kHz 16-bit mono PCM (no container), so we wrap it in a WAV header here
 * before handing it back as base64.
 */
export async function tts(text: string): Promise<{ audioBase64: string; mimeType: string }> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: GEMINI_TTS_MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: TTS_VOICE_NAME },
        },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  const pcmBase64 = part?.inlineData?.data;
  if (!pcmBase64) {
    throw new Error("Gemini TTS returned no audio data.");
  }

  const pcmBuffer = Buffer.from(pcmBase64, "base64");
  const wavBuffer = pcmToWav(pcmBuffer);

  return { audioBase64: wavBuffer.toString("base64"), mimeType: "audio/wav" };
}

/** Wraps raw PCM data in a standard 44-byte WAV header. */
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
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
