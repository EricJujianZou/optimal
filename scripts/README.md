# scripts/smoke-gemini.mjs

Standalone smoke test for the Optimal "Wise Friend" Gemini pipeline
(structured intervention extraction + TTS), independent of the Next.js app.
Nothing here imports from `app/` or `lib/` — the prompt/schema/config
constants are deliberately duplicated so this script never breaks if the
app's files change mid-build.

## Setup (one-time)

```
cd scripts
npm install
```

This installs `@google/genai` only inside `scripts/node_modules` — it does
not touch the repo root `package.json` or `node_modules`.

## Usage

```
# From the repo root:
node scripts/smoke-gemini.mjs                 # run both live tests (needs GEMINI_API_KEY)
node scripts/smoke-gemini.mjs --audio a.webm   # Test 1 sends a real audio file instead of a text stand-in
node scripts/smoke-gemini.mjs --selftest       # offline only: validates the WAV header writer, no key needed
node scripts/smoke-gemini.mjs --help
```

The API key is read from `process.env.GEMINI_API_KEY`, falling back to a
hand-parsed `GEMINI_API_KEY=...` line in `.env.local` at the repo root (no
`dotenv` dependency). If neither is present the script exits 1 with setup
instructions instead of crashing.

## What it checks

1. **Test 1 — structured intervention**: calls `gemini-2.5-flash` with a
   `responseSchema` matching the plan's contract
   (`transcript, craving_intensity, temptation_type, context_tags[],
   reasoning_trace, intervention_text`), using fake check-in variables
   (sleep 5h, 42 days on diet, hunger 8, streak 42) and either a text
   stand-in for the transcript or, with `--audio`, a real inline audio file
   (`.webm`/`.wav`/`.mp3`/`.ogg`/`.m4a`). Prints the parsed JSON and fails
   loudly if any field is missing or mistyped.
2. **Test 2 — TTS**: sends the intervention text (from Test 1 if it
   succeeded, otherwise a canned line) to `gemini-2.5-flash-preview-tts`,
   decodes the raw 24kHz/16-bit/mono PCM Gemini returns, wraps it in a
   proper 44-byte WAV header, and writes `scripts/out/intervention.wav` so
   you can listen to it.

Each test prints `PASS`/`FAIL` with latency in ms and, on failure, an
actionable message (bad key, model not found/unavailable, quota, transient
503 overload) plus the raw API error.

`--selftest` needs no API key: it synthesizes a 440Hz sine wave as PCM,
runs it through the same `pcmToWav` function used by Test 2, and asserts
every header field byte-for-byte (RIFF/WAVE tags, fmt chunk, sample rate,
byte rate, block align, bits per sample, data size, total length), writing
`scripts/out/selftest.wav`.

## Verified so far (2026-07-16, no key of my own — ran against the key already present in the repo's `.env.local`)

- `--selftest`: **PASS** — WAV header writer is byte-correct.
- Missing-key path: confirmed the script exits 1 with the setup message
  when `GEMINI_API_KEY` is unset and no `.env.local` exists.
- **Live run against the real key found a real problem, not a script bug**:
  `gemini-2.5-flash` (the model ID named in `PLAN-AGENT.md` / `lib/config.ts`)
  returns `404 NOT_FOUND` — *"This model models/gemini-2.5-flash is no
  longer available to new users."* This key's project can no longer call it
  via `generateContent`, even though it still shows up in `ListModels`.
  `gemini-flash-latest` works with this key for `generateContent` with the
  same schema/config shape (confirmed with a one-off call). Other current
  candidates from `ListModels` on this key: `gemini-2.5-flash-lite`,
  `gemini-2.5-pro`, `gemini-3-flash-preview`. **Flag this to whoever owns
  `lib/config.ts` — the reasoning-model ID likely needs to change.**
- Test 2 (TTS) against `gemini-2.5-flash-preview-tts` **PASSED live**:
  produced a valid, playable WAV at `scripts/out/intervention.wav`. That
  model ID and the WAV-wrapping logic are confirmed working end-to-end.

## Once your own key is in place

```
node scripts/smoke-gemini.mjs
```

(or set `GEMINI_API_KEY` in the environment instead of `.env.local`). If
Test 1 still 404s, swap `GEMINI_REASONING_MODEL` in this script (and in
`lib/config.ts`) for a model your key can actually call — run
`node scripts/smoke-gemini.mjs --help` for flags, or list your available
models with:

```
node -e "fetch('https://generativelanguage.googleapis.com/v1beta/models?key='+process.env.GEMINI_API_KEY).then(r=>r.json()).then(d=>console.log(d.models.map(m=>m.name).join('\n')))"
```
