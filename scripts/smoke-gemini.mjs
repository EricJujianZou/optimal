#!/usr/bin/env node
/**
 * scripts/smoke-gemini.mjs
 *
 * Standalone smoke test for the Optimal "Wise Friend" Gemini pipeline,
 * independent of the Next.js app in this repo. Does NOT import anything
 * from app/ or lib/ (those are owned by another build in progress) — the
 * response schema / prompt shape below is a deliberate duplicate of
 * lib/prompts.ts + lib/config.ts, kept in sync by hand.
 *
 * Usage:
 *   node scripts/smoke-gemini.mjs                 Run both live tests (needs GEMINI_API_KEY)
 *   node scripts/smoke-gemini.mjs --audio a.webm   Test 1 uses real audio instead of text stand-in
 *   node scripts/smoke-gemini.mjs --selftest       Offline-only: unit-checks the WAV header writer
 *   node scripts/smoke-gemini.mjs --help           Show this help
 *
 * Exit codes: 0 = all requested checks passed, 1 = any failure.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(__dirname, "out");

// ---------------------------------------------------------------------------
// Config (kept in sync with lib/config.ts — see file header comment)
// ---------------------------------------------------------------------------
const GEMINI_REASONING_MODEL = "gemini-2.5-flash";
const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const TTS_VOICE_NAME = "Kore";
const TTS_SAMPLE_RATE = 24000;
const TTS_BITS_PER_SAMPLE = 16;
const TTS_CHANNELS = 1;

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flags = {
  help: args.includes("--help") || args.includes("-h"),
  selftest: args.includes("--selftest"),
  audio: (() => {
    const i = args.indexOf("--audio");
    return i !== -1 ? args[i + 1] : null;
  })(),
};

if (flags.help) {
  console.log(`
Optimal Gemini pipeline smoke test

  node scripts/smoke-gemini.mjs                 Run structured-intervention + TTS tests
  node scripts/smoke-gemini.mjs --audio a.webm   Send real audio (webm/wav) for Test 1 instead of text
  node scripts/smoke-gemini.mjs --selftest       Offline only: validate the WAV header writer, no API key needed
  node scripts/smoke-gemini.mjs --help           Show this help

Requires GEMINI_API_KEY in the environment, or a line "GEMINI_API_KEY=..." in .env.local at the repo root.
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(msg);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/** Manual .env.local parser — no dotenv dependency. */
function loadDotEnvLocal(repoRoot) {
  const p = path.join(repoRoot, ".env.local");
  if (!existsSync(p)) return {};
  const raw = readFileSync(p, "utf8");
  const out = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip matching surrounding quotes, if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function resolveApiKey() {
  if (process.env.GEMINI_API_KEY) {
    return { key: process.env.GEMINI_API_KEY, source: "environment" };
  }
  const parsed = loadDotEnvLocal(REPO_ROOT);
  if (parsed.GEMINI_API_KEY) {
    return { key: parsed.GEMINI_API_KEY, source: ".env.local" };
  }
  return { key: null, source: null };
}

/**
 * Wrap raw PCM (as returned by Gemini TTS) in a canonical 44-byte WAV header.
 * PCM is assumed little-endian signed integers, mono/stereo per `channels`.
 */
function pcmToWav(pcmBuffer, {
  sampleRate = TTS_SAMPLE_RATE,
  bitsPerSample = TTS_BITS_PER_SAMPLE,
  channels = TTS_CHANNELS,
} = {}) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = 1 (PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/** Validate a WAV buffer's header fields against expected values. Throws on mismatch. */
function assertWavHeader(wavBuffer, expected) {
  const errors = [];
  const check = (label, actual, want) => {
    if (actual !== want) errors.push(`${label}: expected ${want}, got ${actual}`);
  };

  check("RIFF tag", wavBuffer.toString("ascii", 0, 4), "RIFF");
  check("chunkSize", wavBuffer.readUInt32LE(4), 36 + expected.dataSize);
  check("WAVE tag", wavBuffer.toString("ascii", 8, 12), "WAVE");
  check("fmt tag", wavBuffer.toString("ascii", 12, 16), "fmt ");
  check("fmt chunk size", wavBuffer.readUInt32LE(16), 16);
  check("audio format", wavBuffer.readUInt16LE(20), 1);
  check("channels", wavBuffer.readUInt16LE(22), expected.channels);
  check("sample rate", wavBuffer.readUInt32LE(24), expected.sampleRate);
  check(
    "byte rate",
    wavBuffer.readUInt32LE(28),
    (expected.sampleRate * expected.channels * expected.bitsPerSample) / 8
  );
  check(
    "block align",
    wavBuffer.readUInt16LE(32),
    (expected.channels * expected.bitsPerSample) / 8
  );
  check("bits per sample", wavBuffer.readUInt16LE(34), expected.bitsPerSample);
  check("data tag", wavBuffer.toString("ascii", 36, 40), "data");
  check("data size", wavBuffer.readUInt32LE(40), expected.dataSize);
  check("total length", wavBuffer.length, 44 + expected.dataSize);

  if (errors.length) {
    throw new Error("WAV header validation failed:\n  " + errors.join("\n  "));
  }
}

function mimeTypeForAudioFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webm") return "audio/webm";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mp3";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".m4a") return "audio/mp4";
  throw new Error(`Unrecognized audio extension "${ext}". Use .webm, .wav, .mp3, .ogg, or .m4a.`);
}

/** Turn an SDK/HTTP error into an actionable message. */
function explainError(err) {
  const msg = String(err?.message ?? err);
  const status = err?.status ?? err?.code;

  if (/API key not valid|API_KEY_INVALID|401/i.test(msg) || status === 401) {
    return `Bad or missing API key. Double-check GEMINI_API_KEY in .env.local — get a key at https://aistudio.google.com/apikey.\n  Raw error: ${msg}`;
  }
  if (/PERMISSION_DENIED|403/i.test(msg) || status === 403) {
    return `Permission denied — the key may not have access to this model, or billing/API enablement is required.\n  Raw error: ${msg}`;
  }
  if (/not found|404|NOT_FOUND/i.test(msg) || status === 404) {
    return `Model not found. This model ID may not be available for your account/region/API version yet. Check https://ai.google.dev/gemini-api/docs/models for current model IDs (this script targets "${GEMINI_REASONING_MODEL}" and "${GEMINI_TTS_MODEL}").\n  Raw error: ${msg}`;
  }
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(msg) || status === 429) {
    return `Quota/rate limit hit. Wait and retry, or check quota at https://aistudio.google.com/apikey.\n  Raw error: ${msg}`;
  }
  return `Unexpected error: ${msg}`;
}

// ---------------------------------------------------------------------------
// Self-test (fully offline — validates the WAV header writer with synthetic PCM)
// ---------------------------------------------------------------------------
function runSelfTest() {
  section("SELFTEST: WAV header writer (offline, no API key needed)");
  const start = performance.now();
  try {
    // Synthesize 0.5s of a 440Hz sine wave as 16-bit PCM mono @ 24kHz.
    const durationSec = 0.5;
    const sampleCount = Math.floor(TTS_SAMPLE_RATE * durationSec);
    const pcm = Buffer.alloc(sampleCount * 2);
    for (let i = 0; i < sampleCount; i++) {
      const t = i / TTS_SAMPLE_RATE;
      const sample = Math.round(Math.sin(2 * Math.PI * 440 * t) * 0.3 * 32767);
      pcm.writeInt16LE(sample, i * 2);
    }

    const wav = pcmToWav(pcm, {
      sampleRate: TTS_SAMPLE_RATE,
      bitsPerSample: TTS_BITS_PER_SAMPLE,
      channels: TTS_CHANNELS,
    });

    assertWavHeader(wav, {
      dataSize: pcm.length,
      channels: TTS_CHANNELS,
      sampleRate: TTS_SAMPLE_RATE,
      bitsPerSample: TTS_BITS_PER_SAMPLE,
    });

    mkdirSync(OUT_DIR, { recursive: true });
    const outPath = path.join(OUT_DIR, "selftest.wav");
    writeFileSync(outPath, wav);

    const ms = Math.round(performance.now() - start);
    log(`PASS  WAV header writer produced a valid, spec-conformant WAV file (${ms}ms)`);
    log(`      wrote ${outPath} (${wav.length} bytes) — play it to confirm you hear a 440Hz tone`);
    return true;
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    log(`FAIL  WAV header writer selftest (${ms}ms)`);
    log(`      ${err.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Live tests (require GEMINI_API_KEY + @google/genai)
// ---------------------------------------------------------------------------

const INTERVENE_RESPONSE_SCHEMA_FIELDS = [
  "transcript",
  "craving_intensity",
  "temptation_type",
  "context_tags",
  "reasoning_trace",
  "intervention_text",
];

function buildResponseSchema(Type) {
  return {
    type: Type.OBJECT,
    properties: {
      transcript: { type: Type.STRING },
      craving_intensity: { type: Type.INTEGER },
      temptation_type: { type: Type.STRING },
      context_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      reasoning_trace: { type: Type.STRING },
      intervention_text: { type: Type.STRING },
    },
    required: [...INTERVENE_RESPONSE_SCHEMA_FIELDS],
  };
}

const FAKE_CHECKIN = {
  sleepHours: 5,
  daysOnDiet: 42,
  hungerLevel: 8,
  adherenceStreakDays: 42,
};

const FAKE_TRANSCRIPT_STANDIN = "It's 11pm and I really want to order a milkshake";

function buildSystemPrompt() {
  return `You are the "Wise Friend" inside Optimal, a behavioral intervention app for someone actively on a diet.
The user just described (by voice or text) a food temptation they're facing right now. You will receive
that plus their check-in numbers for today (sleep, days on diet, hunger, adherence streak).

Your job, in ONE pass:
1. Transcribe/echo the input exactly (transcript).
2. Extract structured variables: craving_intensity (1-10), temptation_type (short label),
   context_tags (array of short lowercase tags).
3. Write a reasoning_trace: 2-4 sentences weighing SHORT-TERM impulse utility against LONG-TERM value.
4. Write intervention_text: 2-3 sentences, second person, direct, must reference at least one actual
   check-in number by name. Not always "no" — if streak is 7+ days, sleep is under 6 hours, and craving
   is 8+, recommend a planned bounded indulgence instead.

Respond ONLY with the structured JSON per the schema.`;
}

function buildCheckInContext(c) {
  return `Today's check-in:
- Sleep last night: ${c.sleepHours} hours
- Days on diet: ${c.daysOnDiet}
- Current hunger level: ${c.hungerLevel}/10
- Current adherence streak: ${c.adherenceStreakDays} days`;
}

async function loadGenAI() {
  try {
    return await import("@google/genai");
  } catch (err) {
    throw new Error(
      `Could not load "@google/genai". Install it for this scripts/ folder with:\n` +
        `    cd scripts && npm install\n` +
        `(This does not touch the repo root package.json.)\n  Raw error: ${err.message}`
    );
  }
}

async function testStructuredIntervention(ai, GenAIType, audioPath) {
  section("TEST 1: structured intervention (gemini-2.5-flash)");
  const start = performance.now();
  try {
    const systemPrompt = buildSystemPrompt();
    const checkInText = buildCheckInContext(FAKE_CHECKIN);

    const parts = [];
    if (audioPath) {
      if (!existsSync(audioPath)) {
        throw new Error(`--audio file not found: ${audioPath}`);
      }
      const mimeType = mimeTypeForAudioFile(audioPath);
      const audioBytes = readFileSync(audioPath);
      log(`      using real audio file: ${audioPath} (${mimeType}, ${audioBytes.length} bytes)`);
      parts.push({
        inlineData: { mimeType, data: audioBytes.toString("base64") },
      });
      parts.push({ text: `${checkInText}\n\nTranscribe and analyze the attached audio.` });
    } else {
      log(`      using text stand-in for transcript: "${FAKE_TRANSCRIPT_STANDIN}"`);
      parts.push({
        text: `${checkInText}\n\nThe user said: "${FAKE_TRANSCRIPT_STANDIN}"\n\nTreat this text as if it were the transcript of their voice memo.`,
      });
    }

    const response = await ai.models.generateContent({
      model: GEMINI_REASONING_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: buildResponseSchema(GenAIType),
      },
    });

    const ms = Math.round(performance.now() - start);
    const text = response.text;
    if (!text) {
      throw new Error("Response had no text content (check response.candidates for finishReason/blockReason).");
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Response was not valid JSON:\n${text}`);
    }

    const missing = INTERVENE_RESPONSE_SCHEMA_FIELDS.filter((f) => !(f in parsed));
    log("      parsed JSON:");
    log(
      JSON.stringify(parsed, null, 2)
        .split("\n")
        .map((l) => "      " + l)
        .join("\n")
    );

    if (missing.length > 0) {
      throw new Error(`Missing required field(s): ${missing.join(", ")}`);
    }
    if (typeof parsed.craving_intensity !== "number") {
      throw new Error(`craving_intensity should be a number, got ${typeof parsed.craving_intensity}`);
    }
    if (!Array.isArray(parsed.context_tags)) {
      throw new Error(`context_tags should be an array, got ${typeof parsed.context_tags}`);
    }

    log(`PASS  Test 1: structured intervention (${ms}ms) — all fields present and well-typed`);
    return { ok: true, ms, interventionText: parsed.intervention_text };
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    log(`FAIL  Test 1: structured intervention (${ms}ms)`);
    log(`      ${explainError(err)}`);
    return { ok: false, ms, interventionText: null };
  }
}

async function testTts(ai, textToSpeak) {
  section("TEST 2: text-to-speech (gemini-2.5-flash-preview-tts)");
  const start = performance.now();
  try {
    const text =
      textToSpeak ||
      "Your streak is 42 days and you're running on 5 hours of sleep — that combination is why this craving feels so loud tonight.";
    log(`      speaking: "${text}"`);

    const response = await ai.models.generateContent({
      model: GEMINI_TTS_MODEL,
      contents: [{ role: "user", parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE_NAME } },
        },
      },
    });

    const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) {
      throw new Error(
        "No inline audio data in response (check response.candidates[0].content.parts for the actual shape)."
      );
    }

    const pcm = Buffer.from(inlineData.data, "base64");
    if (pcm.length === 0) {
      throw new Error("Decoded PCM buffer is empty.");
    }

    const wav = pcmToWav(pcm, {
      sampleRate: TTS_SAMPLE_RATE,
      bitsPerSample: TTS_BITS_PER_SAMPLE,
      channels: TTS_CHANNELS,
    });
    assertWavHeader(wav, {
      dataSize: pcm.length,
      channels: TTS_CHANNELS,
      sampleRate: TTS_SAMPLE_RATE,
      bitsPerSample: TTS_BITS_PER_SAMPLE,
    });

    mkdirSync(OUT_DIR, { recursive: true });
    const outPath = path.join(OUT_DIR, "intervention.wav");
    writeFileSync(outPath, wav);

    const ms = Math.round(performance.now() - start);
    log(`PASS  Test 2: TTS (${ms}ms) — wrote ${outPath} (${wav.length} bytes, ${pcm.length} bytes PCM)`);
    log(`      mimeType reported by API: ${inlineData.mimeType ?? "(none)"}`);
    return { ok: true, ms };
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    log(`FAIL  Test 2: TTS (${ms}ms)`);
    log(`      ${explainError(err)}`);
    return { ok: false, ms };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Optimal Gemini pipeline smoke test");
  console.log(`repo root: ${REPO_ROOT}`);

  if (flags.selftest) {
    const ok = runSelfTest();
    console.log("\n=== SUMMARY ===");
    console.log(ok ? "PASS  selftest" : "FAIL  selftest");
    process.exit(ok ? 0 : 1);
  }

  const { key, source } = resolveApiKey();
  if (!key) {
    console.log(`
FAIL  No GEMINI_API_KEY found.

  Set it one of two ways:
    1. Environment variable:   $env:GEMINI_API_KEY="..."   (PowerShell)
                                export GEMINI_API_KEY=...   (bash)
    2. Repo root .env.local:   GEMINI_API_KEY=your-key-here
                                (path checked: ${path.join(REPO_ROOT, ".env.local")})

  Get a key at https://aistudio.google.com/apikey

  You can still verify the WAV header logic without a key:
    node scripts/smoke-gemini.mjs --selftest
`);
    process.exit(1);
  }
  log(`API key loaded from ${source} (${key.slice(0, 4)}...${key.slice(-4)}, length ${key.length})`);

  let genai;
  try {
    genai = await loadGenAI();
  } catch (err) {
    console.log(`\nFAIL  ${err.message}`);
    process.exit(1);
  }

  const { GoogleGenAI, Type } = genai;
  const ai = new GoogleGenAI({ apiKey: key });

  const results = [];
  const t1 = await testStructuredIntervention(ai, Type, flags.audio);
  results.push({ name: "structured intervention", ...t1 });

  const t2 = await testTts(ai, t1.interventionText);
  results.push({ name: "text-to-speech", ...t2 });

  section("SUMMARY");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name} (${r.ms}ms)`);
  }
  const allOk = results.every((r) => r.ok);
  console.log(allOk ? "\nAll tests passed." : "\nSome tests failed — see details above.");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("\nFAIL  Unhandled error:");
  console.error(explainError(err));
  process.exit(1);
});
