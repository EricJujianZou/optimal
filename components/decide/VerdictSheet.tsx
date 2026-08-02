"use client";

import { useEffect, useRef, useState } from "react";
import type { DecideResponse } from "@/lib/types";
import {
  playBrowserSpeech,
  type SpokenPlayback,
} from "@/lib/play-spoken-audio";

const DISCLAIMER =
  "Not medical, legal, or financial advice — use your judgment.";

interface VerdictSheetProps {
  result: DecideResponse;
  drafting?: boolean;
  /** Bumped when the user starts recording — stops spoken playback. */
  interruptSpeak?: number;
  /** When false, parent renders outcome feedback after Amend. */
  includeOutcomeFeedback?: boolean;
  onOpenMemory?: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
}

function spokenLine(result: DecideResponse): string {
  return (result.spoken_advice || result.recommendation || "")
    .trim()
    .slice(0, 360);
}

export default function VerdictSheet({
  result,
  drafting = false,
  interruptSpeak = 0,
  includeOutcomeFeedback = true,
  onOpenMemory,
  onSpeakingChange,
}: VerdictSheetProps) {
  const playbackRef = useRef<SpokenPlayback | null>(null);
  const [voiceError, setVoiceError] = useState(false);
  const [autoplayMuted, setAutoplayMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [whyExpanded, setWhyExpanded] = useState(false);
  const [seenInterrupt, setSeenInterrupt] = useState(0);
  const lastSpokenId = useRef<number | null>(null);

  const speakText = spokenLine(result);
  const heavy = result.weight === "heavy";
  const alts = (result.alternatives || []).filter(
    (a) => a.option?.trim() && a.option.trim() !== result.recommendation?.trim()
  );
  const why = result.why?.trim() || "";
  const whyShort =
    why.length > 160 && !whyExpanded && !heavy
      ? `${why.slice(0, 157).trim()}…`
      : why;
  const memoryHints = (result.memory_hints || []).filter((h) => h.trim());

  if (interruptSpeak > seenInterrupt) {
    setSeenInterrupt(interruptSpeak);
    if (speaking) setSpeaking(false);
  }

  function setSpeakingState(next: boolean) {
    setSpeaking(next);
    onSpeakingChange?.(next);
  }

  function speak() {
    if (!speakText) return;
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setVoiceError(true);
      return;
    }
    setVoiceError(false);
    setAutoplayMuted(false);
    playbackRef.current?.stop();
    playbackRef.current = playBrowserSpeech(speakText, {
      onEnd: () => setSpeakingState(false),
    });
    setSpeakingState(true);
  }

  function stopSpeak() {
    playbackRef.current?.stop();
    playbackRef.current = null;
    setSpeakingState(false);
  }

  useEffect(() => {
    onSpeakingChange?.(speaking);
  }, [speaking, onSpeakingChange]);

  useEffect(() => {
    if (interruptSpeak <= 0) return;
    playbackRef.current?.stop();
    playbackRef.current = null;
  }, [interruptSpeak]);

  useEffect(() => {
    // Auto-speak once on settle for heavy; everyday is opt-in
    if (
      drafting ||
      autoplayMuted ||
      !heavy ||
      !speakText ||
      typeof window === "undefined" ||
      !window.speechSynthesis
    ) {
      return;
    }
    if (
      result.decisionId != null &&
      lastSpokenId.current === result.decisionId
    ) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      playbackRef.current?.stop();
      playbackRef.current = playBrowserSpeech(speakText, {
        onEnd: () => {
          if (!cancelled) setSpeakingState(false);
        },
      });
      setSpeakingState(true);
      if (result.decisionId != null) lastSpokenId.current = result.decisionId;
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settle once per decision
  }, [speakText, result.decisionId, drafting, autoplayMuted, heavy]);

  useEffect(() => {
    return () => {
      playbackRef.current?.stop();
      onSpeakingChange?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <article
      className="decide-settle w-full max-w-2xl"
      aria-busy={drafting}
      aria-label={speaking ? "Speaking advice" : "Decision"}
    >
      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {drafting ? "Drafting…" : "Do this"}
        </p>
        <h1
          className={`verdict-serif mt-3 text-[clamp(2.2rem,6.5vw,3.6rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-paper text-balance ${
            drafting ? "opacity-90" : ""
          }`}
        >
          {result.recommendation || "…"}
        </h1>
        {heavy && !drafting && (
          <p className="mt-3 text-sm text-muted">Worth a careful look.</p>
        )}
        {result.user_preference_conflict && (
          <p className="mt-3 text-sm font-medium text-paper/80">
            Not what you were leaning toward.
          </p>
        )}

        {!drafting && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {speaking ? (
              <button
                type="button"
                onClick={stopSpeak}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line)] px-5 text-sm font-semibold text-paper transition-colors hover:border-paper/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                Stop speaking
              </button>
            ) : (
              <button
                type="button"
                onClick={speak}
                disabled={!speakText}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brass px-5 text-sm font-semibold text-brass-ink transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40"
              >
                Hear advice
              </button>
            )}
            {heavy && (
              <button
                type="button"
                onClick={() => {
                  if (!autoplayMuted) stopSpeak();
                  setAutoplayMuted((v) => !v);
                }}
                className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] px-4 text-sm font-medium text-muted transition-colors hover:border-paper/40 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {autoplayMuted ? "Allow autoplay" : "Mute autoplay"}
              </button>
            )}
            {speaking && (
              <span className="text-xs font-medium text-brass" role="status">
                Speaking…
              </span>
            )}
            {voiceError && (
              <p className="w-full max-w-sm text-xs leading-relaxed text-muted">
                This browser doesn’t support on-device speech.
              </p>
            )}
          </div>
        )}
      </div>

      {(why ||
        memoryHints.length > 0 ||
        (result.sources && result.sources.length > 0)) && (
        <div className="mt-12 max-w-xl border-t border-[var(--line)] pt-8">
          {why ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Why
              </p>
              <p
                className={`mt-4 text-[1.1rem] leading-[1.7] text-paper ${
                  drafting ? "opacity-70" : ""
                }`}
              >
                {whyShort}
              </p>
              {!heavy && why.length > 160 && (
                <button
                  type="button"
                  onClick={() => setWhyExpanded((v) => !v)}
                  className="mt-2 text-sm font-medium text-muted hover:text-paper"
                >
                  {whyExpanded ? "Less" : "More"}
                </button>
              )}
            </>
          ) : drafting ? (
            <p className="text-sm text-muted">Finishing the why…</p>
          ) : null}

          {!drafting && memoryHints.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                From memory
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {memoryHints.slice(0, 2).map((hint) => (
                  <li key={hint}>
                    <button
                      type="button"
                      onClick={onOpenMemory}
                      className="text-left text-sm leading-relaxed text-paper/85 underline decoration-[var(--line)] underline-offset-4 transition-colors hover:text-brass hover:decoration-brass/50"
                    >
                      {hint}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.sources &&
            result.sources.length > 0 &&
            (heavy || whyExpanded) && (
              <details className="mt-5 group">
                <summary className="cursor-pointer list-none text-xs font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
                  <span className="underline-offset-2 group-open:text-paper">
                    Sources ({result.sources.length})
                  </span>
                </summary>
                <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted">
                  {result.sources.map((s) => (
                    <li
                      key={s.title}
                      className="border-l border-[var(--line)] pl-2"
                    >
                      {s.title}
                    </li>
                  ))}
                </ul>
              </details>
            )}
        </div>
      )}

      {!drafting && heavy && alts.length > 0 && (
        <div className="mt-10 max-w-xl border-t border-[var(--line)] pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Instead
          </p>
          <ul className="mt-4 space-y-4">
            {alts.slice(0, 2).map((a) => (
              <li key={a.option}>
                <p className="text-base font-medium tracking-[-0.01em] text-paper/75">
                  {a.option}
                </p>
                {a.note?.trim() && (
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {a.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!drafting && includeOutcomeFeedback && result.decisionId != null && (
        <OutcomeFeedback result={result} />
      )}

      <p className="mt-12 text-xs leading-relaxed text-muted">{DISCLAIMER}</p>
    </article>
  );
}

export function OutcomeFeedback({ result }: { result: DecideResponse }) {
  const [feedbackChoice, setFeedbackChoice] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  async function sendFeedback(outcome: "did_it" | "did_other" | "ignored") {
    if (
      !result.decisionId ||
      feedbackStatus === "saving" ||
      feedbackStatus === "saved"
    ) {
      return;
    }
    setFeedbackChoice(outcome);
    setFeedbackStatus("saving");
    try {
      const res = await fetch("/api/decide/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId: result.decisionId, outcome }),
      });
      if (!res.ok) throw new Error("feedback failed");
      setFeedbackStatus("saved");
    } catch {
      setFeedbackStatus("error");
    }
  }

  if (result.decisionId == null) return null;

  return (
    <details className="mt-4 max-w-xl group">
      <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
        How did it go?
      </summary>
      <div className="mt-4">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Outcome feedback"
        >
          {(
            [
              ["did_it", "Followed this"],
              ["did_other", "Chose differently"],
              ["ignored", "Didn’t act"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={
                feedbackStatus === "saving" || feedbackStatus === "saved"
              }
              aria-pressed={
                feedbackChoice === key && feedbackStatus === "saved"
              }
              onClick={() => void sendFeedback(key)}
              className={`min-h-10 rounded-lg border px-4 py-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40 ${
                feedbackChoice === key && feedbackStatus === "saved"
                  ? "border-brass/50 bg-brass/10 text-paper"
                  : "border-[var(--line)] text-muted hover:border-paper/40 hover:text-paper"
              }`}
            >
              {feedbackStatus === "saving" && feedbackChoice === key
                ? "Saving…"
                : feedbackStatus === "saved" && feedbackChoice === key
                  ? "Saved"
                  : label}
            </button>
          ))}
        </div>
        {feedbackStatus === "error" && (
          <p role="alert" className="mt-2 text-xs text-danger">
            Couldn’t save feedback — tap again to retry.
          </p>
        )}
        {feedbackStatus === "saved" && (
          <p role="status" className="mt-2 text-xs text-muted">
            Thanks — that helps Megamind remember what works for you.
          </p>
        )}
      </div>
    </details>
  );
}
