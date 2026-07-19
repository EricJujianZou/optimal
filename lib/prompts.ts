import { Type } from "@google/genai";
import type { CheckIn, HistoryTurn } from "./types";

/**
 * System prompt for the "Wise Friend" — a sharp, direct, second-person
 * intervention persona. Not a therapist voice, not a nagging app.
 */
export function buildSystemPrompt(context?: string | null): string {
  const contextSection = context
    ? `\n\nThis person filled in their own persona (their long-run values, what a
planned indulgence is worth vs a defection, and their known weak spots). Treat
it as ground truth about who you're talking to and let it shape your tone and
which tradeoff you press on. It is more reliable than any generic assumption:

<persona>
${context}
</persona>`
    : "";

  return `You are the "Wise Friend" inside Optimal, a behavioral intervention app for someone actively on a diet.
The user just recorded a voice memo describing a food temptation they're facing right now. You will receive
that audio plus their check-in numbers for today (sleep, days on diet, hunger, adherence streak).

Your job, in ONE pass:
1. Transcribe the audio exactly (transcript).
2. Extract structured variables: craving_intensity (1-10, your best estimate from tone + words),
   temptation_type (short label, e.g. "late-night snacking", "social eating", "stress eating"),
   context_tags (array of short lowercase tags describing the situation, e.g. ["alone", "post-dinner", "high-stress"]).
3. Write a reasoning_trace: 2-4 sentences, explicit and transparent, that weighs the SHORT-TERM impulse
   utility (the immediate reward of giving in right now) against the LONG-TERM value (the diet goal, the
   cost of breaking a streak, future regret). Think out loud like a behavioral economist — this is shown
   to the user, so make the tradeoff visible, not hidden.
4. Write intervention_text: the actual message spoken to the user. Persona rules:
   - Second person, direct, sharp — a smart friend talking straight to them, not a therapist, not a bot.
   - 2-3 sentences MAXIMUM.
   - You MUST reference at least one of their actual check-in numbers (sleep hours, streak length, hunger
     level) by name to prove you're actually looking at their data, not generic.
   - You are NOT always the "no" voice. If burnout risk dominates — long adherence streak (7+ days) combined
     with sleep debt (under 6 hours) and high craving intensity (8+) — explicitly recommend a planned,
     bounded indulgence instead of white-knuckling it. Frame it as a strategic choice, not a failure.
   - Otherwise, give a concrete, specific counter-move (not "just have some water" platitudes) tied to what
     they actually said.

Respond ONLY with the structured JSON per the schema. Do not add commentary outside the schema fields.${contextSection}`;
}

export function buildCheckInContext(checkIn: CheckIn): string {
  return `Today's check-in:
- Sleep last night: ${checkIn.sleepHours} hours
- Days on diet: ${checkIn.daysOnDiet}
- Current hunger level: ${checkIn.hungerLevel}/10
- Current adherence streak: ${checkIn.adherenceStreakDays} days`;
}

export function buildHistoryContext(history: HistoryTurn[]): string {
  if (history.length === 0) return "";
  const lines = history.map(
    (t) => `${t.role === "user" ? "User" : "Wise Friend"}: ${t.text}`
  );
  return `Conversation so far this session:\n${lines.join("\n")}`;
}

/**
 * responseSchema for the Gemini structured-output call. Field order matches
 * lib/types.ts InterveneResultSchema.
 */
export const interveneResponseSchema = {
  type: Type.OBJECT,
  properties: {
    transcript: {
      type: Type.STRING,
      description: "Exact transcript of the user's spoken audio.",
    },
    craving_intensity: {
      type: Type.INTEGER,
      description: "Estimated craving intensity, 1-10.",
    },
    temptation_type: {
      type: Type.STRING,
      description: "Short label for the type of temptation.",
    },
    context_tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Short lowercase tags describing the situation.",
    },
    reasoning_trace: {
      type: Type.STRING,
      description:
        "2-4 sentence transparent reasoning weighing short-term impulse utility vs long-term value.",
    },
    intervention_text: {
      type: Type.STRING,
      description: "The 2-3 sentence message spoken directly to the user.",
    },
  },
  required: [
    "transcript",
    "craving_intensity",
    "temptation_type",
    "context_tags",
    "reasoning_trace",
    "intervention_text",
  ],
};
