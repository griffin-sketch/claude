"use client";

import { useState } from "react";

/**
 * Download button that works on phones. On an iPhone a plain download lands in the Files app, where realtors
 * can't find it. Where the phone supports it, we hand the video to the share sheet instead: "Save Video" puts it
 * straight into Photos (AirDrop, Messages and Instagram work from there too). Computers get a normal download.
 *
 * Phones only allow the share sheet right after a tap, and fetching a big video takes a few seconds, so it's two
 * taps: the first gets the video ready, the second opens the share sheet.
 */
export function SaveVideo({ play, download, name }: { play: string; download: string; name: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ready">("idle");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");

  function canShareFiles() {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const phone = /iPhone|iPad|Android/i.test(navigator.userAgent);
    try {
      return phone && !!nav.canShare?.({ files: [new File([new Blob()], name, { type: "video/mp4" })] });
    } catch {
      return false;
    }
  }

  async function onTap(e: React.MouseEvent) {
    if (state === "idle" && !canShareFiles()) return;   // computers: the normal download link
    e.preventDefault();
    if (state === "ready" && file) {
      try {
        await navigator.share({ files: [file], title: name });
      } catch (err) {
        if ((err as Error).name !== "AbortError") window.location.href = download;
      }
      return;
    }
    if (state !== "idle") return;
    setState("loading"); setMsg("");
    try {
      const blob = await (await fetch(play)).blob();
      setFile(new File([blob], name, { type: "video/mp4" }));
      setState("ready");
      setMsg("Ready. Tap again, then choose Save Video.");
    } catch {
      setState("idle");
      window.location.href = download;
    }
  }

  return (
    <span className="flex flex-col items-end text-right">
      <a href={download} onClick={onTap} className={`whitespace-nowrap py-1.5 ${state === "ready" ? "btn-gold px-4" : "btn-ghost"}`}>
        {state === "loading" ? "Getting video…" : state === "ready" ? "Save to phone" : "Save video"}
      </a>
      {msg && <span className="mt-1 text-xs text-muted">{msg}</span>}
    </span>
  );
}
