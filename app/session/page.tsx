"use client";

import Link from "next/link";
import { useState } from "react";
import CheckInForm from "@/components/CheckInForm";
import DecisionLogger from "@/components/DecisionLogger";
import InterventionCard from "@/components/InterventionCard";
import PushToTalk from "@/components/PushToTalk";
import type {
  CheckIn,
  Decision,
  HistoryTurn,
  InterveneResponse,
} from "@/lib/types";

type Stage = "checkin" | "talk" | "loading" | "intervention" | "saved";

export default function Home() {
  const [stage, setStage] = useState<Stage>("checkin");
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [history, setHistory] = useState<HistoryTurn[]>([]);
  const [result, setResult] = useState<InterveneResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCheckIn(values: CheckIn) {
    setCheckIn(values);
    setStage("talk");
  }

  async function handleRecorded(audioBase64: string, mimeType: string) {
    if (!checkIn) return;
    setStage("loading");
    setError(null);
    try {
      const res = await fetch("/api/intervene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64, mimeType, checkIn, history }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Intervention request failed.");
      }
      const interveneResult = data as InterveneResponse;
      setResult(interveneResult);
      setHistory((prev) => [
        ...prev,
        { role: "user", text: interveneResult.transcript },
        { role: "assistant", text: interveneResult.intervention_text },
      ]);
      setStage("intervention");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("talk");
    }
  }

  async function handleLog(decision: Decision, note: string) {
    if (!checkIn || !result) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sleep_hours: checkIn.sleepHours,
          days_on_diet: checkIn.daysOnDiet,
          hunger_level: checkIn.hungerLevel,
          adherence_streak_days: checkIn.adherenceStreakDays,
          transcript: result.transcript,
          craving_intensity: result.craving_intensity,
          temptation_type: result.temptation_type,
          context_tags: result.context_tags,
          reasoning_trace: result.reasoning_trace,
          intervention_text: result.intervention_text,
          decision,
          user_note: note,
          latency_ms: result.latencyMs,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save session.");
      }
      setStage("saved");
    } finally {
      setSaving(false);
    }
  }

  function talkAgain() {
    setResult(null);
    setStage("talk");
  }

  function startOver() {
    setStage("checkin");
    setCheckIn(null);
    setHistory([]);
    setResult(null);
    setError(null);
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-zinc-950 px-6 py-12">
      <div className="flex w-full max-w-md items-center justify-between">
        <span className="text-sm font-semibold tracking-tight text-zinc-50">Optimal</span>
        <div className="flex gap-4">
          <Link href="/onboarding" className="text-sm text-zinc-400 hover:text-zinc-200">
            Onboarding
          </Link>
          <Link href="/history" className="text-sm text-zinc-400 hover:text-zinc-200">
            History →
          </Link>
        </div>
      </div>

      {stage === "checkin" && <CheckInForm onSubmit={handleCheckIn} />}

      {stage === "talk" && (
        <div className="flex flex-col items-center gap-4">
          <p className="max-w-sm text-center text-zinc-300">
            Hold the button and describe what you&apos;re tempted by right now.
          </p>
          <PushToTalk onRecorded={handleRecorded} />
          {error && <p className="max-w-sm text-center text-sm text-red-500">{error}</p>}
        </div>
      )}

      {stage === "loading" && (
        <p className="text-zinc-400">Thinking it through…</p>
      )}

      {stage === "intervention" && result && (
        <div className="flex flex-col items-center gap-6">
          <InterventionCard result={result} />
          <DecisionLogger onLog={handleLog} disabled={saving} />
          <button
            type="button"
            onClick={talkAgain}
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            Talk again instead
          </button>
        </div>
      )}

      {stage === "saved" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-xl text-zinc-50">Logged.</p>
          <p className="text-sm text-zinc-400">Your decision has been saved to this session&apos;s record.</p>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={startOver}
              className="rounded-full bg-emerald-500 px-5 py-2 font-medium text-black hover:bg-emerald-400"
            >
              New session
            </button>
            <Link
              href="/history"
              className="rounded-full border border-zinc-700 px-5 py-2 text-zinc-200 hover:bg-zinc-800"
            >
              View history
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
