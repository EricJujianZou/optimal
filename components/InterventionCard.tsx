"use client";

import { useEffect, useRef, useState } from "react";
import type { InterveneResponse } from "@/lib/types";

interface InterventionCardProps {
  result: InterveneResponse;
}

export default function InterventionCard({ result }: InterventionCardProps) {
  const [showTrace, setShowTrace] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioSrc = `data:${result.audioMimeType};base64,${result.audioBase64}`;

  useEffect(() => {
    audioRef.current?.play().catch(() => {
      // Autoplay can be blocked; user can hit replay manually.
    });
  }, [result.audioBase64]);

  return (
    <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-zinc-700 bg-zinc-900 p-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Wise Friend</p>
        <p className="mt-1 text-lg text-zinc-50">{result.intervention_text}</p>
      </div>

      <audio ref={audioRef} src={audioSrc} className="hidden" />
      <button
        type="button"
        onClick={() => audioRef.current?.play()}
        className="self-start rounded-full border border-zinc-600 px-4 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
      >
        ▶ Replay audio
      </button>

      <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300">
        <div>
          <span className="text-zinc-500">Craving intensity</span>
          <p>{result.craving_intensity}/10</p>
        </div>
        <div>
          <span className="text-zinc-500">Temptation type</span>
          <p>{result.temptation_type}</p>
        </div>
        <div className="col-span-2">
          <span className="text-zinc-500">Context tags</span>
          <p>{result.context_tags.join(", ") || "—"}</p>
        </div>
      </div>

      <div className="text-sm">
        <button
          type="button"
          onClick={() => setShowTrace((v) => !v)}
          className="cursor-pointer text-zinc-400 hover:text-zinc-200"
        >
          {showTrace ? "Hide" : "Show"} reasoning trace
        </button>
        {showTrace && (
          <p className="mt-2 whitespace-pre-wrap text-zinc-400">{result.reasoning_trace}</p>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Transcript</summary>
        <p className="mt-2 whitespace-pre-wrap text-zinc-400">{result.transcript}</p>
      </details>

      <p className="text-right text-xs text-zinc-600">{result.latencyMs}ms</p>
    </div>
  );
}
