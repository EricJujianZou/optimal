"use client";

import { useEffect, useRef, useState } from "react";
import { MIN_AUDIO_BYTES, sanitizeAudioMimeType } from "@/lib/audio";

interface PushToTalkProps {
  onRecorded: (audioBase64: string, mimeType: string) => void;
  disabled?: boolean;
  size?: "default" | "hero";
  label?: string;
  recordingLabel?: string;
  /** Fires when recording starts/stops so parents can keep UI visible. */
  onRecordingChange?: (recording: boolean) => void;
}

type WakeLockSentinelLike = { release: () => Promise<void> };

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "audio/webm";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function PushToTalk({
  onRecorded,
  disabled,
  size = "default",
  label = "Tap to talk",
  recordingLabel = "Tap to stop",
  onRecordingChange,
}: PushToTalkProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bgWarning, setBgWarning] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const wasHiddenWhileRecording = useRef(false);

  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden" && recorderRef.current?.state === "recording") {
        wasHiddenWhileRecording.current = true;
      }
      if (
        document.visibilityState === "visible" &&
        wasHiddenWhileRecording.current &&
        recorderRef.current?.state === "recording"
      ) {
        setBgWarning("Recording may have paused in the background — stay on this tab.");
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    return () => {
      void wakeLockRef.current?.release().catch(() => {});
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function acquireWakeLock() {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
      };
      if (nav.wakeLock?.request) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      }
    } catch {
      /* unsupported or denied */
    }
  }

  async function releaseWakeLock() {
    try {
      await wakeLockRef.current?.release();
    } catch {
      /* ignore */
    }
    wakeLockRef.current = null;
  }

  async function startRecording() {
    if (disabled || recording) return;
    setError(null);
    setBgWarning(null);
    wasHiddenWhileRecording.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        await releaseWakeLock();
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;

        if (blob.size < MIN_AUDIO_BYTES) {
          setError("No audio captured — tap, speak, then tap again to stop.");
          return;
        }
        const base64 = await blobToBase64(blob);
        const safeMime = sanitizeAudioMimeType(mimeTypeRef.current);
        onRecorded(base64, safeMime);
      };

      // Timeslices keep chunks flowing if the tab briefly backgrounds.
      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
      await acquireWakeLock();
    } catch (err) {
      console.error(err);
      setError("Microphone access denied or unavailable.");
      setRecording(false);
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.requestData?.();
      } catch {
        /* ignore */
      }
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  function toggle() {
    if (disabled) return;
    if (recording) stopRecording();
    else void startRecording();
  }

  const hero = size === "hero";

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={recording}
        aria-label={recording ? recordingLabel : label}
        onClick={toggle}
        className={`relative select-none touch-none rounded-full transition-[transform,box-shadow,background-color] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40 ${
          hero
            ? "flex h-40 w-40 items-center justify-center sm:h-44 sm:w-44"
            : "flex h-32 w-32 items-center justify-center"
        } ${
          recording
            ? "scale-[1.03] bg-danger text-paper shadow-[0_0_0_12px_color-mix(in_srgb,var(--danger)_28%,transparent)]"
            : "bg-paper text-ink hover:scale-[1.02] active:scale-[0.98]"
        }`}
      >
        {!recording && hero && (
          <span
            className="pointer-events-none absolute inset-0 animate-decide-ring rounded-full border border-paper/25"
            aria-hidden
          />
        )}
        <span
          className={`font-display font-semibold uppercase tracking-[0.14em] ${
            hero ? "text-[0.7rem] sm:text-xs" : "text-sm"
          }`}
        >
          {recording ? recordingLabel : label}
        </span>
      </button>
      {recording && (
        <p className="text-xs font-medium text-muted">Keep this tab open while you speak</p>
      )}
      {bgWarning && (
        <p className="max-w-xs text-center text-sm font-medium text-danger">{bgWarning}</p>
      )}
      {error && (
        <p
          role="alert"
          className="max-w-xs rounded-md border border-danger/40 bg-danger/15 px-3 py-2 text-center text-sm text-paper"
        >
          {error}
        </p>
      )}
    </div>
  );
}
