"use client";

import VoiceControl, {
  type VoiceVisualState,
} from "@/components/decide/VoiceControl";

const EXAMPLE_PROMPTS = [
  "Should I cancel plans tonight and rest?",
  "Tip on an $80 dinner — 15% or 20%?",
  "Ask for a raise this week or wait?",
  "Reply to my ex’s late text or leave it?",
];

export type GeoState =
  | "off"
  | "asking"
  | "on"
  | "denied"
  | "unavailable";

export default function InputStage({
  busy,
  voiceState,
  onRecorded,
  onRecordingChange,
  showType,
  setShowType,
  textSituation,
  setTextSituation,
  onTextSubmit,
  geoLabel,
  onGeo,
  onExample,
}: {
  busy: boolean;
  voiceState: VoiceVisualState;
  onRecorded: (audioBase64: string, mimeType: string) => void;
  onRecordingChange: (recording: boolean) => void;
  showType: boolean;
  setShowType: (v: boolean | ((b: boolean) => boolean)) => void;
  textSituation: string;
  setTextSituation: (v: string) => void;
  onTextSubmit: (e: React.FormEvent) => void;
  geoLabel: string;
  onGeo: () => void;
  onExample: (prompt: string) => void;
}) {
  return (
    <div className="decide-settle flex flex-1 flex-col justify-center gap-10 py-4">
      <div className="max-w-lg">
        <h1 className="font-serif text-[clamp(2rem,6vw,2.85rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-paper text-balance">
          What’s the decision?
        </h1>
        <p className="mt-4 max-w-[34ch] text-[1.05rem] leading-relaxed text-muted">
          Speak it plainly. Megamind returns a clear call — and why.
        </p>
      </div>

      <div className="flex flex-col items-center gap-5">
        <VoiceControl
          size="hero"
          visualState={voiceState}
          disabled={busy}
          label="Tap to talk"
          recordingLabel="Tap to stop"
          onRecordingChange={onRecordingChange}
          onRecorded={onRecorded}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowType((v) => !v)}
          className="min-h-10 text-sm font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40"
        >
          {showType ? "Hide keyboard" : "Type instead"}
        </button>
        {showType && (
          <form
            onSubmit={onTextSubmit}
            className="flex w-full max-w-md flex-col gap-3"
          >
            <label className="sr-only" htmlFor="decide-input">
              Situation
            </label>
            <textarea
              id="decide-input"
              value={textSituation}
              onChange={(e) => setTextSituation(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={3}
              autoFocus
              placeholder="What’s going on?"
              className="w-full resize-none rounded-lg border border-[var(--line)] bg-ink-elevated/60 px-4 py-3 text-[1rem] leading-relaxed text-paper placeholder:text-muted-dim focus:border-brass/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !textSituation.trim()}
              className="min-h-11 rounded-lg bg-brass px-5 text-sm font-semibold text-brass-ink transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Decide →
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={onGeo}
          className="self-start text-left text-sm text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {geoLabel}
        </button>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy}
              onClick={() => onExample(p)}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-left text-xs leading-snug text-muted transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
