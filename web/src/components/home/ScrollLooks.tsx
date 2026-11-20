"use client";

import { useEffect, useRef, useState } from "react";

type Look = { id: number; name: string; note: string };

/**
 * "Pick a look": the same title card restyles itself as you scroll past, one look after another. Pinned on wider
 * screens; a simple swipe row on phones and for anyone who prefers reduced motion.
 */
export function ScrollLooks({ looks }: { looks: Look[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const ok = window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)");
    const set = () => setPinned(ok.matches);
    set();
    ok.addEventListener("change", set);
    return () => ok.removeEventListener("change", set);
  }, []);

  useEffect(() => {
    if (!pinned) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const el = root.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(0.999, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      setI(Math.floor(p * looks.length));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener("scroll", on, { passive: true });
    tick();
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, [pinned, looks.length]);

  if (!pinned) {
    return (
      <div className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
        {looks.map((l) => (
          <figure key={l.id} className="flex w-[80%] shrink-0 snap-start flex-col gap-3 rounded-[28px] bg-bg p-3 sm:w-[46%]">
            <img src={`/templates/t${l.id}.jpg`} alt={`${l.name} title card`} className="aspect-video w-full rounded-[20px] object-cover" />
            <figcaption className="px-2 pb-2 text-[15px]"><span className="font-semibold">{l.name}</span> <span className="text-ink-soft">· {l.note}</span></figcaption>
          </figure>
        ))}
      </div>
    );
  }

  return (
    <div ref={root} style={{ height: `${looks.length * 55 + 45}vh` }} className="relative">
      <div className="sticky top-24 flex items-center gap-12">
        <ol className="flex w-[30%] flex-col gap-1">
          {looks.map((l, k) => (
            <li key={l.id} className={`border-l-2 py-2.5 pl-5 transition-colors duration-300 ${k === i ? "border-accent" : "border-line"}`}>
              <span className={`block text-xl font-semibold transition-colors duration-300 ${k === i ? "text-ink" : "text-muted"}`}>{l.name}</span>
              <span className={`block text-sm transition-colors duration-300 ${k === i ? "text-ink-soft" : "text-muted/70"}`}>{l.note}</span>
            </li>
          ))}
        </ol>
        <div className="relative aspect-video flex-1 overflow-hidden rounded-[28px] bg-line shadow-[0_20px_60px_rgba(43,32,28,0.16)]">
          {looks.map((l, k) => (
            <img key={l.id} src={`/templates/t${l.id}.jpg`} alt={k === i ? `${l.name} title card` : ""} aria-hidden={k !== i}
              className="absolute inset-0 h-full w-full object-cover transition-all duration-500"
              style={{ opacity: k === i ? 1 : 0, transform: k === i ? "scale(1)" : "scale(1.03)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
