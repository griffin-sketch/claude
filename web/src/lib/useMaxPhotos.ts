"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MAX_PHOTOS } from "@/lib/config";

type Limits = { maxPhotos: number; templates: number[] };
let known: Limits | null = null;   // remembered for the rest of the visit
let asking: Promise<Limits | null> | null = null;

/** Ask the server (and retry), so the owner's limits don't fall back to the normal ones just because the first
 *  check happened before sign-in finished loading. */
function ask(): Promise<Limits | null> {
  if (known) return Promise.resolve(known);
  asking ??= (async () => {
    for (let i = 0; i < 5; i++) {
      try {
        const r = await api<Limits>("/api/limits");
        known = { maxPhotos: r.maxPhotos, templates: r.templates ?? [] };
        return known;
      } catch {
        await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
      }
    }
    asking = null;
    return null;
  })();
  return asking;
}

function useLimits() {
  const [limits, setLimits] = useState<Limits | null>(known);
  useEffect(() => {
    let stop = false;
    ask().then((l) => { if (l && !stop) setLimits(l); });
    return () => { stop = true; };
  }, []);
  return limits;
}

/** How many photos this account can put on a listing. */
export function useMaxPhotos() {
  return useLimits()?.maxPhotos ?? MAX_PHOTOS;
}

/** Private (one realtor's brand) templates this account can use. */
export function usePrivateTemplates() {
  return useLimits()?.templates ?? [];
}
