"use client";

import { useEffect, useState } from "react";

type ProfileEvent = {
  id: number;
  created_at: string;
  kind: string;
  content: string;
  decision_id: number | null;
};

type ProfilePrefs = {
  risk_tolerance?: string;
  money_anxiety?: string;
  default_tip_pct?: number;
  home_label?: string;
  work_label?: string;
  lat?: number;
  lon?: number;
  hard_constraints?: string;
};

type ProfilePayload = {
  summary: string;
  prefs?: ProfilePrefs;
  updated_at: string;
  events: ProfileEvent[];
};

function kindLabel(kind: string): string {
  switch (kind) {
    case "profile_update":
      return "Learned";
    case "situation":
      return "Situation";
    case "manual_edit":
      return "You edited";
    case "outcome":
      return "Outcome";
    default:
      return kind;
  }
}

function prefsLines(prefs?: ProfilePrefs): string[] {
  if (!prefs) return [];
  const lines: string[] = [];
  if (prefs.risk_tolerance) lines.push(`Risk: ${prefs.risk_tolerance}`);
  if (prefs.money_anxiety) lines.push(`Money anxiety: ${prefs.money_anxiety}`);
  if (prefs.default_tip_pct != null) {
    lines.push(`Default tip: ${prefs.default_tip_pct}%`);
  }
  if (prefs.home_label) lines.push(`Home: ${prefs.home_label}`);
  if (prefs.work_label) lines.push(`Work: ${prefs.work_label}`);
  if (prefs.lat != null && prefs.lon != null) {
    lines.push(`Location: ${prefs.lat.toFixed(3)}, ${prefs.lon.toFixed(3)}`);
  }
  if (prefs.hard_constraints) lines.push(`Constraints: ${prefs.hard_constraints}`);
  return lines;
}

export default function MemorySheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState("");
  const [prefs, setPrefs] = useState<ProfilePrefs>({});
  const [events, setEvents] = useState<ProfileEvent[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [openSnapshot, setOpenSnapshot] = useState(open);

  if (open !== openSnapshot) {
    setOpenSnapshot(open);
    if (open) {
      setLoading(true);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    fetch("/api/profile", { signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as ProfilePayload & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not load memory.");
        return data;
      })
      .then((data) => {
        setSummary(data.summary ?? "");
        setPrefs(data.prefs ?? {});
        setEvents(data.events ?? []);
        setUpdatedAt(data.updated_at ?? null);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Could not load memory.");
        setLoading(false);
      });
    return () => ac.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => {
      document.getElementById("memory-close")?.focus();
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  async function save() {
    setSaving(true);
    setError(null);
    setSavedFlash(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary }),
      });
      const data = (await res.json()) as ProfilePayload & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      setSummary(data.summary ?? "");
      setEvents(data.events ?? []);
      setUpdatedAt(data.updated_at ?? null);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    if (
      !window.confirm(
        "Clear everything Megamind remembers about you? Decision history stays."
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearAll: true }),
      });
      const data = (await res.json()) as ProfilePayload & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Clear failed.");
      setSummary(data.summary ?? "");
      setPrefs(data.prefs ?? {});
      setEvents(data.events ?? []);
      setUpdatedAt(data.updated_at ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(id: number) {
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: id }),
      });
      const data = (await res.json()) as ProfilePayload & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed.");
      setEvents(data.events ?? []);
      setSummary(data.summary ?? summary);
      setUpdatedAt(data.updated_at ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-ink/75"
        aria-label="Close memory"
        onClick={onClose}
      />
      <div
        id="memory-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-title"
        className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-[var(--line)] bg-ink-elevated shadow-2xl sm:rounded-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2
              id="memory-title"
              className="font-serif text-lg font-semibold tracking-[-0.02em] text-paper"
            >
              What Megamind knows
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Lasting preferences used in your recommendations — edit anytime.
            </p>
          </div>
          <button
            id="memory-close"
            type="button"
            onClick={onClose}
            className="min-h-10 text-sm font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <>
              <section>
                <label
                  htmlFor="profile-summary"
                  className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
                >
                  Lasting preferences
                </label>
                <textarea
                  id="profile-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={8}
                  placeholder="Nothing saved yet. Facts you share across decisions will show up here."
                  className="mt-3 w-full resize-y rounded-lg border border-[var(--line)] bg-ink/50 px-3 py-2.5 text-[0.95rem] leading-relaxed text-paper placeholder:text-muted-dim focus:border-brass/45 focus:outline-none"
                />
                {updatedAt && (
                  <p className="mt-2 text-xs text-muted">
                    Updated{" "}
                    {new Date(
                      updatedAt.replace(" ", "T") + "Z"
                    ).toLocaleString()}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="min-h-10 rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-brass-ink transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {saving ? "Saving…" : savedFlash ? "Saved" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void clearAll()}
                    className="min-h-10 text-sm font-medium text-danger transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Clear all memory
                  </button>
                </div>
              </section>

              {prefsLines(prefs).length > 0 && (
                <section>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Structured prefs
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm text-paper/85">
                    {prefsLines(prefs).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Recent notes
                </p>
                {events.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">No notes yet.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-[var(--line)]">
                    {events.map((ev) => (
                      <li key={ev.id} className="flex gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                            {kindLabel(ev.kind)}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-paper/85">
                            {ev.content}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeEvent(ev.id)}
                          className="min-h-10 shrink-0 self-start text-xs font-medium text-muted hover:text-danger"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-md border border-danger/40 bg-danger/15 px-3 py-2 text-sm text-paper"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
