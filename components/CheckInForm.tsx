"use client";

import { useState } from "react";
import type { CheckIn } from "@/lib/types";

interface CheckInFormProps {
  onSubmit: (checkIn: CheckIn) => void;
}

const DEFAULTS: CheckIn = {
  sleepHours: 7,
  daysOnDiet: 14,
  hungerLevel: 5,
  adherenceStreakDays: 5,
};

export default function CheckInForm({ onSubmit }: CheckInFormProps) {
  const [checkIn, setCheckIn] = useState<CheckIn>(DEFAULTS);

  function update<K extends keyof CheckIn>(key: K, value: CheckIn[K]) {
    setCheckIn((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(checkIn);
      }}
      className="flex w-full max-w-md flex-col gap-5"
    >
      <h1 className="text-2xl font-semibold text-zinc-50">Quick check-in</h1>
      <p className="text-sm text-zinc-400">Takes about 15 seconds. Defaults are pre-filled — adjust as needed.</p>

      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-sm text-zinc-300">
          <span>Sleep last night</span>
          <span className="tabular-nums text-zinc-400">{checkIn.sleepHours}h</span>
        </span>
        <input
          type="range"
          min={0}
          max={12}
          step={0.5}
          value={checkIn.sleepHours}
          onChange={(e) => update("sleepHours", Number(e.target.value))}
          className="accent-emerald-500"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">Days on diet</span>
        <input
          type="number"
          min={0}
          value={checkIn.daysOnDiet}
          onChange={(e) => update("daysOnDiet", Number(e.target.value))}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-sm text-zinc-300">
          <span>Current hunger level</span>
          <span className="tabular-nums text-zinc-400">{checkIn.hungerLevel}/10</span>
        </span>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={checkIn.hungerLevel}
          onChange={(e) => update("hungerLevel", Number(e.target.value))}
          className="accent-amber-500"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">Current adherence streak (days)</span>
        <input
          type="number"
          min={0}
          value={checkIn.adherenceStreakDays}
          onChange={(e) => update("adherenceStreakDays", Number(e.target.value))}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-50"
        />
      </label>

      <button
        type="submit"
        className="mt-2 rounded-full bg-emerald-500 px-6 py-3 font-medium text-black transition-colors hover:bg-emerald-400"
      >
        Start session
      </button>
    </form>
  );
}
