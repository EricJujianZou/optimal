// STUB — being replaced by user, do not expand
"use client";

import { useState } from "react";
import type { Decision, DecisionLoggerProps } from "@/lib/types";

const DECISIONS: Decision[] = ["comply", "partial", "defect"];

export default function DecisionLogger({ onLog, disabled }: DecisionLoggerProps) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCommit() {
    if (!decision) return;
    setSaving(true);
    setError(null);
    try {
      await onLog(decision, note);
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border border-dashed border-zinc-500 p-4">
      <p className="text-xs text-zinc-500">DecisionLogger stub</p>
      <div className="flex gap-2">
        {DECISIONS.map((d) => (
          <button
            key={d}
            type="button"
            disabled={disabled || saving}
            onClick={() => setDecision(d)}
            className={`px-3 py-1 border ${
              decision === d ? "bg-zinc-800 text-white" : "bg-transparent"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={disabled || saving}
        placeholder="note (optional)"
        className="border p-2 text-sm"
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="button"
        onClick={handleCommit}
        disabled={!decision || disabled || saving}
        className="self-start px-4 py-2 bg-blue-600 text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Commit decision"}
      </button>
    </div>
  );
}
