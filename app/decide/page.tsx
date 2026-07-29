"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import DecisionResultCard from "@/components/DecisionResultCard";
import ProfileMemoryPanel from "@/components/ProfileMemoryPanel";
import PushToTalk from "@/components/PushToTalk";
import type { DecideResponse, HistoryTurn } from "@/lib/types";

type Stage = "input" | "clarify" | "result";
type BusyKind = null | "recording" | "thinking";
type GeoState = "off" | "asking" | "on" | "denied" | "unavailable";

type DecidePayload = {
  audioBase64?: string;
  mimeType?: string;
  textSituation?: string;
};

const EXAMPLE_PROMPTS = [
  "Should I cancel plans tonight and rest?",
  "Tip on an $80 dinner — 15% or 20%?",
  "Ask for a raise this week or wait?",
  "Reply to my ex’s late text or leave it?",
];

function friendlyError(raw: string): string {
  const t = raw.toLowerCase();
  if (/rate limit|free-models-per-min|429/.test(t)) {
    return "Megamind is busy (rate limit). Wait a few seconds and try again.";
  }
  if (/empty or invalid decide json|502|503/.test(t)) {
    return "Couldn’t finish that decision. Try again — usually works on retry.";
  }
  if (/failed to fetch|networkerror|network|abort/.test(t)) {
    if (/abort/.test(t)) return "Stopped.";
    return "Network issue — check your connection and retry.";
  }
  if (/openrouter|api key/.test(t)) {
    return "Decision service isn’t configured. Check OPENROUTER_API_KEY.";
  }
  return "Something went wrong. Try again.";
}

function MicBlock({
  busy,
  setBusy,
  onRecorded,
  label,
  recordingLabel,
  showType,
  setShowType,
  textSituation,
  setTextSituation,
  onTextSubmit,
  typePlaceholder,
  submitLabel,
  size = "hero",
}: {
  busy: BusyKind;
  setBusy: React.Dispatch<React.SetStateAction<BusyKind>>;
  onRecorded: (audioBase64: string, mimeType: string) => void;
  label: string;
  recordingLabel: string;
  showType: boolean;
  setShowType: React.Dispatch<React.SetStateAction<boolean>>;
  textSituation: string;
  setTextSituation: React.Dispatch<React.SetStateAction<string>>;
  onTextSubmit: (e: React.FormEvent) => void;
  typePlaceholder: string;
  submitLabel: string;
  size?: "default" | "hero";
}) {
  return (
    <div className="flex flex-col items-center gap-5">
      <PushToTalk
        size={size}
        label={label}
        recordingLabel={recordingLabel}
        disabled={busy === "thinking"}
        onRecordingChange={(rec) => {
          if (rec) setBusy("recording");
          else setBusy((b) => (b === "recording" ? null : b));
        }}
        onRecorded={onRecorded}
      />
      <button
        type="button"
        disabled={busy === "thinking"}
        onClick={() => setShowType((v) => !v)}
        className="text-sm font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40"
      >
        {showType ? "Hide keyboard" : "Type instead"}
      </button>
      {showType && (
        <form
          onSubmit={onTextSubmit}
          className="flex w-full max-w-md flex-col gap-3"
        >
          <label className="sr-only" htmlFor="decide-input">
            Your situation
          </label>
          <textarea
            id="decide-input"
            value={textSituation}
            onChange={(e) => setTextSituation(e.target.value)}
            rows={size === "hero" ? 3 : 2}
            autoFocus={
              typeof window !== "undefined" &&
              window.matchMedia("(min-width: 640px)").matches
            }
            disabled={busy === "thinking"}
            placeholder={typePlaceholder}
            className="w-full resize-none rounded-none border-0 border-b border-[var(--line)] bg-transparent px-0 py-2 text-base text-paper placeholder:text-muted focus:border-paper/60 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy === "thinking" || !textSituation.trim()}
            className="self-start rounded-full bg-paper px-5 py-2 font-display text-sm font-semibold tracking-[-0.01em] text-ink transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40"
          >
            {submitLabel}
          </button>
        </form>
      )}
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm leading-relaxed text-paper">{message}</p>
      <div className="flex shrink-0 gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-paper px-4 py-1.5 text-xs font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full border border-[var(--line)] px-4 py-1.5 text-xs font-medium text-muted hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function DecidePage() {
  const [stage, setStage] = useState<Stage>("input");
  const [busy, setBusy] = useState<BusyKind>(null);
  const [textSituation, setTextSituation] = useState("");
  const [showType, setShowType] = useState(false);
  const [history, setHistory] = useState<HistoryTurn[]>([]);
  const [result, setResult] = useState<DecideResponse | null>(null);
  const [clarify, setClarify] = useState<DecideResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null);
  const [geoState, setGeoState] = useState<GeoState>("off");
  const [gatheringHint, setGatheringHint] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [progressStage, setProgressStage] = useState<
    "thinking" | "gathering" | "drafting" | null
  >(null);
  const resultTopRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastPayloadRef = useRef<DecidePayload | null>(null);
  const stageBeforeSubmitRef = useRef<Stage>("input");
  const sawPartialRef = useRef(false);

  useEffect(() => {
    if (stage === "result") {
      resultTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [stage, result?.decisionId, result?.recommendation]);

  async function submit(payload: DecidePayload) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    lastPayloadRef.current = payload;
    stageBeforeSubmitRef.current = stage;
    sawPartialRef.current = false;

    setBusy("thinking");
    setError(null);
    setGatheringHint(null);
    setDrafting(false);
    setProgressStage("thinking");
    try {
      const res = await fetch("/api/decide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          ...payload,
          history,
          ...(geo ? { lat: geo.lat, lon: geo.lon } : {}),
        }),
        signal: ac.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Decision request failed."
        );
      }

      const ctype = res.headers.get("content-type") || "";
      if (ctype.includes("application/json")) {
        const decideResult = (await res.json()) as DecideResponse;
        applyDecideResult(decideResult, payload);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream.");
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: DecideResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!line) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (evt.type === "stage") {
            const s = String(evt.stage || "");
            if (s === "gathering") {
              setProgressStage("gathering");
              setGatheringHint("Gathering facts…");
            } else if (s === "drafting") {
              setProgressStage("drafting");
              setGatheringHint("Writing your call…");
            } else if (s === "thinking") {
              setProgressStage("thinking");
            }
          }
          if (evt.type === "sources" && Array.isArray(evt.sources)) {
            const titles = (evt.sources as { title: string }[])
              .map((s) => s.title)
              .slice(0, 3);
            if (titles.length) setGatheringHint(titles.join(" · "));
          }
          if (evt.type === "partial") {
            sawPartialRef.current = true;
            setDrafting(true);
            setProgressStage("drafting");
            setStage("result");
            setResult((prev) => ({
              status: "decide",
              transcript: prev?.transcript || payload.textSituation || "",
              clarifying_questions: [],
              options: prev?.options || [],
              options_source: prev?.options_source || "inferred",
              recommendation:
                String(evt.recommendation || prev?.recommendation || ""),
              user_preference_conflict: false,
              why: String(evt.why || prev?.why || ""),
              alternatives: prev?.alternatives || [],
              spoken_advice: String(
                evt.spoken_advice || prev?.spoken_advice || ""
              ),
              audioBase64: null,
              audioMimeType: null,
              latencyMs: prev?.latencyMs || 0,
              decisionId: prev?.decisionId ?? null,
              sources: prev?.sources || [],
            }));
          }
          if (evt.type === "final" && evt.result) {
            finalResult = evt.result as DecideResponse;
          }
          if (evt.type === "error") {
            throw new Error(String(evt.error || "Decision failed."));
          }
        }
      }

      if (!finalResult) throw new Error("Stream ended without a decision.");
      setDrafting(false);
      applyDecideResult(finalResult, payload);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(null);
        setDrafting(false);
        if (sawPartialRef.current) {
          setResult(null);
          setStage(stageBeforeSubmitRef.current);
        }
        return;
      }
      console.error(err);
      // Never leave a half-draft "Do this" after a failed stream
      if (sawPartialRef.current) {
        setResult(null);
        setStage(stageBeforeSubmitRef.current);
      }
      setError(
        friendlyError(err instanceof Error ? err.message : "Something went wrong.")
      );
      setDrafting(false);
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(null);
      setGatheringHint(null);
      setProgressStage(null);
    }
  }

  function applyDecideResult(
    decideResult: DecideResponse,
    payload: { textSituation?: string }
  ) {
    const userText =
      decideResult.transcript || payload.textSituation || "(voice)";

    if (decideResult.status === "clarify") {
      setHistory((prev) => [
        ...prev,
        { role: "user", text: userText },
        { role: "assistant", text: decideResult.spoken_advice },
      ]);
      setClarify(decideResult);
      setResult(null);
      setTextSituation("");
      setShowType(false);
      setStage("clarify");
      return;
    }

    setHistory((prev) => [
      ...prev,
      { role: "user", text: userText },
      { role: "assistant", text: decideResult.spoken_advice },
    ]);
    setResult(decideResult);
    setClarify(null);
    setTextSituation("");
    setShowType(false);
    setStage("result");
  }

  function handleRecorded(audioBase64: string, mimeType: string) {
    void submit({ audioBase64, mimeType });
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = textSituation.trim();
    if (!trimmed) {
      setError("Say or type what’s going on.");
      return;
    }
    void submit({ textSituation: trimmed });
  }

  function startFresh() {
    abortRef.current?.abort();
    setResult(null);
    setClarify(null);
    setHistory([]);
    setTextSituation("");
    setShowType(false);
    setError(null);
    setBusy(null);
    setDrafting(false);
    setGatheringHint(null);
    setProgressStage(null);
    lastPayloadRef.current = null;
    setStage("input");
  }

  function requestGeo() {
    if (!navigator.geolocation) {
      setGeoState("unavailable");
      setError("Location isn’t available in this browser.");
      return;
    }
    setGeoState("asking");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
        setGeoState("on");
      },
      (err) => {
        setGeoState(err.code === err.PERMISSION_DENIED ? "denied" : "off");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — nearby suggestions will use place names only."
            : "Couldn’t get your location. You can still decide without it."
        );
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 }
    );
  }

  const statusLabel =
    busy === "recording"
      ? "Listening…"
      : busy === "thinking"
        ? gatheringHint ||
          (progressStage === "gathering"
            ? "Gathering facts…"
            : progressStage === "drafting"
              ? "Writing your call…"
              : "Working through it…")
        : null;

  const geoLabel =
    geoState === "asking"
      ? "Getting location…"
      : geoState === "on" && geo
        ? `Location on (${geo.lat.toFixed(2)}, ${geo.lon.toFixed(2)})`
        : geoState === "denied"
          ? "Location denied — tap to retry"
          : "Use my location (optional)";

  return (
    <div className="relative flex min-h-dvh flex-col bg-ink text-paper pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 50% -8%, color-mix(in srgb, #3d4f66 26%, transparent), transparent 68%),
            linear-gradient(180deg, #0e141c 0%, var(--ink) 42%, #090d12 100%)
          `,
        }}
        aria-hidden
      />

      <header className="relative z-10 mx-auto flex w-full max-w-2xl items-center justify-between px-6 pt-7 sm:px-8">
        <Link
          href="/"
          className="font-display text-[1.5rem] font-extrabold tracking-[-0.05em] text-paper"
        >
          Megamind
        </Link>
        <div className="flex items-center gap-4">
          {busy === "thinking" && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="text-sm font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => setMemoryOpen(true)}
            aria-expanded={memoryOpen}
            aria-controls="memory-panel"
            className="text-sm font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Memory
          </button>
          {(stage !== "input" || history.length > 0) && (
            <button
              type="button"
              onClick={startFresh}
              className="text-sm font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              New
            </button>
          )}
        </div>
      </header>
      {statusLabel && (
        <div
          className="relative z-20 mx-auto w-full max-w-2xl px-6 pt-4 sm:px-8"
          role="status"
          aria-live="polite"
        >
          <div className="decide-progress-track">
            <div className="decide-progress-bar" />
          </div>
          <p className="mt-2 text-sm font-medium text-paper/85">{statusLabel}</p>
        </div>
      )}

      <main
        className={`relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-14 pt-8 sm:px-8 ${
          busy === "thinking" ? "pointer-events-none opacity-[0.92]" : ""
        }`}
      >
        {error && (
          <div className="pointer-events-auto mb-8">
            <ErrorBanner
              message={error}
              onRetry={() => {
                const p = lastPayloadRef.current;
                if (p) void submit(p);
              }}
              onDismiss={() => setError(null)}
            />
          </div>
        )}

        {stage === "result" && result && (
          <div ref={resultTopRef} className="flex flex-1 flex-col gap-14 py-2">
            <DecisionResultCard result={result} drafting={drafting} />

            <section className="border-t border-[var(--line)] pt-10">
              <div className="mb-8 max-w-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                  Continue
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Add a fact, push back, or ask what’s next.
                </p>
              </div>
              <MicBlock
                size="default"
                busy={busy}
                setBusy={setBusy}
                onRecorded={handleRecorded}
                label="Tap to talk"
                recordingLabel="Tap to stop"
                showType={showType}
                setShowType={setShowType}
                textSituation={textSituation}
                setTextSituation={setTextSituation}
                onTextSubmit={handleTextSubmit}
                typePlaceholder="What else matters?"
                submitLabel="Send →"
              />
            </section>
          </div>
        )}

        {stage === "clarify" && clarify && (
          <div className="decide-reveal flex flex-1 flex-col justify-center gap-12 py-4">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                Quick question
              </p>
              {clarify.clarifying_questions.length > 0 ? (
                <ul className="mt-6 space-y-5">
                  {clarify.clarifying_questions.map((q, i) => (
                    <li key={q} className="flex gap-4">
                      <span className="font-display text-sm font-medium text-muted tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="font-display text-[clamp(1.35rem,3.8vw,1.85rem)] font-semibold leading-[1.2] tracking-[-0.03em] text-paper">
                        {q}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-5 font-display text-[clamp(1.35rem,3.8vw,1.85rem)] font-semibold leading-[1.2] tracking-[-0.03em] text-paper">
                  {clarify.spoken_advice}
                </p>
              )}
              <button
                type="button"
                className="mt-6 text-sm font-medium text-muted underline-offset-2 hover:text-paper hover:underline"
                onClick={() => {
                  setShowType(true);
                }}
              >
                Type an answer
              </button>
            </div>

            <MicBlock
              busy={busy}
              setBusy={setBusy}
              onRecorded={handleRecorded}
              label="Tap to answer"
              recordingLabel="Tap to stop"
              showType={showType}
              setShowType={setShowType}
              textSituation={textSituation}
              setTextSituation={setTextSituation}
              onTextSubmit={handleTextSubmit}
              typePlaceholder="Your answer…"
              submitLabel="Send →"
            />
          </div>
        )}

        {stage === "input" && (
          <div className="decide-reveal flex flex-1 flex-col justify-center gap-12 py-6">
            <div className="max-w-xl space-y-4">
              <h1 className="font-display text-[clamp(2.5rem,7.5vw,4.25rem)] font-extrabold leading-[0.94] tracking-[-0.05em] text-paper">
                What’s the decision?
              </h1>
              <p className="max-w-[34ch] text-[1.05rem] leading-relaxed text-muted">
                Say it out loud. You’ll get a clear call — and a short why.
              </p>
              <button
                type="button"
                disabled={geoState === "asking"}
                onClick={requestGeo}
                className="text-sm font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-50"
              >
                {geoLabel}
              </button>
            </div>

            <MicBlock
              busy={busy}
              setBusy={setBusy}
              onRecorded={handleRecorded}
              label="Tap to speak"
              recordingLabel="Tap to stop"
              showType={showType}
              setShowType={setShowType}
              textSituation={textSituation}
              setTextSituation={setTextSituation}
              onTextSubmit={handleTextSubmit}
              typePlaceholder="Should I take the offer, or stay?"
              submitLabel="Decide →"
            />

            {!showType && busy !== "thinking" && (
              <div className="flex max-w-lg flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setTextSituation(p);
                      setShowType(true);
                      setError(null);
                    }}
                    className="rounded-full border border-[var(--line)] px-3 py-1.5 text-left text-xs leading-snug text-muted transition-colors hover:border-paper/35 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <ProfileMemoryPanel
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
      />
    </div>
  );
}
