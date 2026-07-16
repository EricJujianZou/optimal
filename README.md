# Optimal — Rational Twin V0

A 5-minute localhost demo: quick check-in → push-to-talk voice temptation →
Gemini-voiced "Wise Friend" intervention with a transparent reasoning trace →
compliance decision logged to SQLite for future dual-self modeling.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in GEMINI_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Get a Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
Without a key set, `/api/intervene` returns a clear 500 error; the rest of the
app (check-in, history, CSV export) still works.

Session data is stored at `data/optimal.db` (SQLite, gitignored, created on
first write).

## 5-minute reviewer script

1. **Check-in** (`/`) — adjust sleep / days on diet / hunger / streak or accept
   the defaults, hit **Start session**.
2. **Push-to-talk** — hold the mic button, describe a food temptation out
   loud ("I'm exhausted and there's pizza in the fridge"), release.
3. **Intervention** — Gemini transcribes the audio, extracts craving
   intensity / temptation type / context tags, writes a reasoning trace
   weighing short-term impulse vs. long-term value, and speaks a 2-3 sentence
   Wise Friend message (auto-plays; replay button available). Expand
   "Show reasoning trace" and "Transcript" to inspect the raw output.
   You can hit "Talk again instead" to continue the conversation
   multi-turn before deciding.
4. **Decide** — log Complied / Partial / Defected with an optional note via
   the DecisionLogger panel.
5. **History** (`/history`) — see every logged session in a table; **Export
   CSV** downloads the full dataset for offline analysis / model training.

## Architecture

```
Browser (push-to-talk mic, MediaRecorder, webm)
   → POST /api/intervene  { audioBase64, mimeType, checkIn, history }
      1. Gemini gemini-2.5-flash multimodal: audio → structured JSON via responseSchema
         { transcript, craving_intensity, temptation_type, context_tags[],
           reasoning_trace, intervention_text }
      2. Gemini TTS (gemini-2.5-flash-preview-tts): intervention_text → PCM → WAV base64
   → Browser plays audio, shows transcript + extracted vars + reasoning trace
   → User logs decision → POST /api/sessions → SQLite row
```

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind, `@google/genai`,
`better-sqlite3`, `zod`.

## Notes

- `components/DecisionLogger.tsx` contract is frozen in `lib/types.ts`
  (`Decision`, `DecisionLoggerProps`) — see `PLAN-YOURS.md`.
- `npm run build` must pass clean before shipping changes.
