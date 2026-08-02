"use client";

import VoiceControl, {
  type VoiceVisualState,
} from "@/components/decide/VoiceControl";
import type { AmendIntent } from "@/lib/types";

export default function AmendBar({
  busy,
  voiceState,
  intent,
  onIntentChange,
  onRecorded,
  onRecordingChange,
  showType,
  setShowType,
  textSituation,
  setTextSituation,
  onTextSubmit,
}: {
  busy: boolean;
  voiceState: VoiceVisualState;
  intent: AmendIntent | null;
  onIntentChange: (intent: AmendIntent | null) => void;
  onRecorded: (audioBase64: string, mimeType: string) => void;
  onRecordingChange: (recording: boolean) => void;
  showType: boolean;
  setShowType: (v: boolean | ((b: boolean) => boolean)) => void;
  textSituation: string;
  setTextSituation: (v: string) => void;
  onTextSubmit: (e: React.FormEvent) => void;
}) {
  const placeholders: Record<AmendIntent, string> = {
    push_back: "What’s wrong with this call?",
    add_fact: "What else matters?",
    go_deeper: "What do you want to unpack?",
  };

  const voiceLabel =
    intent === "push_back"
      ? "Push back"
      : intent === "add_fact"
        ? "Add the fact"
        : intent === "go_deeper"
          ? "Go deeper"
          : "Tap to talk";

  return (
    <section className="border-t border-[var(--line)] pt-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        Amend
      </p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        Speak or type a follow-up. Optionally mark it as push back, a new fact,
        or go deeper.
      </p>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Amend intent">
        {(
          [
            ["push_back", "Push back"],
            ["add_fact", "Add a fact"],
            ["go_deeper", "Go deeper"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            aria-pressed={intent === key}
            onClick={() =>
              onIntentChange(intent === key ? null : key)
            }
            className={`min-h-10 rounded-lg border px-3.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40 ${
              intent === key
                ? "border-brass/50 bg-brass/15 text-paper"
                : "border-[var(--line)] text-muted hover:border-paper/35 hover:text-paper"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {intent && (
        <p className="mt-3 text-xs text-muted" role="status">
          {intent === "push_back"
            ? "Megamind will revise the call if your objection holds."
            : intent === "add_fact"
              ? "New facts can flip the recommendation."
              : "Same call, fuller why — unless something new changes it."}
        </p>
      )}

      <div className="mt-8 flex flex-col items-center gap-5">
        <VoiceControl
          size="default"
          visualState={voiceState}
          disabled={busy}
          label={voiceLabel}
          recordingLabel="Tap to stop"
          onRecordingChange={onRecordingChange}
          onRecorded={onRecorded}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowType((v) => !v)}
          className="min-h-10 text-sm font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {showType ? "Hide keyboard" : "Type instead"}
        </button>
        {showType && (
          <form
            onSubmit={onTextSubmit}
            className="flex w-full max-w-md flex-col gap-3"
          >
            <label className="sr-only" htmlFor="amend-input">
              Follow-up
            </label>
            <textarea
              id="amend-input"
              value={textSituation}
              onChange={(e) => setTextSituation(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
              autoFocus
              placeholder={
                intent ? placeholders[intent] : "What else matters?"
              }
              className="w-full resize-none rounded-lg border border-[var(--line)] bg-ink-elevated/60 px-4 py-3 text-[1rem] leading-relaxed text-paper placeholder:text-muted-dim focus:border-brass/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !textSituation.trim()}
              className="min-h-11 rounded-lg bg-brass px-5 text-sm font-semibold text-brass-ink transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Update call →
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
