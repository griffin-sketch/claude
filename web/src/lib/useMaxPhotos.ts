"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MAX_PHOTOS } from "@/lib/config";

let known: number | null = null;   // remembered for the rest of the visit

/** How many photos this account can put on a listing. Asks the server (and retries), so the owner's bigger limit
 *  doesn't fall back to the normal one just because the first check happened before sign-in finished loading. */
export function useMaxPhotos() {
  const [max, setMax] = useState(known ?? MAX_PHOTOS);
  useEffect(() => {
    if (known) return;
    let stop = false;
    (async () => {
      for (let i = 0; i < 5 && !stop; i++) {
        try {
          const r = await api<{ maxPhotos: number }>("/api/limits");
          known = r.maxPhotos;
          if (!stop) setMax(r.maxPhotos);
          return;
        } catch {
          await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
        }
      }
    })();
    return () => { stop = true; };
  }, []);
  return max;
}
