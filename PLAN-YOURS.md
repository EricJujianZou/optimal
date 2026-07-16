# Optimal V0 — Your Component: DecisionLogger

## What it is

The end-of-session UI where the user logs whether they actually complied with the intervention. This is the single most important data point in V0 (it's the compliance signal the whole experiment exists to measure), and it's fully independent: pure UI, no API calls, no shared state beyond props.

## The frozen contract (already defined in `lib/types.ts` by the agent — import from there)

```ts
export type Decision = 'comply' | 'partial' | 'defect';

export interface DecisionLoggerProps {
  /** Called when the user commits their decision. Parent handles the POST to /api/sessions. */
  onLog: (decision: Decision, note: string) => Promise<void>;
  /** Disable inputs while the parent is saving. */
  disabled?: boolean;
}
```

## File

Replace the stub at `components/DecisionLogger.tsx` (marked `// STUB`). Client component (`"use client"`), Tailwind styling.

## Requirements

1. Three choice buttons: **Complied** / **Partial** / **Defected** — visually distinct (e.g. green / amber / red accents), selected state clearly visible.
2. Optional free-text note ("what actually happened / how do you feel"), single textarea, no validation needed.
3. A commit button that calls `await onLog(decision, note)`; disabled until a decision is selected, and while `disabled` prop is true or the promise is pending. Show a brief saving state.
4. Handle onLog rejection gracefully (keep inputs, show a small error line, allow retry).
5. Keep it fast to use — this is the last 10 seconds of a 5-minute demo.

## Nice-to-have (only if you feel like it)

- Keyboard shortcuts 1/2/3 for the three decisions.
- A one-line microcopy prompt that reduces social-desirability bias ("Be honest — defect data is the most valuable data").
