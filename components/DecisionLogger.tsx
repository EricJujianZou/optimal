"use client";

import { useState } from "react";
import type { Decision, DecisionLoggerProps } from "@/lib/types";

const DECISION_CONFIG: Record<
  Decision,
  { label: string; description: string; color: string }
> = {
  comply: {
    label: "Complied",
    description: "Followed the intervention completely",
    color: "green",
  },
  partial: {
    label: "Partial",
    description: "Some adherence, but not fully",
    color: "amber",
  },
  defect: {
    label: "Defected",
    description: "Didn't follow the intervention",
    color: "red",
  },
};

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

  const getButtonClass = (d: Decision) => {
    const config = DECISION_CONFIG[d];
    const isSelected = decision === d;
    const baseClass = "flex-1 p-4 rounded-lg border-2 transition-all text-left";
    
    if (config.color === "green") {
      return `${baseClass} ${
        isSelected
          ? "bg-green-100 border-green-600 text-green-900"
          : "border-green-300 hover:border-green-500 hover:bg-green-50"
      }`;
    }
    if (config.color === "amber") {
      return `${baseClass} ${
        isSelected
          ? "bg-amber-100 border-amber-600 text-amber-900"
          : "border-amber-300 hover:border-amber-500 hover:bg-amber-50"
      }`;
    }
    // red
    return `${baseClass} ${
      isSelected
        ? "bg-red-100 border-red-600 text-red-900"
        : "border-red-300 hover:border-red-500 hover:bg-red-50"
    }`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(DECISION_CONFIG) as Decision[]).map((d) => {
          const config = DECISION_CONFIG[d];
          return (
            <button
              key={d}
              type="button"
              disabled={disabled || saving}
              onClick={() => setDecision(d)}
              className={getButtonClass(d)}
            >
              <div className="font-semibold text-sm">{config.label}</div>
              <div className="text-xs mt-1 opacity-75">{config.description}</div>
            </button>
          );
        })}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={disabled || saving}
        placeholder="What actually happened? How do you feel? (optional)"
        className="w-full p-3 border border-zinc-300 rounded-lg text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {error && (
        <p className="text-sm text-red-600 font-medium">{error}</p>
      )}

      <button
        type="button"
        onClick={handleCommit}
        disabled={!decision || disabled || saving}
        className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? "Saving..." : "Log decision"}
      </button>
    </div>
  );
}
