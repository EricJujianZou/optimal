"use client";

import { useEffect, useRef, useState } from "react";
import type { Decision, DecisionLoggerProps } from "@/lib/types";

const DECISION_CONFIG: Record<
  Decision,
  { label: string; description: string; shortcut: string }
> = {
  comply: {
    label: "Complied",
    description: "Followed the intervention completely",
    shortcut: "1",
  },
  partial: {
    label: "Partial",
    description: "Some adherence, but not fully",
    shortcut: "2",
  },
  defect: {
    label: "Defected",
    description: "Didn't follow the intervention",
    shortcut: "3",
  },
};

const SHORTCUT_TO_DECISION: Record<string, Decision> = {
  "1": "comply",
  "2": "partial",
  "3": "defect",
};

const SELECTED_CLASSES: Record<Decision, string> = {
  comply: "bg-green-500/15 border-green-500 text-green-300",
  partial: "bg-amber-500/15 border-amber-500 text-amber-300",
  defect: "bg-red-500/15 border-red-500 text-red-300",
};

const UNSELECTED_CLASSES: Record<Decision, string> = {
  comply: "border-zinc-700 text-zinc-300 hover:border-green-600 hover:bg-green-500/5",
  partial: "border-zinc-700 text-zinc-300 hover:border-amber-600 hover:bg-amber-500/5",
  defect: "border-zinc-700 text-zinc-300 hover:border-red-600 hover:bg-red-500/5",
};

export default function DecisionLogger({ onLog, disabled }: DecisionLoggerProps) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (disabled || saving) return;
      if (document.activeElement === textareaRef.current) return;
      const target = SHORTCUT_TO_DECISION[e.key];
      if (target) {
        setDecision(target);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, saving]);

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
    const isSelected = decision === d;
    const baseClass = "relative flex-1 p-4 rounded-lg border-2 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed";
    return `${baseClass} ${isSelected ? SELECTED_CLASSES[d] : UNSELECTED_CLASSES[d]}`;
  };

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <p className="text-xs text-zinc-500">
        Be honest — defect data is the most valuable data.
      </p>

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
              <span className="absolute right-2 top-2 text-[10px] font-mono text-zinc-600">
                {config.shortcut}
              </span>
              <div className="font-semibold text-sm">{config.label}</div>
              <div className="text-xs mt-1 opacity-75">{config.description}</div>
            </button>
          );
        })}
      </div>

      <textarea
        ref={textareaRef}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={disabled || saving}
        placeholder="What actually happened? How do you feel? (optional)"
        className="w-full p-3 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-50 placeholder-zinc-500 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {error && (
        <p className="text-sm text-red-500 font-medium">{error}</p>
      )}

      <button
        type="button"
        onClick={handleCommit}
        disabled={!decision || disabled || saving}
        className="w-full rounded-full bg-emerald-500 px-4 py-3 font-medium text-black transition-colors hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Saving..." : "Log decision"}
      </button>
    </div>
  );
}
