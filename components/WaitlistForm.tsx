"use client";

import { FormEvent, useState } from "react";

const emailOk = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }
    if (!emailOk(email)) {
      setError("Use a valid email.");
      return;
    }
    setError(null);
    setDone(true);
  }

  if (done) {
    return (
      <p className="text-base text-paper" role="status" aria-live="polite">
        You’re on the list.
      </p>
    );
  }

  return (
    <div className="w-full max-w-md">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2"
        noValidate
      >
        <label htmlFor="waitlist-email" className="sr-only">
          Email
        </label>
        <input
          id="waitlist-email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "waitlist-email-error" : undefined}
          className="min-h-12 flex-1 rounded-lg border border-[var(--line)] bg-ink-elevated/40 px-4 text-[15px] text-paper placeholder:text-muted-dim outline-none transition-[border-color] duration-150 focus:border-brass/50"
        />
        <button
          type="submit"
          className="min-h-12 rounded-lg bg-brass px-6 text-[15px] font-semibold tracking-tight text-brass-ink transition-opacity duration-150 hover:opacity-90"
        >
          Join waitlist
        </button>
      </form>
      <div
        id="waitlist-email-error"
        className="mt-2 min-h-5 text-sm text-danger"
        role="status"
        aria-live="polite"
      >
        {error}
      </div>
    </div>
  );
}
