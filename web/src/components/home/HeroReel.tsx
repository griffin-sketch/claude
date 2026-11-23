"use client";

import { useEffect, useRef, useState } from "react";

/** Where each effect starts in /fx/reel_hero.mp4 (seconds). Each one opens on the still listing photo for ~0.7 s. */
const CHAPTERS = [
  { at: 0, name: "Construction build-up" },
  { at: 3.51, name: "Virtual staging" },
  { at: 7.02, name: "Day to dusk" },
  { at: 10.53, name: "Camera walkthrough" },
  { at: 14.04, name: "Twilight pool" },
];
const PHOTO_HOLD = 0.7;

/** The hero showreel: what Tourvo makes from a single listing photo, with a caption card that follows along. */
export function HeroReel({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState({ i: 0, photo: true });

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      const t = v.currentTime;
      let i = 0;
      CHAPTERS.forEach((c, k) => { if (t >= c.at) i = k; });
      const photo = t - CHAPTERS[i].at < PHOTO_HOLD;
      setState((s) => (s.i === i && s.photo === photo ? s : { i, photo }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()));
    io.observe(v);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  const c = CHAPTERS[state.i];
  return (
    <>
      <video ref={ref} src="/fx/reel_hero.mp4" poster="/fx/reel_hero.jpg" muted loop playsInline autoPlay preload="auto"
        aria-label="Short reel: one listing photo turned into a construction build-up, virtual staging, day to dusk, a camera walkthrough and a twilight pool"
        className={className} />
      <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-[20px] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(43,32,28,0.15)] sm:bottom-5 sm:left-5">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gold text-white">
          {state.photo ? (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 11l3-3 2 2 1.5-1.5 2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>
          )}
        </span>
        <span className="flex min-w-[11rem] flex-col" aria-live="off">
          <span className="text-[15px] font-semibold">{state.photo ? "Your listing photo" : c.name}</span>
          <span className="text-[13px] text-ink-soft">{state.photo ? `Becomes: ${c.name.toLowerCase()}` : "From one photo, one click"}</span>
        </span>
      </div>
      <div className="absolute right-4 top-4 flex gap-1.5 sm:right-5 sm:top-5" aria-hidden="true">
        {CHAPTERS.map((_, k) => (
          <span key={k} className={`h-1.5 rounded-full transition-all duration-300 ${k === state.i ? "w-6 bg-white" : "w-1.5 bg-white/60"}`} />
        ))}
      </div>
    </>
  );
}
