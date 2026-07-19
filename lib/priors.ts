// ─────────────────────────────────────────────────────────────────────────
// lib/priors — literature-calibrated prior distributions (Source 2 of 4).
//
// Per PLAN-V1.md: "Priors are distributions, not point values — posterior
// width IS the blend weight between LLM-with-context (early) and the math
// (later)." These are the *population* layer: they hold before any of the
// owner's own sessions are logged, get overridden by psychometric scores
// (Kirby MCQ etc.) where measured, and are later replaced by regularized fits.
//
// Every distribution below is a starting point drawn from published work, not
// a fitted result. The point is to standardize the range of each parameter so
// any principled estimate beats a null — exactly the cold-start architecture
// the spec calls for. Sources are cited inline so they can be audited and
// updated as better data is found.
// ─────────────────────────────────────────────────────────────────────────

/**
 * A prior over a single behavioral parameter. `dist` describes the shape used
 * for sampling / posterior width; `bounds` are hard admissible limits used to
 * standardize and clip any estimate (elicited, population, or fitted).
 */
export interface ParameterPrior {
  /** Stable machine key. */
  key: string;
  /** Human-readable name. */
  name: string;
  /** What the parameter means and how it enters the model. */
  description: string;
  /** Hard admissible range [min, max] — used to standardize/clip estimates. */
  bounds: [number, number];
  /** Prior distribution. `sd`/`spread` encode uncertainty (→ blend weight). */
  dist:
    | { family: "beta"; alpha: number; beta: number; mean: number }
    | { family: "lognormal"; meanlog: number; sdlog: number; median: number }
    | { family: "normal"; mean: number; sd: number };
  /** Literature the prior is calibrated from. */
  source: string;
}

/**
 * β — quasi-hyperbolic present-bias factor (Laibson βδ). Lower β = stronger
 * "grab it now" pull. The headline calibration in PLAN-V1.md: meta-analyses of
 * quasi-hyperbolic discounting put β ≈ 0.68 for NON-MONETARY rewards (food,
 * primary rewards) — markedly more present-biased than the ~0.9 typical of
 * money. Since Optimal is about food temptations, the food figure is the right
 * prior. Modeled as a Beta on (0,1) centered near 0.68 with meaningful spread.
 */
export const BETA_PRESENT_BIAS: ParameterPrior = {
  key: "beta_present_bias",
  name: "Present-bias factor β (quasi-hyperbolic)",
  description:
    "Laibson βδ present-bias weight applied to all future utility. β=1 is a " +
    "time-consistent planner; lower β means the short-run self discounts the " +
    "diet payoff harder in the moment. Non-monetary/primary rewards (food) " +
    "are more present-biased than money.",
  bounds: [0, 1],
  // Beta(6.5, 3.06) → mean ≈ 0.680, sd ≈ 0.14: wide enough that early on the
  // LLM-with-context dominates, tightening only as personal data accrues.
  dist: { family: "beta", alpha: 6.5, beta: 3.06, mean: 0.68 },
  source:
    "Quasi-hyperbolic discounting meta-analyses; β≈0.68 for non-monetary " +
    "rewards vs ~0.9 for monetary (see PLAN-V1.md, Pillar 0).",
};

/**
 * k — hyperbolic delay-discounting rate from the Kirby Monetary Choice
 * Questionnaire, V(t)=A/(1+k·t). Kirby's normative work reports k as roughly
 * log-normal across people; the population geometric mean sits around
 * k≈0.013 /day. This is the prior that the owner's own Kirby MCQ score
 * (lib/kirby.ts) overrides once onboarding is done.
 */
export const K_DISCOUNT_RATE: ParameterPrior = {
  key: "k_discount_rate",
  name: "Hyperbolic discount rate k (per day)",
  description:
    "Delay-discounting rate in V=A/(1+k·t) estimated from the Kirby MCQ. " +
    "Higher k = steeper discounting of delayed rewards. Overridden by the " +
    "owner's own Kirby score where measured.",
  // Kirby's item set spans k∈[0.00016, 0.25]; use that as admissible bounds.
  bounds: [0.00016, 0.25],
  // Lognormal with median ≈ 0.013/day (meanlog=ln(0.013)≈-4.34), sdlog≈1.3
  // reflecting the wide between-person spread in the normative data.
  dist: { family: "lognormal", meanlog: -4.34, sdlog: 1.3, median: 0.013 },
  source:
    "Kirby, Petry & Bickel (1999) Monetary Choice Questionnaire normative " +
    "k distribution; open delay-discounting datasets (N≈357 percentiles).",
};

/**
 * Baseline per-session probability of defecting (giving in) under an average
 * craving, before conditioning on state. Anchors the logistic compliance model
 * (Pillar B) so it is regularized toward a sane intercept at N=0. The OnTrack
 * dietary-lapse line reports group lapse models around ~0.72 accuracy but
 * meaningful base lapse rates; we center the prior at a coin-flip-ish 0.35 with
 * wide spread since the true N=1 rate is unknown until data arrives.
 */
export const DEFECT_BASE_RATE: ParameterPrior = {
  key: "defect_base_rate",
  name: "Baseline defection probability",
  description:
    "Prior P(defect) at average craving/state, before personal conditioning. " +
    "Used as the regularizing intercept for the Pillar B logistic model.",
  bounds: [0, 1],
  // Beta(3.5, 6.5) → mean ≈ 0.35, sd ≈ 0.145.
  dist: { family: "beta", alpha: 3.5, beta: 6.5, mean: 0.35 },
  source:
    "OnTrack dietary-lapse EMA/ML line (Forman/Goldstein): group lapse " +
    "models ~0.72 accuracy, generalize poorly to individuals; ~4wk of " +
    "personal data needed (see PLAN-V1.md timeline).",
};

/**
 * Craving intensity (1–10) sensitivity — the log-odds increase in defection
 * per one-point rise in craving. Weakly-informative positive prior: more
 * craving should raise defection risk, but the magnitude is unknown at N=0.
 */
export const CRAVING_SENSITIVITY: ParameterPrior = {
  key: "craving_sensitivity",
  name: "Craving→defection sensitivity (log-odds / point)",
  description:
    "Change in log-odds of defection per +1 craving_intensity point. " +
    "Weakly-informative positive prior for the Pillar B logistic model.",
  bounds: [-2, 2],
  dist: { family: "normal", mean: 0.4, sd: 0.4 },
  source:
    "Weakly-informative; sign from craving→lapse EMA associations, magnitude " +
    "regularized pending personal fit.",
};

/**
 * Sleep-debt sensitivity — log-odds increase in defection per hour of sleep
 * below a 7.5h reference. Self-control is depleted under sleep debt; small
 * positive prior, wide.
 */
export const SLEEP_DEBT_SENSITIVITY: ParameterPrior = {
  key: "sleep_debt_sensitivity",
  name: "Sleep-debt→defection sensitivity (log-odds / hour)",
  description:
    "Change in log-odds of defection per hour of sleep below a 7.5h " +
    "reference. Captures self-control depletion under sleep debt.",
  bounds: [-1, 1],
  dist: { family: "normal", mean: 0.2, sd: 0.3 },
  source:
    "Weakly-informative; sleep-restriction → self-control/eating literature.",
};

export const PRIORS: ParameterPrior[] = [
  BETA_PRESENT_BIAS,
  K_DISCOUNT_RATE,
  DEFECT_BASE_RATE,
  CRAVING_SENSITIVITY,
  SLEEP_DEBT_SENSITIVITY,
];

const PRIORS_BY_KEY: Record<string, ParameterPrior> = Object.fromEntries(
  PRIORS.map((p) => [p.key, p])
);

/** Central tendency (mean/median) of a prior — the point estimate at N=0. */
export function priorCenter(prior: ParameterPrior): number {
  switch (prior.dist.family) {
    case "beta":
      return prior.dist.mean;
    case "lognormal":
      return prior.dist.median;
    case "normal":
      return prior.dist.mean;
  }
}

/** Clamp a value into a parameter's admissible bounds. */
export function clampToBounds(prior: ParameterPrior, value: number): number {
  const [min, max] = prior.bounds;
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolve the current best estimate for a parameter: a measured value (from
 * psychometric onboarding or a fit) if provided, otherwise the population
 * prior center. Measured values are clamped to admissible bounds. This is the
 * seam where the four information sources layer by maturity.
 */
export function resolveParameter(
  key: string,
  measured?: number | null
): { value: number; source: "measured" | "prior" } {
  const prior = PRIORS_BY_KEY[key];
  if (!prior) {
    throw new Error(`Unknown prior key: ${key}`);
  }
  if (measured != null && Number.isFinite(measured)) {
    return { value: clampToBounds(prior, measured), source: "measured" };
  }
  return { value: priorCenter(prior), source: "prior" };
}
