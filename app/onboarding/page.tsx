"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  KIRBY_ITEMS,
  scoreKirby,
  type KirbyChoice,
  type KirbyResponses,
  type KirbyScore,
} from "@/lib/kirby";
import { K_DISCOUNT_RATE, priorCenter } from "@/lib/priors";

const STORAGE_KEY = "optimal.psychometrics";

interface StoredPsychometrics {
  kirby: KirbyScore;
  completedAt: string;
}

function persist(score: KirbyScore) {
  try {
    const payload: StoredPsychometrics = {
      kirby: score,
      completedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage can be unavailable (private mode); scoring still shows.
  }
}

export default function Onboarding() {
  const [responses, setResponses] = useState<KirbyResponses>({});
  const [score, setScore] = useState<KirbyScore | null>(null);

  const answeredCount = Object.keys(responses).length;
  const allAnswered = answeredCount === KIRBY_ITEMS.length;
  const priorK = useMemo(() => priorCenter(K_DISCOUNT_RATE), []);

  function choose(id: number, choice: KirbyChoice) {
    setResponses((prev) => ({ ...prev, [id]: choice }));
  }

  function finish() {
    const result = scoreKirby(responses);
    if (result) {
      setScore(result);
      persist(result);
    }
  }

  function restart() {
    setResponses({});
    setScore(null);
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-zinc-950 px-6 py-12">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <span className="text-sm font-semibold tracking-tight text-zinc-50">
          Optimal · Onboarding
        </span>
        <Link href="/session" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Home
        </Link>
      </div>

      {!score ? (
        <div className="flex w-full max-w-2xl flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-zinc-50">
              Delay-discounting questionnaire
            </h1>
            <p className="text-sm text-zinc-400">
              27 quick money choices (the Kirby MCQ). There are no right answers —
              just pick the option you&apos;d genuinely prefer. This estimates your
              personal discount rate <span className="font-mono">k</span>, one of
              the priors that grounds the Wise Friend before it has your data.
              Answers are scored on your device.
            </p>
          </header>

          <ol className="flex flex-col gap-3">
            {KIRBY_ITEMS.map((item, idx) => {
              const choice = responses[item.id];
              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
                >
                  <p className="mb-3 text-sm text-zinc-300">
                    <span className="mr-2 tabular-nums text-zinc-500">
                      {idx + 1}.
                    </span>
                    Would you prefer…
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => choose(item.id, "immediate")}
                      aria-pressed={choice === "immediate"}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        choice === "immediate"
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                          : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-600"
                      }`}
                    >
                      <span className="font-semibold tabular-nums">
                        ${item.immediate}
                      </span>{" "}
                      today
                    </button>
                    <button
                      type="button"
                      onClick={() => choose(item.id, "delayed")}
                      aria-pressed={choice === "delayed"}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        choice === "delayed"
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                          : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-600"
                      }`}
                    >
                      <span className="font-semibold tabular-nums">
                        ${item.delayed}
                      </span>{" "}
                      in {item.delayDays} days
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-full border border-zinc-800 bg-zinc-900/90 px-5 py-3 backdrop-blur">
            <span className="text-sm text-zinc-400 tabular-nums">
              {answeredCount} / {KIRBY_ITEMS.length} answered
            </span>
            <button
              type="button"
              onClick={finish}
              disabled={!allAnswered}
              className="rounded-full bg-emerald-500 px-6 py-2 font-medium text-black transition-colors enabled:hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              See my score
            </button>
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-md flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-zinc-50">Your discount rate</h1>
            <p className="text-sm text-zinc-400">
              Saved on this device. It overrides the population prior for{" "}
              <span className="font-mono">k</span> in the model.
            </p>
          </header>

          <dl className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
            <Row label="Overall k" value={fmtK(score.kOverall)} highlight />
            <Row label="Small rewards" value={fmtK(score.kSmall)} />
            <Row label="Medium rewards" value={fmtK(score.kMedium)} />
            <Row label="Large rewards" value={fmtK(score.kLarge)} />
            <Row
              label="Consistency"
              value={`${Math.round(score.consistency * 100)}%`}
            />
            <Row label="Population prior k" value={fmtK(priorK)} muted />
          </dl>

          <p className="text-sm text-zinc-400">
            {score.kOverall > priorK
              ? "You discount the future more steeply than the population prior — the short-run self pulls harder, so the Wise Friend should lean earlier and firmer."
              : "You discount the future about as much as, or less than, the population prior — the math can trust your stated long-run values more."}
          </p>

          <div className="flex gap-4">
            <Link
              href="/session"
              className="rounded-full bg-emerald-500 px-5 py-2 font-medium text-black hover:bg-emerald-400"
            >
              Done
            </Link>
            <button
              type="button"
              onClick={restart}
              className="rounded-full border border-zinc-700 px-5 py-2 text-zinc-200 hover:bg-zinc-800"
            >
              Retake
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
  muted,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={`text-sm ${muted ? "text-zinc-500" : "text-zinc-300"}`}>
        {label}
      </dt>
      <dd
        className={`font-mono tabular-nums ${
          highlight ? "text-lg text-emerald-300" : muted ? "text-zinc-500" : "text-zinc-100"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function fmtK(k: number): string {
  return k.toPrecision(2);
}
