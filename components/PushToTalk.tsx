"use client";

import { useRef, useState } from "react";

interface PushToTalkProps {
  onRecorded: (audioBase64: string, mimeType: string) => void;
  disabled?: boolean;
}

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
      // strip the "data:<mime>;base64," prefix
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function PushToTalk({ onRecorded, disabled }: PushToTalkProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  async function startRecording() {
    if (disabled || recording) return;
    setError(null);
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
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (blob.size > 0) {
          const base64 = await blobToBase64(blob);
          onRecorded(base64, mimeTypeRef.current);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      console.error(err);
      setError("Microphone access denied or unavailable.");
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => {
          e.preventDefault();
          startRecording();
        }}
        onPointerUp={stopRecording}
        onPointerLeave={() => recording && stopRecording()}
        onPointerCancel={stopRecording}
        className={`flex h-32 w-32 select-none items-center justify-center rounded-full text-sm font-semibold uppercase tracking-wide transition-colors touch-none ${
          recording
            ? "animate-pulse bg-red-600 text-white"
            : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
        } disabled:opacity-40`}
      >
        {recording ? "Recording…" : "Hold to talk"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
