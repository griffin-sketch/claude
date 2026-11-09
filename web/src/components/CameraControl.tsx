"use client";

import { useEffect, useRef, useState } from "react";
import { CAMERA_MOVES } from "@/lib/config";
import { AXES, camToMove, describeMove, parseCam, previewTransform, PRESET_CAM, ZERO, type Cam } from "@/lib/camera";
import type { Shot } from "@/lib/types";

/** Camera control: pick a move, or fine-tune it on six sliders with a live preview (like a camera operator). */
export function CameraControl({ shot, photo, disabled, review, onSave }: {
  shot: Shot; photo?: string; disabled: boolean; review: boolean; onSave: (move: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cam, setCam] = useState<Cam>(ZERO);
  const [preset, setPreset] = useState<string | null>("auto");
  const imgRef = useRef<HTMLImageElement>(null);
  const cur = describeMove(shot.move);

  useEffect(() => {
    const el = imgRef.current;
    if (!open || !el) return;
    const anim = el.animate(
      [{ transform: previewTransform(cam, 0) }, { transform: previewTransform(cam, 1) }],
      { duration: 3200, iterations: Infinity, easing: "ease-in-out" },
    );
    return () => anim.cancel();
  }, [open, cam]);

  function start() {
    const m = shot.move || "auto";
    setCam(parseCam(m));
    setPreset(m.startsWith("custom:") ? null : m);
    setOpen(true);
  }

  if (!open)
    return (
      <div className="sm:col-span-2">
        <button type="button" disabled={disabled} onClick={start}
          className="input flex items-center justify-between gap-2 py-2 text-left disabled:opacity-60">
          <span><span className="mr-2 inline-block w-4 text-center">{cur.icon}</span>Camera: {cur.text}</span>
          <span className="text-xs font-semibold text-gold-deep">{disabled ? "" : "Adjust"}</span>
        </button>
        {shot.effect === "reveal" && <span className="mt-1 block text-xs text-muted">Drone reveal sets its own camera move.</span>}
      </div>
    );

  return (
    <div className="rounded-xl border border-line bg-bg p-3 sm:col-span-2">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {CAMERA_MOVES.map((c) => (
          <button key={c.id} type="button" title={c.blurb}
            onClick={() => { setPreset(c.id); setCam({ ...ZERO, ...PRESET_CAM[c.id] }); }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
              preset === c.id ? "bg-ink text-white ring-ink" : "bg-surface text-ink-soft ring-line hover:text-ink"}`}>
            {c.icon} {c.name}
          </button>
        ))}
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${preset ? "text-muted ring-line" : "bg-ink text-white ring-ink"}`}>
          ⌖ Custom
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_1.1fr]">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-line">
          {photo && <img ref={imgRef} src={photo} alt="Camera preview" className="h-full w-full object-cover" />}
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Preview
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {AXES.map((a) => (
            <label key={a.id} className="block">
              <span className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-ink-soft">{a.name}</span>
                <span className="tabular-nums font-semibold">{cam[a.id].toFixed(1)}</span>
              </span>
              <input type="range" min={-10} max={10} step={0.1} value={cam[a.id]}
                aria-label={`${a.name}: ${a.neg} to ${a.pos}`}
                onDoubleClick={() => { setPreset(null); setCam({ ...cam, [a.id]: 0 }); }}
                onChange={(e) => { setPreset(null); setCam({ ...cam, [a.id]: Number(e.target.value) }); }}
                className="mt-1 w-full accent-[var(--champagne-deep)]" />
              <span className="flex justify-between text-[10px] text-muted"><span>{a.neg}</span><span>{a.pos}</span></span>
            </label>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">
          The AI follows this as closely as it can; strong values in several directions at once are less predictable.
          {review && " Applying remakes this clip."}
        </span>
        <span className="flex gap-2">
          <button type="button" className="btn-ghost py-1.5" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="btn-primary py-1.5"
            onClick={() => { onSave(preset ?? camToMove(cam)); setOpen(false); }}>
            Apply movement
          </button>
        </span>
      </div>
    </div>
  );
}

