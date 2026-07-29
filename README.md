# Megamind — life decision advisor

**Primary demo:** speak or type a situation at
[`/decide`](http://localhost:3000/decide) → Megamind returns a clear
recommendation, why, and spoken advice. Live facts (search, maps, weather,
forex, holidays, etc.) are gathered server-side when they flip the answer.
Clarifying questions appear only when a missing personal fact would change #1.

The marketing waitlist lives at `/`. The older diet “Wise Friend” lab remains
at `/session` (history `/history`, Kirby `/onboarding`) but is not linked from
the primary nav.

## Quick start

```bash
npm install
cp .env.example .env.local
# Edit .env.local — add keys (never commit this file)
npm run dev
```

Open [http://localhost:3000/decide](http://localhost:3000/decide).

### Environment (`.env.local`)

Copy from `.env.example`. **Do not commit real keys.**

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | **Yes** for `/decide` | LLM synthesis via [OpenRouter](https://openrouter.ai/) |
| `OPENROUTER_MODEL` | No | Default `inclusionai/ling-3.0-flash:free` |
| `EXA_API_KEY` | No | Better web search; falls back to DuckDuckGo/Jina |
| `GEMINI_API_KEY` | No for decide | Still used by legacy `/session` TTS / intervene |

```bash
# .env.example shape (values stay empty in git)
OPENROUTER_API_KEY=
OPENROUTER_MODEL=inclusionai/ling-3.0-flash:free
EXA_API_KEY=
GEMINI_API_KEY=
```

Session/decision data: `data/optimal.db` (SQLite, gitignored).

## How decide works

```
UI /decide
  → POST /api/decide  (SSE by default; JSON if Accept: application/json)
  → playbook prefetch (tip / commute / weather / forex / nearby / … — no LLM tool round)
  → one OpenRouter synthesis call with facts in the prompt
  → SSE: stage → sources → partial → final
```

User-facing copy is sanitized so internal tool names / priors / playbook jargon
do not leak into recommendation / why / spoken advice.

## Eval & stress scripts

With the dev server running (default scripts target `http://localhost:3001`
unless you pass a base URL):

```bash
# Golden everyday dilemmas
npm run eval:decide
# or: node scripts/eval-decide.mjs http://localhost:3000

# Broad stress battery (~45 cases)
node scripts/stress-decide.mjs http://localhost:3000

# Real-world dilemmas (career / rent / tip / health / …)
node scripts/real-dilemmas.mjs http://localhost:3000

# Quick smoke
node scripts/smoke-decide.mjs
```

Free OpenRouter tiers rate-limit easily — scripts run **sequentially** with
retries/gaps. Latest run summaries write to `scripts/*-last.json` (gitignored).

## Internet reach (Agent-Reach style)

In-process channels in `lib/agent-reach.ts`:

| Channel | Backend |
|---------|---------|
| Search | Exa (`EXA_API_KEY`) → DDG/Jina |
| Web | Jina Reader |
| GitHub | `gh` or public API |
| YouTube | `yt-dlp` or oEmbed + Jina |
| RSS/Atom | Native XML (`reach_rss`) |
| Reddit / V2EX / LinkedIn / X | Best-effort public/Jina |

Decide playbooks call these via tools such as `reach_search`, `reach_read`,
`plan_trip`, `find_nearby`, `weather`, `forex_rate`, `public_holidays`, etc.

## Diet lab (legacy)

`/session` still uses Gemini for the Wise Friend food-temptation flow. See
older notes in `PLAN-YOURS.md` if you need that path. Get a Gemini key at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## Stack

Next.js (App Router) + TypeScript + Tailwind, OpenRouter (decide), optional
`@google/genai` (legacy), `better-sqlite3`, `zod`.

## Notes

- Never commit `.env.local` or paste API keys into issues/PRs.
- `npm run build` should pass before shipping.
