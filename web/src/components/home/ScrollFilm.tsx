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
  // shrink the 16:9 frame to a centred 9:16 window: inset left/right
  const side = tall * 34.2;   // % of width hidden on each side ((1 - (9/16)/(16/9)) / 2 ≈ 34%)

  return (
    <section ref={root} aria-label="From still photo to walkthrough" className={`relative bg-white ${still ? "" : "h-[420vh]"}`}
      style={{ ["--grow-phone" as string]: 1 + tall * 0.75 } as React.CSSProperties}>
      <div className={`${still ? "" : "sticky top-0 h-[100svh]"} flex items-center px-5 py-20 sm:px-8`}>
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 lg:flex-row lg:items-center lg:gap-16">
          <ol className="flex min-w-0 flex-col gap-1 lg:w-[38%]">
            {CHAPTERS.map((c, i) => (
              <li key={c.title} className={`border-l-2 py-2 pl-5 transition-colors duration-300 ${i === active ? "border-accent" : "border-line"} ${i === active ? "" : "max-lg:hidden"}`}>
                <span className={`block font-display text-[clamp(24px,2.6vw,34px)] leading-tight transition-colors duration-300 ${i === active ? "text-ink" : "text-muted"}`}>
                  {c.title}
                </span>
                <span className={`grid transition-all duration-500 ${i === active ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <span className="overflow-hidden pt-2 text-[16px] leading-relaxed text-ink-soft">{c.body}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="relative min-w-0 flex-1">
            <div className="relative aspect-video w-full overflow-hidden rounded-[28px] bg-line shadow-[0_20px_60px_rgba(43,32,28,0.18)] max-lg:origin-top lg:!transform-none"
              style={{ clipPath: `inset(0 ${side}% 0 ${side}% round 28px)`, transform: `scale(var(--grow-phone, 1))`} as React.CSSProperties}>
              <video ref={video} src="/fx/move_scrub.mp4" poster="/home/frame1.jpg" muted playsInline preload="auto"
                aria-label="A listing photo turning into a camera move toward the front door" className="h-full w-full object-cover" />
              {/* title card, as the finished video shows it */}
              {/* the photo dims a touch under the title so the type reads, like a finished video's grade */}
              <div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: brand * 0.22 }} />
              <div className="pointer-events-none absolute inset-y-0 flex flex-col items-center justify-center px-3 text-center text-white"
                style={{ left: `${side}%`, right: `${side}%`, opacity: brand, transform: `translateY(${(1 - brand) * 16}px)` }}>
                <span className="text-[clamp(8px,1vw,13px)] font-semibold uppercase tracking-[0.35em]">Just listed</span>
                <span className="mt-2 font-display leading-[1.02] text-balance" style={{ fontSize: `calc(clamp(22px,3.4vw,46px) * ${1 - tall * 0.35})` }}>1234 Oak Hollow Drive</span>
                <span className="mt-3 text-[clamp(8px,1vw,13px)] uppercase tracking-[0.25em]" style={{ opacity: 1 - tall }}>4 beds · 3.5 baths · 2,950 sq ft</span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-[13px] font-semibold text-muted max-lg:mt-[calc((var(--grow-phone)-1)*56.25%+16px)]">
              <span>{active === 0 ? "Listing photo" : active === 1 ? "Camera move" : active === 2 ? "Title card" : tall > 0.5 ? "9:16 Reel" : "16:9 walkthrough"}</span>
              {!still && (
                <span className="h-1 w-32 overflow-hidden rounded-full bg-line" aria-hidden>
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${p * 100}%` }} />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
