"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import AmendBar from "@/components/decide/AmendBar";
import ClarifyStage from "@/components/decide/ClarifyStage";
import DecideShell from "@/components/decide/DecideShell";
import InputStage from "@/components/decide/InputStage";
import VerdictSheet, {
  OutcomeFeedback,
} from "@/components/decide/VerdictSheet";
import type { VoiceVisualState } from "@/components/decide/VoiceControl";
import type { AmendIntent, DecideResponse, HistoryTurn } from "@/lib/types";

const MemorySheet = dynamic(
  () => import("@/components/decide/MemorySheet"),
  { ssr: false }
);

type Stage = "input" | "clarify" | "result";
type BusyKind = null | "recording" | "thinking";
type GeoState = "off" | "asking" | "on" | "denied" | "unavailable";

type DecidePayload = {
  audioBase64?: string;
  mimeType?: string;
  textSituation?: string;
  amendIntent?: AmendIntent;
};

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

function ErrorBanner({
  message,
  onRetry,
  onDismiss,
  canRetry,
}: {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
  canRetry: boolean;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/40 bg-danger/12 px-4 py-3"
    >
      <p className="text-sm text-paper">{message}</p>
      <div className="mt-3 flex gap-4">
        {canRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-semibold text-paper underline-offset-2 hover:underline"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="text-sm font-medium text-muted hover:text-paper"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function emptyPartial(
  prev: DecideResponse | null,
  payload: DecidePayload
): DecideResponse {
  return {
    status: "decide",
    transcript: prev?.transcript || payload.textSituation || "",
    clarifying_questions: [],
    options: prev?.options || [],
    options_source: prev?.options_source || "inferred",
    recommendation: prev?.recommendation || "",
    user_preference_conflict: false,
    why: prev?.why || "",
    alternatives: prev?.alternatives || [],
    spoken_advice: prev?.spoken_advice || "",
    audioBase64: null,
    audioMimeType: null,
    latencyMs: prev?.latencyMs || 0,
    decisionId: prev?.decisionId ?? null,
    sources: prev?.sources || [],
    weight: prev?.weight || "everyday",
    memory_hints: prev?.memory_hints || [],
  };
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
  const [speakingMode, setSpeakingMode] = useState(false);
  const [amendIntent, setAmendIntent] = useState<AmendIntent | null>(null);
  const [leanToward, setLeanToward] = useState<string | null>(null);
  const [interruptSpeak, setInterruptSpeak] = useState(0);
  const resultTopRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastPayloadRef = useRef<DecidePayload | null>(null);
  const stageBeforeSubmitRef = useRef<Stage>("input");
  const sawPartialRef = useRef(false);
  const settledResultRef = useRef<DecideResponse | null>(null);
  const leanTowardRef = useRef<string | null>(null);

  useEffect(() => {
    if (stage === "result") {
      resultTopRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [stage, result?.decisionId, result?.recommendation]);

  function restoreAfterFailedStream() {
    const priorStage = stageBeforeSubmitRef.current;
    if (priorStage === "result" && settledResultRef.current) {
      setResult(settledResultRef.current);
      setClarify(null);
      setStage("result");
      return;
    }
    if (priorStage === "clarify") {
      setResult(null);
      setStage("clarify");
      return;
    }
    setResult(null);
    setStage("input");
  }

  async function submit(payload: DecidePayload) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    lastPayloadRef.current = payload;
    stageBeforeSubmitRef.current = stage;
    sawPartialRef.current = false;
    if (result?.status === "decide" && result.recommendation) {
      settledResultRef.current = result;
    }

    setBusy("thinking");
    setError(null);
    setGatheringHint(null);
    setDrafting(false);
    setProgressStage("thinking");
    setSpeakingMode(false);
    setInterruptSpeak((n) => n + 1);
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
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
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
              ...emptyPartial(prev, payload),
              recommendation: String(
                evt.recommendation || prev?.recommendation || ""
              ),
              why: String(evt.why || prev?.why || ""),
              spoken_advice: String(
                evt.spoken_advice || prev?.spoken_advice || ""
              ),
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
        if (sawPartialRef.current) restoreAfterFailedStream();
        return;
      }
      console.error(err);
      if (sawPartialRef.current) restoreAfterFailedStream();
      setError(
        friendlyError(
          err instanceof Error ? err.message : "Something went wrong."
        )
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
      const lean =
        decideResult.recommendation?.trim() ||
        decideResult.options?.[0]?.trim() ||
        settledResultRef.current?.recommendation?.trim() ||
        leanTowardRef.current;
      leanTowardRef.current = lean || null;
      setLeanToward(lean || null);
      setHistory((prev) => [
        ...prev,
        { role: "user", text: userText },
        { role: "assistant", text: decideResult.spoken_advice },
      ]);
      setClarify(decideResult);
      setResult(null);
      setTextSituation("");
      setShowType(false);
      setAmendIntent(null);
      setStage("clarify");
      return;
    }

    settledResultRef.current = {
      ...decideResult,
      weight: decideResult.weight ?? "everyday",
      memory_hints: decideResult.memory_hints ?? [],
    };
    leanTowardRef.current =
      decideResult.recommendation?.trim() || leanTowardRef.current;
    setLeanToward(leanTowardRef.current);
    setHistory((prev) => [
      ...prev,
      { role: "user", text: userText },
      { role: "assistant", text: decideResult.spoken_advice },
    ]);
    setResult(settledResultRef.current);
    setClarify(null);
    setTextSituation("");
    setShowType(false);
    setAmendIntent(null);
    setStage("result");
  }

  function handleRecorded(audioBase64: string, mimeType: string) {
    void submit({
      audioBase64,
      mimeType,
      ...(amendIntent ? { amendIntent } : {}),
    });
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = textSituation.trim();
    if (!trimmed) {
      setError("Say or type what’s going on.");
      return;
    }
    void submit({
      textSituation: trimmed,
      ...(amendIntent ? { amendIntent } : {}),
    });
  }

  function skipClarify() {
    void submit({
      textSituation:
        "Decide with what you already know — I can’t answer further right now.",
    });
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
    setSpeakingMode(false);
    setAmendIntent(null);
    setLeanToward(null);
    leanTowardRef.current = null;
    settledResultRef.current = null;
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

  const voiceState: VoiceVisualState =
    busy === "thinking"
      ? "weighing"
      : speakingMode
        ? "speaking"
        : busy === "recording"
          ? "listening"
          : "idle";

  function onRecordingChange(rec: boolean) {
    if (rec) {
      setInterruptSpeak((n) => n + 1);
      setSpeakingMode(false);
      setBusy("recording");
    } else {
      setBusy((b) => (b === "recording" ? null : b));
    }
  }

  return (
    <>
      <DecideShell
        statusLabel={statusLabel}
        showCancel={busy === "thinking"}
        showNew={stage !== "input" || history.length > 0}
        onCancel={() => abortRef.current?.abort()}
        onNew={startFresh}
        onOpenMemory={() => setMemoryOpen(true)}
        speakingMode={speakingMode && stage === "result"}
      >
        {error && (
          <div className="mb-8">
            <ErrorBanner
              message={error}
              canRetry={Boolean(lastPayloadRef.current)}
              onRetry={() => {
                const p = lastPayloadRef.current;
                if (p) void submit(p);
              }}
              onDismiss={() => setError(null)}
            />
          </div>
        )}

        <main
          className={`flex flex-1 flex-col ${
            busy === "thinking" ? "pointer-events-none opacity-[0.92]" : ""
          }`}
        >
          {stage === "result" && result && (
            <div ref={resultTopRef} className="flex flex-1 flex-col gap-14 py-2">
              <VerdictSheet
                result={result}
                drafting={drafting}
                interruptSpeak={interruptSpeak}
                includeOutcomeFeedback={false}
                onOpenMemory={() => setMemoryOpen(true)}
                onSpeakingChange={setSpeakingMode}
              />
              {!drafting && (
                <>
                  <AmendBar
                    busy={busy === "thinking"}
                    voiceState={voiceState}
                    intent={amendIntent}
                    onIntentChange={setAmendIntent}
                    onRecorded={handleRecorded}
                    onRecordingChange={onRecordingChange}
                    showType={showType}
                    setShowType={setShowType}
                    textSituation={textSituation}
                    setTextSituation={setTextSituation}
                    onTextSubmit={handleTextSubmit}
                  />
                  <OutcomeFeedback
                    key={result.decisionId ?? result.recommendation}
                    result={result}
                  />
                </>
              )}
            </div>
          )}

          {stage === "clarify" && clarify && (
            <ClarifyStage
              clarify={clarify}
              leanRecommendation={leanToward}
              busy={busy === "thinking"}
              voiceState={voiceState}
              onRecorded={handleRecorded}
              onRecordingChange={onRecordingChange}
              showType={showType}
              setShowType={setShowType}
              textSituation={textSituation}
              setTextSituation={setTextSituation}
              onTextSubmit={handleTextSubmit}
              onSkip={skipClarify}
            />
          )}

          {stage === "input" && (
            <InputStage
              busy={busy === "thinking"}
              voiceState={voiceState}
              onRecorded={handleRecorded}
              onRecordingChange={onRecordingChange}
              showType={showType}
              setShowType={setShowType}
              textSituation={textSituation}
              setTextSituation={setTextSituation}
              onTextSubmit={handleTextSubmit}
              geoLabel={geoLabel}
              onGeo={requestGeo}
              onExample={(p) => {
                setTextSituation(p);
                setShowType(true);
              }}
            />
          )}
        </main>
      </DecideShell>

      <MemorySheet open={memoryOpen} onClose={() => setMemoryOpen(false)} />
    </>
  );
}
