"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Crop } from "@/lib/types";

const ASPECT = 16 / 9; // the wide video frame

/** The widest 16:9 frame that fits a photo of this shape, centered. */
export function fullFrame(natW: number, natH: number): Crop {
  const photo = natW / natH;
  if (photo >= ASPECT) {
    const w = ASPECT / photo; // fraction of the photo's width
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = photo / ASPECT;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

/** A photo shown the way the video frames it: the chosen crop fills a 16:9 box. */
export function CroppedImg({ src, crop, alt = "", className = "" }: { src?: string; crop?: Crop | null; alt?: string; className?: string }) {
  if (!src) return null;
  if (!crop) return <img src={src} alt={alt} draggable={false} className={`h-full w-full object-cover ${className}`} />;
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={`absolute max-w-none ${className}`}
      style={{
        width: `${100 / crop.w}%`,
        height: `${100 / crop.h}%`,
        left: `${(-crop.x / crop.w) * 100}%`,
        top: `${(-crop.y / crop.h) * 100}%`,
      }}
    />
  );
}

/**
 * Full-screen crop tool: drag the frame to move it, use the slider (or pinch on a trackpad / scroll) to zoom.
 * The frame is always 16:9, the shape of the video, so what's inside it is exactly what the clip shows.
 */
export function CropEditor({
  src,
  crop,
  note,
  onCancel,
  onSave,
}: {
  src: string;
  crop: Crop | null | undefined;
  note?: string;
  onCancel: () => void;
  onSave: (crop: Crop | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    // a cached photo can finish loading before React attaches onLoad
    const i = img.current;
    if (i?.complete && i.naturalWidth) setNat({ w: i.naturalWidth, h: i.naturalHeight });
  }, [src]);
  const [frame, setFrame] = useState<Crop | null>(crop ?? null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const full = nat ? fullFrame(nat.w, nat.h) : null;
  const cur = frame ?? full;
  const zoom = full && cur ? full.w / cur.w : 1;

  const clamp = useCallback((c: Crop): Crop => {
    const x = Math.min(Math.max(0, c.x), 1 - c.w);
    const y = Math.min(Math.max(0, c.y), 1 - c.h);
    return { ...c, x, y };
  }, []);

  function setZoom(z: number) {
    if (!full || !cur) return;
    const w = full.w / z, h = full.h / z;
    const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2; // zoom around the frame's center
    setFrame(clamp({ x: cx - w / 2, y: cy - h / 2, w, h }));
  }

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCancel]);

  function onPointerDown(e: React.PointerEvent) {
    if (!cur) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: cur.x, y: cur.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const el = box.current;
    if (!d || !el || !cur) return;
    const r = el.getBoundingClientRect();
    setFrame(clamp({ ...cur, x: d.x + (e.clientX - d.px) / r.width, y: d.y + (e.clientY - d.py) / r.height }));
  }
  function onPointerUp() {
    drag.current = null;
  }
  function onWheel(e: React.WheelEvent) {
    if (!full) return;
    setZoom(Math.min(3, Math.max(1, zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06))));
  }

  const pct = (n: number) => `${n * 100}%`;
  const same = (a: Crop, b: Crop) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) < 0.002;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Crop photo">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 text-white">
        <div>
          <h2 className="font-display text-xl sm:text-2xl">Crop this photo</h2>
          <p className="text-sm text-white/70">Drag the frame to choose what the video shows. Zoom in to get closer.</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20">
          ✕
        </button>
      </div>

      <div className="mx-auto mt-4 flex w-full max-w-4xl flex-1 items-center justify-center overflow-hidden">
        <div ref={box} className="relative max-h-full touch-none select-none" onWheel={onWheel}>
          <img
            ref={img}
            src={src}
            alt=""
            draggable={false}
            className="block max-h-[62vh] w-auto max-w-full"
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {cur && (
            <>
              {/* dim everything outside the frame */}
              <div className="pointer-events-none absolute inset-0" style={{
                background: "rgba(0,0,0,.55)",
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${pct(cur.y)}, ${pct(cur.x)} ${pct(cur.y)}, ${pct(cur.x)} ${pct(cur.y + cur.h)}, ${pct(cur.x + cur.w)} ${pct(cur.y + cur.h)}, ${pct(cur.x + cur.w)} ${pct(cur.y)}, 0 ${pct(cur.y)})`,
              }} />
              <div
                className="absolute cursor-move rounded-sm border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
                style={{ left: pct(cur.x), top: pct(cur.y), width: pct(cur.w), height: pct(cur.h) }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {/* rule-of-thirds guides */}
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <span key={i} className="border border-white/25" />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mx-auto mt-4 w-full max-w-4xl space-y-3 text-white">
        <label className="flex items-center gap-3 text-sm">
          <span className="w-12 shrink-0 text-white/70">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-2 w-full accent-[var(--accent)]"
            disabled={!full}
          />
        </label>
        {note && <p className="text-xs text-white/70">{note}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="text-sm font-semibold text-white/80 underline-offset-4 hover:underline" onClick={() => setFrame(null)}>
            Reset to the whole photo
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn rounded-full bg-white/10 px-5 py-2.5 text-white hover:bg-white/20" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-gold px-5 py-2.5"
              disabled={!full}
              onClick={() => onSave(!cur || !full || same(cur, full) ? null : {
                x: +cur.x.toFixed(4), y: +cur.y.toFixed(4), w: +cur.w.toFixed(4), h: +cur.h.toFixed(4),
              })}
            >
              Save crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
