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
