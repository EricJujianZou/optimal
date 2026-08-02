import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────
// Frozen contract — shared with components/DecisionLogger.tsx (built by the
// user in parallel). Do not change these without updating that component.
// ─────────────────────────────────────────────────────────────────────────

export type Decision = "comply" | "partial" | "defect";

export interface DecisionLoggerProps {
  /** Called when the user commits their decision. Parent handles the POST to /api/sessions. */
  onLog: (decision: Decision, note: string) => Promise<void>;
  /** Disable inputs while the parent is saving. */
  disabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Check-in
// ─────────────────────────────────────────────────────────────────────────

export const CheckInSchema = z.object({
  sleepHours: z.number().min(0).max(24),
  daysOnDiet: z.number().int().min(0),
  hungerLevel: z.number().int().min(1).max(10),
  adherenceStreakDays: z.number().int().min(0),
});

export type CheckIn = z.infer<typeof CheckInSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Conversation history (multi-turn)
// ─────────────────────────────────────────────────────────────────────────

export const HistoryTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
});

export type HistoryTurn = z.infer<typeof HistoryTurnSchema>;

// ─────────────────────────────────────────────────────────────────────────
// /api/intervene
// ─────────────────────────────────────────────────────────────────────────

export const IntervenePayloadSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
  checkIn: CheckInSchema,
  history: z.array(HistoryTurnSchema).default([]),
});

export type IntervenePayload = z.infer<typeof IntervenePayloadSchema>;

// Structured output requested from Gemini (responseSchema) for the
// audio -> reasoning step.
export const InterveneResultSchema = z.object({
  transcript: z.string(),
  craving_intensity: z.number().int().min(1).max(10),
  temptation_type: z.string(),
  context_tags: z.array(z.string()),
  reasoning_trace: z.string(),
  intervention_text: z.string(),
});

export type InterveneResult = z.infer<typeof InterveneResultSchema>;

// Full API response: reasoning result + synthesized audio.
export interface InterveneResponse extends InterveneResult {
  audioBase64: string;
  audioMimeType: string;
  latencyMs: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Sessions (SQLite)
// ─────────────────────────────────────────────────────────────────────────

export interface SessionRow {
  id: number;
  created_at: string;
  sleep_hours: number;
  days_on_diet: number;
  hunger_level: number;
  adherence_streak_days: number;
  transcript: string;
  craving_intensity: number;
  temptation_type: string;
  context_tags: string; // JSON-encoded string[]
  reasoning_trace: string;
  intervention_text: string;
  decision: Decision;
  user_note: string;
  latency_ms: number;
}

export const NewSessionSchema = z.object({
  sleep_hours: z.number().min(0).max(24),
  days_on_diet: z.number().int().min(0),
  hunger_level: z.number().int().min(1).max(10),
  adherence_streak_days: z.number().int().min(0),
  transcript: z.string(),
  craving_intensity: z.number().int().min(1).max(10),
  temptation_type: z.string(),
  context_tags: z.array(z.string()).default([]),
  reasoning_trace: z.string(),
  intervention_text: z.string(),
  decision: z.enum(["comply", "partial", "defect"]),
  user_note: z.string().default(""),
  latency_ms: z.number().int().min(0).default(0),
});

export type NewSession = z.infer<typeof NewSessionSchema>;

// ─────────────────────────────────────────────────────────────────────────
// /api/decide — general life decisions
// ─────────────────────────────────────────────────────────────────────────

export const AmendIntentSchema = z.enum([
  "push_back",
  "add_fact",
  "go_deeper",
]);

export type AmendIntent = z.infer<typeof AmendIntentSchema>;

export const DecidePayloadSchema = z
  .object({
    audioBase64: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    textSituation: z.string().min(1).optional(),
    history: z.array(HistoryTurnSchema).default([]),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    /** How the user wants to amend the last call — shapes synthesis, not playbooks. */
    amendIntent: AmendIntentSchema.optional(),
  })
  .refine(
    (v) =>
      Boolean(v.textSituation?.trim()) ||
      (Boolean(v.audioBase64) && Boolean(v.mimeType)),
    { message: "Provide textSituation or audioBase64+mimeType." }
  );

export type DecidePayload = z.infer<typeof DecidePayloadSchema>;

export const ProfilePrefsSchema = z.object({
  risk_tolerance: z.enum(["low", "medium", "high"]).optional(),
  money_anxiety: z.enum(["low", "medium", "high"]).optional(),
  default_tip_pct: z.number().min(0).max(40).optional(),
  home_label: z.string().max(120).optional(),
  work_label: z.string().max(120).optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  hard_constraints: z.string().max(400).optional(),
});

export type ProfilePrefs = z.infer<typeof ProfilePrefsSchema>;

export const DecideFeedbackSchema = z.object({
  decisionId: z.number().int().positive(),
  outcome: z.enum(["did_it", "did_other", "ignored"]),
  note: z.string().max(400).optional(),
});

export type DecideFeedback = z.infer<typeof DecideFeedbackSchema>;

export const AlternativeSchema = z.object({
  option: z.string(),
  confidence: z.coerce.number().min(0).max(1),
  note: z.string(),
});

/** Internal scores — never sent to the client. Slim: one score per option. */
export const EvaluationItemSchema = z.object({
  option: z.string(),
  score: z.coerce.number().min(0).max(10).default(5),
  note: z.string().default(""),
  // Legacy fields optional so old shapes don't crash parsers.
  short_run_temptation: z.coerce.number().min(0).max(10).optional(),
  long_run_benefit: z.coerce.number().min(0).max(10).optional(),
  self_control_cost: z.coerce.number().min(0).max(10).optional(),
  feasibility: z.coerce.number().min(0).max(10).optional(),
  ethics_other_regarding: z.coerce.number().min(0).max(10).optional(),
  commitment_leverage: z.coerce.number().min(0).max(10).optional(),
});

export const DecideResultSchema = z.object({
  status: z.preprocess((v) => {
    const s = String(v ?? "").toLowerCase();
    return s === "clarify" ? "clarify" : "decide";
  }, z.enum(["clarify", "decide"])),
  transcript: z.string().default(""),
  clarifying_questions: z.array(z.string()).default([]),
  options: z.array(z.string()).default([]),
  options_source: z.preprocess((v) => {
    const s = String(v ?? "").toLowerCase();
    return s === "user" || s === "inferred" || s === "mixed" ? s : "inferred";
  }, z.enum(["user", "inferred", "mixed"])),
  evaluation: z.array(EvaluationItemSchema).default([]),
  recommendation: z.string().default(""),
  user_preference_conflict: z.boolean().default(false),
  why: z.string().default(""),
  alternatives: z.array(AlternativeSchema).default([]),
  /** Internal only — used to calibrate spoken tone. Never shown in UI. */
  confidence: z.coerce.number().min(0).max(1).default(0),
  spoken_advice: z.string().default(""),
  profile_update: z.string().optional().default(""),
});

export type DecideResult = z.infer<typeof DecideResultSchema>;

/** Public density signal — derived from confidence & context; never show raw %. */
export type DecideWeight = "everyday" | "heavy";

/** Public API response. Raw confidence/evaluation omitted from client display. */
export interface DecideResponse {
  status: "clarify" | "decide";
  transcript: string;
  clarifying_questions: string[];
  options: string[];
  options_source: "user" | "inferred" | "mixed";
  recommendation: string;
  user_preference_conflict: boolean;
  why: string;
  alternatives: { option: string; note: string }[];
  spoken_advice: string;
  audioBase64: string | null;
  audioMimeType: string | null;
  latencyMs: number;
  decisionId: number | null;
  /** DuckDuckGo snippets used for this answer (titles only for UI). */
  sources?: { title: string }[];
  /** Adaptive UI density — everyday compact, heavy expanded. */
  weight: DecideWeight;
  /** Short labels from lasting profile/prefs used for this call. */
  memory_hints: string[];
}

export interface ProfileRow {
  id: number;
  summary: string;
  prefs_json: string;
  updated_at: string;
}

export interface ProfileEventRow {
  id: number;
  created_at: string;
  kind: string;
  content: string;
  decision_id: number | null;
}

export interface DecisionRow {
  id: number;
  created_at: string;
  transcript: string;
  extra_context: string;
  options_json: string;
  options_source: string;
  recommendation: string;
  why: string;
  alternatives_json: string;
  confidence: number;
  spoken_advice: string;
  latency_ms: number;
}

export interface NewDecisionRecord {
  transcript: string;
  extra_context: string;
  options: string[];
  options_source: string;
  recommendation: string;
  why: string;
  alternatives: z.infer<typeof AlternativeSchema>[];
  confidence: number;
  spoken_advice: string;
  latency_ms: number;
}
