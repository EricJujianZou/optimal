"use client";

import { useEffect, useRef, useState } from "react";
import type { DecideResponse } from "@/lib/types";
import {
  playBrowserSpeech,
  type SpokenPlayback,
} from "@/lib/play-spoken-audio";

const DISCLAIMER =
  "Not medical, legal, or financial advice — use your judgment.";

interface DecisionResultCardProps {
  result: DecideResponse;
  drafting?: boolean;
}

function spokenLine(result: DecideResponse): string {
  return (result.spoken_advice || result.recommendation || "")
    .trim()
    .slice(0, 360);
}

export default function DecisionResultCard({
  result,
  drafting = false,
}: DecisionResultCardProps) {
  const playbackRef = useRef<SpokenPlayback | null>(null);
  const [voiceError, setVoiceError] = useState(false);
  const [muted, setMuted] = useState(false);
  const [feedbackChoice, setFeedbackChoice] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const lastSpokenId = useRef<number | null>(null);

  const speakText = spokenLine(result);
  const alts = (result.alternatives || []).filter(
    (a) => a.option?.trim() && a.option.trim() !== result.recommendation?.trim()
  );

  function speak() {
    if (!speakText) return;
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setVoiceError(true);
      return;
    }
    setVoiceError(false);
    setMuted(false);
    playbackRef.current?.stop();
    playbackRef.current = playBrowserSpeech(speakText);
  }

  function stopSpeak() {
    playbackRef.current?.stop();
    playbackRef.current = null;
    setMuted(true);
  }

  useEffect(() => {
    if (
      drafting ||
      muted ||
      !speakText ||
      typeof window === "undefined" ||
      !window.speechSynthesis
    ) {
      return;
    }
    // Avoid re-speaking the same decision on incidental re-renders
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
      playbackRef.current = playBrowserSpeech(speakText);
      if (result.decisionId != null) lastSpokenId.current = result.decisionId;
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      playbackRef.current?.stop();
      playbackRef.current = null;
    };
  }, [speakText, result.decisionId, drafting, muted]);

  async function sendFeedback(outcome: "did_it" | "did_other" | "ignored") {
    if (!result.decisionId || feedbackStatus === "saving" || feedbackStatus === "saved") {
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

  return (
    <article className="decide-reveal w-full max-w-2xl" aria-busy={drafting}>
      <div className="relative pl-5 sm:pl-6">
        <div
          className="absolute bottom-1 left-0 top-1 w-[3px] rounded-full bg-paper"
          aria-hidden
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
          {drafting ? "Drafting…" : "Do this"}
        </p>
        <h1
          className={`mt-3 font-display text-[clamp(2.4rem,7vw,4rem)] font-bold leading-[0.98] tracking-[-0.05em] text-paper ${
            drafting ? "animate-pulse opacity-90" : ""
          }`}
        >
          {result.recommendation || "…"}
        </h1>
        {result.user_preference_conflict && (
          <p className="mt-3 text-sm font-medium text-paper/80">
            Not what you were leaning toward.
          </p>
        )}
        {!drafting && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={speak}
              disabled={!speakText}
              className="inline-flex h-11 items-center gap-2.5 rounded-full bg-paper px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:bg-paper/25 disabled:text-paper/70 disabled:hover:opacity-100"
            >
              <span aria-hidden className="text-xs">
                ▶
              </span>
              Hear it
            </button>
            <button
              type="button"
              onClick={stopSpeak}
              className="inline-flex h-11 items-center rounded-full border border-[var(--line)] px-4 text-sm font-medium text-muted transition-colors hover:border-paper/40 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              Mute
            </button>
            {voiceError && (
              <p className="w-full max-w-sm text-xs leading-relaxed text-muted">
                This browser doesn’t support on-device speech.
              </p>
            )}
          </div>
        )}
      </div>

      {(result.why || (result.sources && result.sources.length > 0)) && (
        <div className="mt-12 max-w-xl border-t border-[var(--line)] pt-8">
          {result.why ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                Why
              </p>
              <p
                className={`mt-4 text-[1.15rem] leading-[1.75] text-paper ${
                  drafting ? "opacity-70" : ""
                }`}
              >
                {result.why}
              </p>
            </>
          ) : drafting ? (
            <p className="text-sm text-muted">Finishing the why…</p>
          ) : null}
          {result.sources && result.sources.length > 0 && (
            <details className="mt-5 group">
              <summary className="cursor-pointer list-none text-xs font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
                <span className="underline-offset-2 group-open:text-paper">
                  Sources ({result.sources.length})
                </span>
              </summary>
              <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted">
                {result.sources.map((s) => (
                  <li key={s.title} className="pl-2 border-l border-[var(--line)]">
                    {s.title}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {!drafting && alts.length > 0 && (
        <div className="mt-10 max-w-xl border-t border-[var(--line)] pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
            Instead
          </p>
          <ul className="mt-4 space-y-4">
            {alts.slice(0, 3).map((a) => (
              <li key={a.option}>
                <p className="font-display text-lg font-semibold tracking-[-0.02em] text-paper/90">
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

      {!drafting && result.decisionId != null && (
        <div className="mt-10">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
            How did it go?
          </p>
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
                aria-pressed={feedbackChoice === key && feedbackStatus === "saved"}
                onClick={() => void sendFeedback(key)}
                className={`rounded-full border px-4 py-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40 ${
                  feedbackChoice === key && feedbackStatus === "saved"
                    ? "border-paper/50 bg-paper/10 text-paper"
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
      )}

      <p className="mt-12 text-xs leading-relaxed text-muted">{DISCLAIMER}</p>
    </article>
  );
}
