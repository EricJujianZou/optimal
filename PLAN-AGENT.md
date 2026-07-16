# Optimal V0 — Agent Build Plan (everything except DecisionLogger)

## Context

V0 of a "Rational Twin" behavioral intervention app. Goal: a localhost 5-minute demo — user does a quick check-in, describes a diet temptation via push-to-talk voice, receives a voice-synthesized "Wise Friend" intervention with a transparent reasoning trace, and logs their compliance decision. Every session becomes a structured SQLite row for training a future dual-self (Fudenberg-Levine / β-δ) math model. Gemini API only (STT + reasoning + TTS on one key).

## Division of labor (IMPORTANT)

`components/DecisionLogger.tsx` is being built **by the user in parallel**. You must:
1. Create it as a minimal working stub (three plain buttons + note input, no styling effort) so the app compiles and works E2E.
2. Mark the stub with `// STUB — being replaced by user, do not expand` at the top.
3. Build everything else against this **frozen contract** (define these types in `lib/types.ts` exactly):

```ts
export type Decision = 'comply' | 'partial' | 'defect';

export interface DecisionLoggerProps {
  /** Called when the user commits their decision. Parent handles the POST to /api/sessions. */
  onLog: (decision: Decision, note: string) => Promise<void>;
  /** Disable inputs while the parent is saving. */
  disabled?: boolean;
}
```

Do not change this contract. The parent page owns all API calls; DecisionLogger is pure UI.

## Architecture

```
Browser (push-to-talk mic, MediaRecorder, webm)
   → POST /api/intervene  { audioBase64, mimeType, checkIn, history }
      1. Gemini gemini-2.5-flash multimodal: audio → structured JSON via responseSchema
         { transcript, craving_intensity (1-10), temptation_type, context_tags[],
           reasoning_trace, intervention_text }
      2. Gemini TTS (gemini-2.5-flash-preview-tts): intervention_text → PCM → wrap as WAV base64
   → Browser plays audio, shows transcript + extracted vars + reasoning trace
   → User logs decision → POST /api/sessions → SQLite row
```

## Stack

- Next.js 15, App Router, TypeScript, Tailwind (scaffold with `npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm` — the directory already contains .git and two PLAN-*.md files; that's fine, work around it if create-next-app complains by scaffolding in a temp subdir and moving files)
- `@google/genai` (official SDK), `better-sqlite3`, `zod`
- Windows environment — use cross-platform paths (`path.join`), better-sqlite3 has prebuilds

## Files to build

- `lib/config.ts` — model IDs (`gemini-2.5-flash`, `gemini-2.5-flash-preview-tts`), TTS voice name const
- `lib/types.ts` — zod schemas + the frozen Decision/DecisionLoggerProps contract above; SessionRow type
- `lib/prompts.ts` — Wise Friend system prompt + Gemini responseSchema. Persona: sharp, direct, second-person friend; 2–3 sentences max; must reference the check-in numbers (sleep, streak, hunger); NOT always "no" — recommend a planned indulgence when burnout risk dominates (long streak + sleep debt + high craving). reasoning_trace explicitly weighs short-term impulse utility vs long-term value.
- `lib/gemini.ts` — client init from `process.env.GEMINI_API_KEY`; `intervene(audio, mimeType, checkIn, history)` → structured JSON; `tts(text)` → WAV base64 (Gemini TTS returns raw 24kHz 16-bit mono PCM — add a WAV header)
- `lib/db.ts` — better-sqlite3 at `data/optimal.db` (create dir if missing); `sessions` table: `id, created_at, sleep_hours, days_on_diet, hunger_level, adherence_streak_days, transcript, craving_intensity, temptation_type, context_tags (json), reasoning_trace, intervention_text, decision, user_note, latency_ms`; insert, list, CSV export helper
- `app/api/intervene/route.ts` — validates payload with zod, calls intervene() then tts(), returns JSON + audio base64 + latency_ms
- `app/api/sessions/route.ts` — GET list / POST insert; `app/api/sessions/csv/route.ts` (or query param) for CSV download
- `components/CheckInForm.tsx` — sleep hours, days on diet, hunger 1–10, adherence streak; sensible defaults; 15-second fill time
- `components/PushToTalk.tsx` — hold-to-record button (pointer events), MediaRecorder → base64; visual recording state
- `components/InterventionCard.tsx` — transcript, extracted variables, collapsible reasoning trace, auto-play + replay audio button
- `components/DecisionLogger.tsx` — STUB only (see above)
- `app/page.tsx` — session flow state machine: check-in → talk → intervention → decide → saved confirmation; multi-turn: user can talk again, keep conversation history in component state and pass to /api/intervene
- `app/history/page.tsx` — table of rows + CSV export button
- `.env.example` with `GEMINI_API_KEY=`; gitignore `data/` and `.env.local`
- `README.md` — setup (npm i, env var, npm run dev) + the 5-minute reviewer script

## Quality bar / verification

- `npm run build` must pass clean.
- Do NOT commit anything to git.
- No API key is available to you — you cannot live-test Gemini calls. Instead: make the /api/intervene route return a clear 500 message when GEMINI_API_KEY is missing, and verify the rest by running `npm run dev` and exercising `/api/sessions` (POST a fake row, GET it, export CSV).
- Keep the UI clean and demo-worthy (dark-friendly, single column, large talk button) but don't gold-plate.
