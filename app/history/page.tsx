"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionRow } from "@/lib/types";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sessions")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load sessions.");
        setSessions(data.sessions ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-950 px-6 py-12">
      <div className="flex w-full max-w-4xl items-center justify-between">
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Back
        </Link>
        <h1 className="text-lg font-semibold text-zinc-50">Session history</h1>
        <a
          href="/api/sessions/csv"
          className="rounded-full border border-zinc-700 px-4 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Export CSV
        </a>
      </div>

      {loading && <p className="text-zinc-400">Loading…</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && sessions.length === 0 && (
        <p className="text-zinc-500">No sessions logged yet.</p>
      )}

      {!loading && sessions.length > 0 && (
        <div className="w-full max-w-4xl overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm text-zinc-300">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-500">
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Decision</th>
                <th className="py-2 pr-4">Craving</th>
                <th className="py-2 pr-4">Temptation</th>
                <th className="py-2 pr-4">Streak</th>
                <th className="py-2 pr-4">Sleep</th>
                <th className="py-2 pr-4">Note</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-zinc-800">
                  <td className="py-2 pr-4">{s.id}</td>
                  <td className="py-2 pr-4">{s.created_at}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        s.decision === "comply"
                          ? "text-emerald-400"
                          : s.decision === "partial"
                            ? "text-amber-400"
                            : "text-red-400"
                      }
                    >
                      {s.decision}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{s.craving_intensity}/10</td>
                  <td className="py-2 pr-4">{s.temptation_type}</td>
                  <td className="py-2 pr-4">{s.adherence_streak_days}d</td>
                  <td className="py-2 pr-4">{s.sleep_hours}h</td>
                  <td className="py-2 pr-4 max-w-xs truncate">{s.user_note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
