"use client";

import VoiceControl, {
  type VoiceVisualState,
} from "@/components/decide/VoiceControl";
import type { DecideResponse } from "@/lib/types";

export default function ClarifyStage({
  clarify,
  leanRecommendation,
  busy,
  voiceState,
  onRecorded,
  onRecordingChange,
  showType,
  setShowType,
  textSituation,
  setTextSituation,
  onTextSubmit,
  onSkip,
}: {
  clarify: DecideResponse;
  leanRecommendation?: string | null;
  busy: boolean;
  voiceState: VoiceVisualState;
  onRecorded: (audioBase64: string, mimeType: string) => void;
  onRecordingChange: (recording: boolean) => void;
  showType: boolean;
  setShowType: (v: boolean | ((b: boolean) => boolean)) => void;
  textSituation: string;
  setTextSituation: (v: string) => void;
  onTextSubmit: (e: React.FormEvent) => void;
  onSkip: () => void;
}) {
  const questions = clarify.clarifying_questions;
  const primary = questions[0];
  const extra = questions.slice(1, 3);
  const whyMatters = clarify.spoken_advice?.trim();

  return (
    <div className="decide-settle flex flex-1 flex-col justify-center gap-12 py-4">
      <div className="max-w-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Quick question
        </p>
        <p className="mt-2 text-sm text-muted">
          This changes the recommendation.
        </p>
        {primary ? (
          <div className="mt-6">
            <p className="font-serif text-[clamp(1.35rem,3.8vw,1.85rem)] font-semibold leading-[1.2] tracking-[-0.03em] text-paper text-balance">
              {primary}
            </p>
            {whyMatters && (
              <p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-muted">
                {whyMatters}
              </p>
            )}
            {extra.length > 0 && (
              <ul className="mt-6 space-y-3 border-t border-[var(--line)] pt-5">
                {extra.map((q, i) => (
                  <li key={q} className="flex gap-3">
                    <span className="font-serif text-xs font-medium text-muted tabular-nums">
                      {String(i + 2).padStart(2, "0")}
                    </span>
                    <p className="text-sm leading-relaxed text-paper/80">
                      {q}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-5 font-serif text-[clamp(1.35rem,3.8vw,1.85rem)] font-semibold leading-[1.2] tracking-[-0.03em] text-paper">
            {clarify.spoken_advice || "One more detail before the call."}
          </p>
        )}
        {leanRecommendation?.trim() && (
          <p className="mt-8 text-sm text-muted">
            Leaning toward{" "}
            <span className="text-paper/80">{leanRecommendation}</span>
          </p>
        )}
      </div>

      <div className="flex flex-col items-center gap-5">
        <VoiceControl
          size="default"
          visualState={voiceState}
          disabled={busy}
          label="Answer"
          recordingLabel="Tap to stop"
          onRecordingChange={onRecordingChange}
          onRecorded={onRecorded}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowType((v) => !v)}
          className="min-h-10 text-sm font-medium text-muted underline-offset-2 hover:text-paper hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {showType ? "Hide keyboard" : "Type your answer"}
        </button>
        {showType && (
          <form
            onSubmit={onTextSubmit}
            className="flex w-full max-w-md flex-col gap-3"
          >
            <label className="sr-only" htmlFor="clarify-input">
              Answer
            </label>
            <textarea
              id="clarify-input"
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
              placeholder="Your answer"
              className="w-full resize-none rounded-lg border border-[var(--line)] bg-ink-elevated/60 px-4 py-3 text-[1rem] leading-relaxed text-paper placeholder:text-muted-dim focus:border-brass/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !textSituation.trim()}
              className="min-h-11 rounded-lg bg-brass px-5 text-sm font-semibold text-brass-ink transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Continue →
            </button>
          </form>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onSkip}
          className="min-h-10 text-sm font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40"
        >
          Decide with what you have
        </button>
      </div>
    </div>
  );
}
