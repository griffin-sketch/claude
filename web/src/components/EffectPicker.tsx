"use client";

import { useState } from "react";
import { LoopVideo } from "@/components/Showcase";
import { EFFECTS } from "@/lib/config";
import type { Effect } from "@/lib/types";

// Example clip for each effect (in /public/fx). "none" shows a plain camera move.
const EXAMPLE: Record<string, string> = {
  none: "move", build: "build", staging: "staging", dusk: "dusk", water: "water", fire: "fire", reveal: "reveal", frames: "frames",
};

/** Pick a photo's AI effect by watching an example of each one. */
export function EffectPicker({ value, review, onPick }: { value: Effect; review: boolean; onPick: (fx: Effect) => void }) {
  const [open, setOpen] = useState(false);
  const cur = EFFECTS.find((fx) => fx.id === value) ?? EFFECTS[0];

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-2 text-left hover:border-ink-soft sm:col-span-2">
        <img src={`/fx/${EXAMPLE[cur.id]}.jpg`} alt="" className="aspect-video w-20 shrink-0 rounded-md object-cover" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{cur.id === "none" ? "No effect: camera move only" : cur.name}</span>
          <span className="block truncate text-xs text-ink-soft">{cur.blurb}</span>
        </span>
        <span className="shrink-0 pr-1 text-xs font-semibold text-gold-deep">See effects</span>
      </button>
    );

  return (
    <div className="rounded-xl border border-line bg-bg p-3 sm:col-span-2">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Pick an effect{review && <span className="font-normal text-ink-soft"> · changing it remakes this clip</span>}</span>
        <button type="button" className="text-xs font-semibold text-ink-soft hover:text-ink" onClick={() => setOpen(false)}>Close</button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {EFFECTS.map((fx) => {
          const on = fx.id === value;
          return (
            <button key={fx.id} type="button" aria-pressed={on}
              onClick={() => { if (!on) onPick(fx.id as Effect); setOpen(false); }}
              className={`overflow-hidden rounded-lg border-2 bg-surface text-left transition ${on ? "border-gold" : "border-transparent hover:border-line"}`}>
              <div className="relative">
                <LoopVideo src={`/fx/${EXAMPLE[fx.id]}.mp4`} poster={`/fx/${EXAMPLE[fx.id]}.jpg`} label={`${fx.name} example`}
                  className="aspect-video w-full object-cover" />
                {on && <span className="absolute right-1.5 top-1.5 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-white">Selected</span>}
              </div>
              <span className="block px-2 pt-1.5 text-sm font-semibold">{fx.id === "none" ? "Camera move only" : fx.name}</span>
              <span className="block px-2 pb-2 text-xs leading-snug text-ink-soft">{fx.blurb}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
