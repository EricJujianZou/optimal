// ─────────────────────────────────────────────────────────────────────────
// lib/kirby — Kirby Monetary Choice Questionnaire (27 items) + scoring.
//
// The MCQ (Kirby, Petry & Bickel, 1999) estimates a person's hyperbolic
// discount rate k in V = A / (1 + k·t) from 27 forced choices between a
// smaller-immediate and a larger-delayed reward. Each item is pre-designed so
// that a specific k value sits at the indifference point:
//     k_item = (delayed / immediate − 1) / delay_days
// Items are grouped into small / medium / large reward magnitudes (9 each),
// which is standard because k tends to fall as magnitude rises.
//
// Scoring (Kirby's consistency method): for each candidate k, predict every
// choice (choose delayed iff candidate_k < k_item) and count matches. The
// estimate is the candidate maximizing consistency; ties are broken by the
// geometric mean of the tied candidates. All of it runs client-side.
// ─────────────────────────────────────────────────────────────────────────

export type RewardSize = "small" | "medium" | "large";

export interface KirbyItem {
  id: number;
  immediate: number;
  delayed: number;
  delayDays: number;
  size: RewardSize;
  /** k at which the two options are equally valued (design constant). */
  k: number;
}

// Canonical 27-item MCQ (Kirby, Petry & Bickel, 1999), in the standard
// administration order. `k` is the published indifference value per item.
export const KIRBY_ITEMS: KirbyItem[] = [
  { id: 1, immediate: 54, delayed: 55, delayDays: 117, size: "medium", k: 0.00016 },
  { id: 2, immediate: 55, delayed: 75, delayDays: 61, size: "large", k: 0.006 },
  { id: 3, immediate: 19, delayed: 25, delayDays: 53, size: "small", k: 0.006 },
  { id: 4, immediate: 31, delayed: 85, delayDays: 7, size: "large", k: 0.25 },
  { id: 5, immediate: 14, delayed: 25, delayDays: 19, size: "small", k: 0.041 },
  { id: 6, immediate: 47, delayed: 50, delayDays: 160, size: "medium", k: 0.0004 },
  { id: 7, immediate: 15, delayed: 35, delayDays: 13, size: "small", k: 0.1 },
  { id: 8, immediate: 25, delayed: 60, delayDays: 14, size: "medium", k: 0.1 },
  { id: 9, immediate: 78, delayed: 80, delayDays: 162, size: "large", k: 0.00016 },
  { id: 10, immediate: 40, delayed: 55, delayDays: 62, size: "medium", k: 0.006 },
  { id: 11, immediate: 11, delayed: 30, delayDays: 7, size: "small", k: 0.25 },
  { id: 12, immediate: 67, delayed: 75, delayDays: 119, size: "large", k: 0.001 },
  { id: 13, immediate: 34, delayed: 35, delayDays: 186, size: "small", k: 0.00016 },
  { id: 14, immediate: 27, delayed: 50, delayDays: 21, size: "medium", k: 0.041 },
  { id: 15, immediate: 69, delayed: 85, delayDays: 91, size: "large", k: 0.0025 },
  { id: 16, immediate: 49, delayed: 60, delayDays: 89, size: "medium", k: 0.0025 },
  { id: 17, immediate: 80, delayed: 85, delayDays: 157, size: "large", k: 0.0004 },
  { id: 18, immediate: 24, delayed: 35, delayDays: 29, size: "small", k: 0.016 },
  { id: 19, immediate: 33, delayed: 80, delayDays: 14, size: "large", k: 0.1 },
  { id: 20, immediate: 28, delayed: 30, delayDays: 179, size: "small", k: 0.0004 },
  { id: 21, immediate: 34, delayed: 50, delayDays: 30, size: "medium", k: 0.016 },
  { id: 22, immediate: 25, delayed: 30, delayDays: 80, size: "small", k: 0.0025 },
  { id: 23, immediate: 41, delayed: 75, delayDays: 20, size: "large", k: 0.041 },
  { id: 24, immediate: 54, delayed: 60, delayDays: 111, size: "medium", k: 0.001 },
  { id: 25, immediate: 54, delayed: 80, delayDays: 30, size: "large", k: 0.016 },
  { id: 26, immediate: 22, delayed: 25, delayDays: 136, size: "small", k: 0.001 },
  { id: 27, immediate: 20, delayed: 55, delayDays: 7, size: "medium", k: 0.25 },
];

/** A choice on one item: "immediate" (smaller-sooner) or "delayed" (larger-later). */
export type KirbyChoice = "immediate" | "delayed";

export type KirbyResponses = Record<number, KirbyChoice>;

export interface KirbyScore {
  /** Geometric-mean discount rate over all 27 items. */
  kOverall: number;
  kSmall: number;
  kMedium: number;
  kLarge: number;
  /** Fraction of choices consistent with the estimated k (0–1). */
  consistency: number;
  /** log10(kOverall) — convenient for plotting against normative percentiles. */
  logK: number;
}

// The nine design k levels (ascending), shared by the estimator.
const K_LEVELS = [
  0.00016, 0.0004, 0.001, 0.0025, 0.006, 0.016, 0.041, 0.1, 0.25,
];

// Candidate k values sit at the geometric midpoints between adjacent design
// levels, plus below the lowest and above the highest — Kirby's standard grid.
function candidateKs(): number[] {
  const candidates: number[] = [K_LEVELS[0] / 2];
  for (let i = 0; i < K_LEVELS.length - 1; i++) {
    candidates.push(Math.sqrt(K_LEVELS[i] * K_LEVELS[i + 1]));
  }
  candidates.push(K_LEVELS[K_LEVELS.length - 1] * 2);
  return candidates;
}

function geoMean(values: number[]): number {
  const sumLogs = values.reduce((acc, v) => acc + Math.log(v), 0);
  return Math.exp(sumLogs / values.length);
}

/**
 * Estimate k for a set of items using Kirby's consistency method. Returns the
 * best-fitting k (geometric mean of tied candidates) and the consistency
 * fraction achieved. `null` if no items were answered.
 */
function estimateK(
  items: KirbyItem[],
  responses: KirbyResponses
): { k: number; consistency: number } | null {
  const answered = items.filter((it) => responses[it.id]);
  if (answered.length === 0) return null;

  let bestConsistency = -1;
  let bestCandidates: number[] = [];

  for (const candidate of candidateKs()) {
    let matches = 0;
    for (const item of answered) {
      // At candidate k below the item's indifference k, the delayed reward is
      // still worth more → predict "delayed"; otherwise "immediate".
      const predicted: KirbyChoice =
        candidate < item.k ? "delayed" : "immediate";
      if (predicted === responses[item.id]) matches++;
    }
    const consistency = matches / answered.length;
    if (consistency > bestConsistency + 1e-9) {
      bestConsistency = consistency;
      bestCandidates = [candidate];
    } else if (Math.abs(consistency - bestConsistency) <= 1e-9) {
      bestCandidates.push(candidate);
    }
  }

  return { k: geoMean(bestCandidates), consistency: bestConsistency };
}

/**
 * Score a full (or partial) MCQ response set. Returns per-magnitude and
 * overall k estimates plus overall consistency, or null if nothing answered.
 */
export function scoreKirby(responses: KirbyResponses): KirbyScore | null {
  const overall = estimateK(KIRBY_ITEMS, responses);
  if (!overall) return null;

  const bySize = (size: RewardSize) =>
    estimateK(
      KIRBY_ITEMS.filter((it) => it.size === size),
      responses
    )?.k ?? overall.k;

  return {
    kOverall: overall.k,
    kSmall: bySize("small"),
    kMedium: bySize("medium"),
    kLarge: bySize("large"),
    consistency: overall.consistency,
    logK: Math.log10(overall.k),
  };
}
