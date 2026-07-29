"use client";

/**
 * Play TTS / spoken audio with best-effort background resilience:
 * AudioContext + Media Session when possible; HTMLAudioElement fallback.
 */

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AC();
  }
  return sharedCtx;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export type SpokenPlayback = {
  stop: () => void;
};

function pickLocalVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const pool = en.length > 0 ? en : voices;
  // Prefer local/offline voices when the browser marks them.
  const local = pool.find((v) => v.localService);
  return (
    local ||
    pool.find((v) => /samantha|daniel|karen|moira|rishi|google us english/i.test(v.name)) ||
    pool[0] ||
    null
  );
}

/** Local on-device TTS via the Web Speech API (no cloud quota). */
export function playBrowserSpeech(text: string): SpokenPlayback {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return { stop: () => undefined };
  }
  const synth = window.speechSynthesis;
  synth.cancel();

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let onVoices: (() => void) | null = null;

  const utter = new SpeechSynthesisUtterance(text.slice(0, 500));
  utter.rate = 1.02;
  utter.pitch = 1;
  const voice = pickLocalVoice();
  if (voice) utter.voice = voice;

  const clearPending = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    if (onVoices) {
      synth.removeEventListener("voiceschanged", onVoices);
      onVoices = null;
    }
  };

  const speakOnce = () => {
    if (stopped) return;
    clearPending();
    const late = pickLocalVoice();
    if (late) utter.voice = late;
    synth.speak(utter);
  };

  if (synth.getVoices().length === 0) {
    onVoices = () => speakOnce();
    synth.addEventListener("voiceschanged", onVoices);
    timer = setTimeout(speakOnce, 250);
  } else {
    speakOnce();
  }

  return {
    stop: () => {
      stopped = true;
      clearPending();
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
    },
  };
}

export async function playSpokenAudio(args: {
  audioBase64: string;
  mimeType: string;
  title?: string;
}): Promise<SpokenPlayback> {
  const { audioBase64, mimeType, title = "Megamind" } = args;
  let stopped = false;
  let source: AudioBufferSourceNode | null = null;
  let htmlAudio: HTMLAudioElement | null = null;

  const stop = () => {
    stopped = true;
    try {
      source?.stop();
    } catch {
      /* already stopped */
    }
    source = null;
    if (htmlAudio) {
      htmlAudio.pause();
      htmlAudio.removeAttribute("src");
      htmlAudio = null;
    }
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "none";
      } catch {
        /* ignore */
      }
    }
  };

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: "Megamind",
        album: "Decision",
      });
      navigator.mediaSession.playbackState = "playing";
      navigator.mediaSession.setActionHandler?.("pause", () => stop());
      navigator.mediaSession.setActionHandler?.("stop", () => stop());
    } catch {
      /* Media Session not fully supported */
    }
  }

  const ctx = getCtx();
  if (ctx) {
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const buffer = await ctx.decodeAudioData(
        base64ToArrayBuffer(audioBase64).slice(0)
      );
      if (stopped) return { stop };
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "none";
        }
      };
      source.start(0);
      return { stop };
    } catch (err) {
      console.warn("[playSpokenAudio] AudioContext failed; falling back:", err);
    }
  }

  htmlAudio = new Audio(`data:${mimeType};base64,${audioBase64}`);
  htmlAudio.play().catch(() => {});
  htmlAudio.onended = () => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
    }
  };
  return { stop };
}
