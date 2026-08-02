# Design — Night study

## Theme

Warm near-black “night study” for decisions. Graphite ink with a warm/olive undertone — never cool cyber navy. One muted brass accent for primary action and listening state (~5% of pixels). Depth via surface steps and hairlines, not glow orbs or multi-layer shadows.

## Color

| Token | Role |
|-------|------|
| `--ink` | Body background (warm near-black) |
| `--ink-elevated` | Sheets, panels, elevated surfaces |
| `--paper` | Primary text / light ink on dark |
| `--muted` | Secondary text (≥4.5:1 on ink) |
| `--muted-dim` | Tertiary labels |
| `--brass` | Accent — CTA fill, listening waveform |
| `--danger` | Errors / destructive |
| `--line` | Hairline borders |
| `--focus-ring` | Focus outline |

No cream body, purple, neon, or glow blobs.

## Typography

- **Serif (Source Serif 4):** Verdict recommendation, brand wordmark moments, clarify question stems.
- **Sans (DM Sans):** UI chrome, body, why prose, controls.
- Verdict tracking floor ≥ -0.04em. Body line length ~65–75ch in the reading column (~560–640px).

## Layout

Narrow reading column for decide. Verdict owns the first viewport of the result stage. No cards in the hero. Modest radii (6–12px). Landing: full-bleed film hero; brand as hero-level signal; one promise + CTA group.

## Components

- **VoiceControl:** Idle / listening / weighing / speaking. Brass waveform when listening; never frantic rings.
- **VerdictSheet:** Adaptive everyday vs heavy density.
- **AmendBar:** Push back / Add a fact / Go deeper — amends the sheet.
- **MemorySheet:** “What Megamind knows” — lasting preferences + recent notes.
- **ClarifyStage:** 1–3 questions with why-this-matters microcopy.

## Motion

200–350ms ease-out settles. Verdict “places” on the page. Waveform breathes ~0.8–1.2s. Reduced motion: no loops; crossfade or instant.

## Anti-patterns

Rounded-full pill clusters, Inter, Syne-as-everything, chat bubbles as primary UI, equal-weight alternative lists, decorative AI glow.
