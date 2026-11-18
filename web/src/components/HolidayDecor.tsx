"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Shot } from "@/lib/types";

/** "Decorate for the holidays": AI adds Christmas decor to the listing photos (the originals are kept). */
export function HolidayDecor({ listingId, shots, onChange }: { listingId: string; shots: Shot[]; onChange: () => void }) {
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const decorated = shots.filter((s) => s.original_photo_path).length;
  const left = shots.length - decorated;

  // pick up decorating that was already running (e.g. after a page reload)
  useEffect(() => {
    api<{ pending: number }>("/api/decorate", { listingId, check: true }).then((r) => setPending(r.pending)).catch(() => {});
  }, [listingId]);

  // while photos are being decorated, check every few seconds and refresh when they land
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      try {
        const r = await api<{ pending: number }>("/api/decorate", { listingId, check: true });
        if (r.pending !== pending) onChange();
        setPending(r.pending);
      } catch { /* try again next tick */ }
    }, 5000);
    return () => clearInterval(t);
  }, [pending, listingId, onChange]);

  async function start() {
    setBusy(true); setError("");
    try {
      const r = await api<{ started: number }>("/api/decorate", { listingId });
      setPending(r.started);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!shots.length) return null;
  return (
    <div className="mt-5 flex flex-col gap-2 rounded-2xl border border-line bg-gold-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <span className="font-semibold">Decorate for the holidays</span>
        <span className="block text-ink-soft">
          {pending
            ? `Decorating ${pending} photo${pending === 1 ? "" : "s"}… about a minute. You can keep working.`
            : decorated
              ? `${decorated} of ${shots.length} photos decorated. Check each one; tap Undo on any you don't like.`
              : "Adds tasteful Christmas decor to your photos: lights, a tree, wreaths. Pairs with the Holiday look."}
        </span>
        {error && <span className="block text-danger">{error}</span>}
      </div>
      {!pending && left > 0 && (
        <button type="button" className="btn-gold shrink-0 px-4 py-2" onClick={start} disabled={busy}>
          {busy ? "Starting…" : decorated ? `Decorate the other ${left}` : "Decorate my photos"}
        </button>
      )}
    </div>
  );
}

export async function undoDecor(listingId: string, shotId: string) {
  await api("/api/decorate", { listingId, undo: shotId });
}
