"use client";

import { useState } from "react";
import type { Shot } from "@/lib/types";

/** Start & end frame: choose where this shot's camera ends up, either another photo from the listing or a new upload. */
export function EndFramePicker({ shot, shots, thumbs, review, onPick, onUpload }: {
  shot: Shot;
  shots: Shot[];
  thumbs: Record<string, string>;
  review: boolean;
  onPick: (path: string | null) => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const i = shots.findIndex((s) => s.id === shot.id);
  const next = shots[i + 1];
  const end = shot.end_photo_path;
  const fromListing = shots.some((s) => s.photo_path === end);

  return (
    <div className="rounded-xl border border-line bg-bg p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Thumb src={thumbs[shot.photo_path]} label="Start" />
          <span aria-hidden className="text-lg text-muted">→</span>
          {end ? <Thumb src={thumbs[end]} label="End" /> : (
            <span className="grid aspect-video w-24 place-items-center rounded-md border-2 border-dashed border-line text-[11px] text-muted">
              Pick an end
            </span>
          )}
        </div>
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-soft">
          The camera travels from this photo to the end frame in one continuous move. Picking the next photo in your
          video makes the walkthrough flow from room to room.{review && " Changing it remakes this clip."}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {next && (
          <button type="button" onClick={() => onPick(next.photo_path)}
            className={`btn-ghost py-1.5 text-xs ${end === next.photo_path ? "border-ink" : ""}`}>
            {end === next.photo_path ? "✓ " : ""}Use the next photo (#{i + 2})
          </button>
        )}
        <label className={`btn-ghost cursor-pointer py-1.5 text-xs ${busy ? "opacity-60" : ""}`}>
          {busy ? "Uploading…" : end && !fromListing ? "✓ Uploaded · replace" : "Upload an end frame"}
          <input type="file" accept="image/*,.heic,.heif" className="hidden" disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              try { await onUpload(f); } finally { setBusy(false); }
            }} />
        </label>
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Or pick any photo from this listing</p>
      <ul className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
        {shots.filter((s) => s.id !== shot.id).map((s) => {
          const on = end === s.photo_path;
          return (
            <li key={s.id} className="shrink-0">
              <button type="button" aria-pressed={on} onClick={() => onPick(s.photo_path)}
                className={`relative block w-20 overflow-hidden rounded-md border-2 ${on ? "border-ink" : "border-transparent hover:border-line"}`}>
                <span className="block aspect-video bg-line">
                  {thumbs[s.photo_path] && <img src={thumbs[s.photo_path]} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">#{shots.indexOf(s) + 1}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Thumb({ src, label }: { src?: string; label: string }) {
  return (
    <span className="relative block w-24 overflow-hidden rounded-md bg-line">
      <span className="block aspect-video">{src && <img src={src} alt={`${label} frame`} className="h-full w-full object-cover" />}</span>
      <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">{label}</span>
    </span>
  );
}
