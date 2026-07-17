# Optimal V1 — Rational Twin goes live (spec draft, 2026-07-17)

Owner's brief: **dual-self model + real daily-use app**. N=1 lab (just the owner,
no auth system). Target: **Vercel + cloud DB** by end of month, maintainable by
Claude Code alone afterward.

## How the persona is defined (settled 2026-07-17)

The dual-self personas are not one artifact but **four information sources
layered by maturity**, with the blend weight shifting as data accrues:

| Source | What it yields | When it dominates |
|---|---|---|
| **Elicited** (once, zero code) | `context.md` (long-run values, short-run temptation profile) + psychometric scores: Kirby MCQ (27 items → personal discounting k), Barratt Impulsiveness Scale, Food Cravings Questionnaire | Day 1 |
| **Population** (public datasets) | Literature-calibrated priors: quasi-hyperbolic meta-analyses put **β ≈ 0.68 for non-monetary rewards** (food!); delay-discounting normative data (N=357, open data + percentiles) | Weeks 1–2 |
| **Logged** (own sessions) | Regularized fit replaces priors; episodic retrieval (k-nearest past situations injected into the prompt) works from ~N=10 | Week 4+ |
| **Simulated** (LLM role-play / RL) | Offline stress-testing of interventions only — never training data | never primary |

Grounding for the timeline: the OnTrack dietary-lapse research line (Forman/
Goldstein, EMA + ML) found group models predict lapses at ~0.72 accuracy but
**generalize poorly to individuals**, and **~4 weeks of individual data** is
needed for personalized performance — empirically matching this plan's shape.

Key design decisions:
- **Priors are distributions, not point values** — posterior width IS the
  blend weight between LLM-with-context (early) and the math (later). The
  cold-start blend is the stated architecture, not an interim hack.
- **RL's home is the intervention policy, not the persona** (JITAI literature:
  learn when/how to intervene). The persona answers "what will he do";
  RL later answers "what should the Wise Friend do about it". Deferred to V2.
- At multi-user scale, this becomes hierarchical/partial pooling: new users
  start at the population prior + their onboarding elicitation, and
  personalize with their own logs — same pipeline, no rearchitecting.

## The dependency that orders everything

Only the *fitting* needs logged sessions — the model structure, priors, and
elicited persona need zero rows. But every day the app isn't deployed and in
daily use is a day of lost training data. Sequencing:

```
Pillar 0: persona elicitation + context.md + literature priors (no deploy needed)
Week 1:   deploy + mobile usability  →  daily data starts accruing
Week 2-3: fitting pipeline offline (data keeps accruing underneath)
Week 4:   fitted parameters replace priors in the intervention + CI/CD handoff
```

## Pillar 0 — Persona & priors (credential-free, can start immediately)

1. `context.md` template: long-run self (why the diet, what the payoff is
   worth, what a planned indulgence is worth vs a defection), short-run self
   (known weak spots: late-night, post-stress, social). Owner fills it in;
   `/api/intervene` injects it into the system prompt.
2. Psychometric onboarding page: Kirby MCQ (+ optionally BIS/FCQ-T), scored
   client-side → personal k/β estimates stored alongside the priors.
3. `lib/priors.json` (or table): parameter names, bounds, literature prior
   distributions (β₀ ≈ 0.68 non-monetary, spread from the meta-analyses),
   overridden by psychometric scores where measured, later by fits.

## Pillar A — Real daily-use app (Week 1)

The V0 flow is right; the delivery is wrong for daily use (localhost, desktop mic).

1. **DB migration: better-sqlite3 → Turso (libSQL).** Keeps the SQL dialect and
   the single-table simplicity; `@libsql/client` is a near drop-in for the
   `lib/db.ts` surface (insert / list / CSV). Vercel's serverless fs is
   read-only, so file-backed SQLite cannot ship — this migration is mandatory,
   not optional. (Alt considered: Vercel Postgres — heavier migration, no
   benefit at N=1 scale.)
2. **Deploy to Vercel.** `GEMINI_API_KEY` + `TURSO_*` as env vars. HTTPS from
   Vercel unlocks mobile mic access (getUserMedia requires a secure context).
3. **Access control for N=1:** a single shared secret — middleware checking a
   cookie set via one login page (or Vercel's built-in password protection).
   Explicitly NOT building accounts/auth. `owner` seam like scholarship-factory
   is unnecessary here; sessions table already has no user dimension. Revisit
   only if testers ever materialize.
4. **Mobile PWA:** manifest + icons + `apple-mobile-web-app-capable` so it
   installs to home screen; verify MediaRecorder on iOS Safari (webm→mp4/aac
   fallback — Gemini accepts both) and Android Chrome. The push-to-talk button
   is the app; it must work on the phone in the kitchen at 11pm.
5. **Friction budget: check-in ≤ 15s on phone.** Defaults pre-filled from the
   previous session's values.

**Definition of done (A):** owner logs a real temptation session from their
phone, away from the dev machine, on 3 consecutive days.

## Pillar B — Dual-self model (Weeks 2-4)

Goal: estimate the owner's dual-self parameters from logged sessions and close
the loop — the Wise Friend gets smarter about *this specific human*.

1. **Data audit first (cheap, do early):** current row already captures
   sleep_hours, days_on_diet, hunger_level, adherence_streak_days,
   craving_intensity, temptation_type, context_tags, decision, latency_ms,
   created_at. Add now (so weeks of data include them):
   - `time_of_day` bucket (derivable from created_at — no schema change, just
     confirm timezone correctness on Vercel UTC).
   - `intervention_stance` — did the Wise Friend recommend resist vs planned
     indulgence? (Extractable from reasoning_trace via one enum field in the
     responseSchema; needed to separate "complied with resist" from "complied
     with indulge".)
2. **Model v1 — logistic compliance model** (offline script in `scripts/`,
   Python or TS): P(defect | craving, sleep debt, streak, hunger, time_of_day,
   stance). Honest N=1 framing: with <100 rows this is a regularized 5-8
   parameter fit, not a research result. Output: per-feature weights +
   calibration curve, exported as JSON.
3. **Model v2 — β-δ interpretation layer:** map the fitted weights onto the
   Fudenberg-Levine dual-self / quasi-hyperbolic frame — a `beta_hat`
   (present-bias severity under craving) and self-control cost estimate. This
   is an interpretation of the logistic fit, not a separate estimator, until
   data volume justifies structural estimation.
4. **Close the loop:** inject the fitted parameters into the intervention
   prompt ("historically, defection risk at this craving level + sleep debt is
   ~70%; planned indulgence has saved streaks better than white-knuckling") —
   `lib/prompts.ts` takes a `modelSummary` param; `/api/intervene` loads the
   latest fit JSON.
5. **Weekly refit** — a `scripts/refit` run (manual or GitHub Action cron).

**Definition of done (B):** intervention text demonstrably references fitted
personal parameters; refit is one command.

## CI/CD handoff (Week 4, non-negotiable)

- GitHub Actions: `npm run build` + `npm run lint` on PR to main; Vercel
  auto-deploys main.
- `AGENTS.md` updated with: verification commands, Turso schema notes, refit
  procedure — so Claude Code can maintain solo post-month.

## Tooling split (this month only)

| Work | Tool |
|---|---|
| This spec, architecture reviews, model-design judgment | Devin + Fable 5 (quota, sparingly) |
| DB migration, PWA, deploy plumbing, scripts | Devin + GLM-5.2 (free) |
| Live debugging, UI iteration | Claude Code |

## Open questions (owner to settle)

1. Turso free tier OK, or prefer keeping data fully local + PWA on home
   network instead? (Turso free: 500 DBs / 9GB — plenty; but data leaves the
   machine.)
2. Notifications / proactive check-ins were explicitly deferred — confirm.
3. Multi-turn history is in-memory per session today; should conversation
   history persist across sessions for the Wise Friend's memory? (Deferred to
   V2 unless daily use proves it's needed.)
