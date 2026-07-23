"use client";

import { useEffect, useRef, useState } from "react";

function videoSrc() {
  if (typeof window === "undefined") return "/megamind-scroll.mp4";
  return window.matchMedia("(max-width: 768px)").matches
    ? "/megamind-scroll-sm.mp4"
    : "/megamind-scroll.mp4";
}

/**
 * Times (s) from 8fps frame pass on the 4.0s film:
 * 0.50 first red · 1.75 second red · 2.25 green forming · 2.375 checkmark
 * "This." starts at 2.1.
 */
const BEATS = [
  { until: 0.42, line: "The mathematically correct decision." },
  { until: 1.55, line: "Not this." },
  { until: 2.1, line: "Not this." },
  { until: 99, line: "This." },
] as const;

const FILM_DURATION = 4;

function beatIndex(time: number) {
  for (let i = 0; i < BEATS.length; i++) {
    if (time < BEATS[i].until) return i;
  }
  return BEATS.length - 1;
}

export function FilmHero() {
  const trackRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const seekingRef = useRef(false);
  const pendingRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const lastBeatRef = useRef(-1);
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    const video = videoRef.current;
    if (!track || !video) return;

    let alive = true;

    const setBeatFromTime = (time: number) => {
      const next = beatIndex(time);
      if (next === lastBeatRef.current) return;
      lastBeatRef.current = next;
      setBeat(next);
    };

    const scrollProgress = () => {
      const rect = track.getBoundingClientRect();
      const range = Math.max(rect.height - window.innerHeight, 1);
      return Math.min(Math.max(-rect.top / range, 0), 1);
    };

    const seek = (time: number) => {
      if (!readyRef.current || !Number.isFinite(video.duration)) return;

      const target = Math.min(
        Math.max(time, 0),
        Math.max(video.duration - 0.001, 0),
      );

      if (Math.abs(video.currentTime - target) < 0.025) {
        seekingRef.current = false;
        return;
      }

      if (seekingRef.current) {
        pendingRef.current = target;
        return;
      }

      seekingRef.current = true;
      try {
        video.currentTime = target;
      } catch {
        seekingRef.current = false;
      }
    };

    const onSeeked = () => {
      seekingRef.current = false;
      // Lock copy to the frame actually on screen
      setBeatFromTime(video.currentTime);
      if (pendingRef.current != null) {
        const next = pendingRef.current;
        pendingRef.current = null;
        seek(next);
      }
    };

    const sync = () => {
      rafRef.current = 0;
      if (!alive) return;

      const p = scrollProgress();
      const duration =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : FILM_DURATION;
      const t = p * duration;

      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${p})`;
      }

      // Lead the copy slightly so it never trails the picture
      setBeatFromTime(t);
      if (readyRef.current) seek(t);
    };

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(sync);
    };

    const arm = () => {
      if (!alive || !video.duration || Number.isNaN(video.duration)) return;
      readyRef.current = true;
      video.pause();
      sync();
    };

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.src = videoSrc();
    video.load();

    video.addEventListener("loadedmetadata", arm);
    video.addEventListener("loadeddata", arm);
    video.addEventListener("canplay", arm);
    video.addEventListener("seeked", onSeeked);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    if (video.readyState >= 1) arm();
    sync();

    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      video.removeEventListener("loadedmetadata", arm);
      video.removeEventListener("loadeddata", arm);
      video.removeEventListener("canplay", arm);
      video.removeEventListener("seeked", onSeeked);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section
      id="top"
      ref={trackRef}
      className="relative h-[250vh]"
      aria-label="Megamind"
    >
      <div className="sticky top-0 h-[100svh] overflow-hidden bg-ink">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          preload="auto"
          poster="/megamind-scroll-poster.jpg"
          disablePictureInPicture
          aria-hidden
        />

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              linear-gradient(
                to bottom,
                color-mix(in srgb, var(--ink) 68%, transparent) 0%,
                color-mix(in srgb, var(--ink) 12%, transparent) 28%,
                transparent 48%,
                color-mix(in srgb, var(--ink) 30%, transparent) 70%,
                color-mix(in srgb, var(--ink) 92%, transparent) 100%
              )
            `,
          }}
          aria-hidden
        />

        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between px-6 pb-9 pt-6 sm:px-8 sm:pb-11 sm:pt-7">
          <div className="mx-auto w-full max-w-5xl">
            <p className="font-display text-[clamp(2.75rem,8vw,5.25rem)] font-extrabold leading-[0.9] tracking-[-0.05em] text-paper">
              Megamind
            </p>
          </div>

          <div className="mx-auto w-full max-w-5xl">
            <p
              key={beat}
              className={`film-line font-display text-[clamp(1.7rem,4.2vw,2.85rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-paper ${
                beat === 0 ? "max-w-[16ch]" : "max-w-[10ch]"
              }`}
              aria-live="polite"
            >
              {BEATS[beat].line}
            </p>
            <div className="mt-5 h-px w-32 bg-paper/15 sm:w-40" aria-hidden>
              <div
                ref={progressRef}
                className="h-px w-full origin-left bg-paper will-change-transform"
                style={{ transform: "scaleX(0)" }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
