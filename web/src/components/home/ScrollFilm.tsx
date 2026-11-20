"use client";

import { useEffect, useRef, useState } from "react";

const CHAPTERS = [
  { at: 0, title: "Start with a listing photo", body: "The same still you put on the MLS. Nothing to shoot, nothing to edit." },
  { at: 0.18, title: "We move the camera through it", body: "Each photo becomes a smooth five-second shot with real depth. Nothing in the room is added or moved." },
  { at: 0.62, title: "Your branding goes on", body: "Address, details and your name, brokerage and logo, in the look you picked." },
  { at: 0.8, title: "Ready for every screen", body: "A full walkthrough for the MLS and YouTube, and tall cuts for Reels, TikTok and Shorts." },
];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const span = (p: number, a: number, b: number) => clamp((p - a) / (b - a));

/**
 * The homepage's scroll story: as you scroll, one listing photo turns into a walkthrough shot (the video scrubs with
 * the page), picks up a title card, then reshapes into a tall Reel. Pinned while it plays; plain and static for anyone
 * who prefers reduced motion.
 */
export function ScrollFilm() {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [p, setP] = useState(0);
  const [still] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (still) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const el = root.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const v = clamp(-r.top / Math.max(1, total));
      setP(v);
      const vid = video.current;
      if (vid && vid.duration) {
        const t = span(v, 0.18, 0.62) * (vid.duration - 0.05);
        if (Math.abs(vid.currentTime - t) > 0.01) vid.currentTime = t;
      }
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    tick();
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [still]);

  const active = still ? 3 : CHAPTERS.reduce((a, c, i) => (p >= c.at ? i : a), 0);
  const brand = still ? 1 : span(p, 0.62, 0.72);
  const tall = still ? 0 : span(p, 0.82, 0.95);
  const c = CHAPTERS[active];

  return (
    <section ref={root} aria-label="From still photo to walkthrough" className={`relative bg-ink ${still ? "" : "h-[420vh]"}`}>
      <div className={`${still ? "relative h-[100svh]" : "sticky top-0 h-[100svh]"} w-full overflow-hidden`}>
        {/* full-screen frame; for the Reel step it closes in to a tall 9:16 window in the middle of the screen */}
        <div className="absolute inset-0"
          style={{ clipPath: `inset(${tall * 4}% calc(${tall} * (50% - 100svh * 0.92 * 9 / 32)) ${tall * 4}% calc(${tall} * (50% - 100svh * 0.92 * 9 / 32)) round ${tall * 28}px)` }}>
          <video ref={video} src="/fx/move_scrub.mp4" poster="/home/frame1.jpg" muted playsInline preload="auto"
            aria-label="A listing photo turning into a camera move toward the front door" className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: 0.18 + brand * 0.12 }} />
          {/* title card, as the finished video shows it */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white"
            style={{ opacity: brand, transform: `translateY(${(1 - brand) * 20}px)` }}>
            <span className="text-[clamp(10px,1.1vw,15px)] font-semibold uppercase tracking-[0.35em]">Just listed</span>
            <span className="mt-3 max-w-[min(92vw,1000px)] font-display leading-[1.02] text-balance"
              style={{ fontSize: `calc(clamp(34px,5.6vw,88px) * ${1 - tall * 0.5})` }}>1234 Oak Hollow Drive</span>
            <span className="mt-4 text-[clamp(10px,1.1vw,15px)] uppercase tracking-[0.25em]" style={{ opacity: 1 - tall }}>4 beds · 3.5 baths · 2,950 sq ft</span>
          </div>
        </div>

        {/* the step we're on, over the footage */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-5 pb-8 sm:px-10 sm:pb-12" style={{ opacity: 1 - tall * 0.0 }}>
          <div className="mx-auto flex max-w-[1180px] flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div key={active} className="max-w-[520px] text-white [animation:rise-in_.5s_ease-out_both]"
              style={{ maxWidth: tall > 0.2 ? "min(520px, calc(50vw - 100svh * 0.92 * 9 / 32 - max(40px, 50vw - 590px) - 40px))" : undefined }}>
              <span className="text-[13px] font-semibold uppercase tracking-[0.2em] text-white/70">{`0${active + 1} / 04`}</span>
              <h2 className="mt-2 font-display text-[clamp(30px,4vw,56px)] leading-[1.05]">{c.title}</h2>
              <p className="mt-3 text-[16px] leading-relaxed text-white/85 sm:text-lg">{c.body}</p>
            </div>
            {!still && (
              <div className="flex gap-1.5" aria-hidden>
                {CHAPTERS.map((ch, i) => (
                  <span key={ch.title} className="h-1 w-10 overflow-hidden rounded-full bg-white/25 sm:w-14">
                    <span className="block h-full rounded-full bg-white"
                      style={{ width: `${Math.round(span(p, ch.at, CHAPTERS[i + 1]?.at ?? 1) * 100)}%` }} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
