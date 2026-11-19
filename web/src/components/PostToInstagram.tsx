"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type Video = { id: string; label: string; tall: boolean; play: string; download: string; name: string };

/**
 * Get a finished video onto Instagram in a few taps: Tourvo writes the caption, copies it, and hands the video to the
 * phone's share sheet, where the realtor picks Instagram and pastes the caption. On a computer: download, copy, and
 * open Instagram. (Instagram doesn't take a caption from the share sheet, so the copy step is what carries it over.)
 */
export function PostToInstagram({ listingId, videos }: { listingId: string; videos: Video[] }) {
  const [open, setOpen] = useState(false);
  const first = videos.find((v) => v.tall) ?? videos[0];
  const [pick, setPick] = useState(first?.id ?? "");
  const [caption, setCaption] = useState("");
  const [writing, setWriting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready">("idle");
  const [msg, setMsg] = useState("");
  const video = videos.find((v) => v.id === pick) ?? first;

  const phone = typeof navigator !== "undefined" && /iPhone|iPad|Android/i.test(navigator.userAgent);
  const canShare = () => {
    if (!phone) return false;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      return !!nav.canShare?.({ files: [new File([new Blob()], "v.mp4", { type: "video/mp4" })] });
    } catch {
      return false;
    }
  };

  async function write() {
    setWriting(true);
    setMsg("");
    try {
      const res = await api("/api/caption", { listingId });
      setCaption(String((res as unknown as { caption?: string }).caption ?? ""));
    } catch (e) {
      setMsg((e as Error).message);
    }
    setWriting(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(caption);
      return true;
    } catch {
      return false;
    }
  }

  async function share() {
    if (!video) return;
    if (state === "ready" && file) {
      try {
        await navigator.share({ files: [file] });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setMsg("Couldn't open sharing. Save the video, then post it from Instagram.");
      }
      return;
    }
    if (state === "loading") return;
    const copied = await copy();
    setState("loading");
    setMsg(copied ? "Caption copied." : "");
    try {
      const blob = await (await fetch(video.play)).blob();
      setFile(new File([blob], video.name, { type: "video/mp4" }));
      setState("ready");
      setMsg(`${copied ? "Caption copied. " : ""}Tap Share, choose Instagram, then paste the caption.`);
    } catch {
      setState("idle");
      setMsg("Couldn't get the video. Check your connection and try again.");
    }
  }

  async function desktop() {
    if (!video) return;
    const copied = await copy();
    const a = document.createElement("a");
    a.href = video.download;
    a.click();
    setMsg(`${copied ? "Caption copied and the" : "The"} video is downloading. In Instagram, tap + then Reel, pick the video and paste the caption.`);
    window.open("https://www.instagram.com/", "_blank", "noopener");
  }

  if (!videos.length) return null;
  if (!open) {
    return (
      <button type="button" className="btn-gold" onClick={() => { setOpen(true); if (!caption) write(); }}>
        Post to Instagram
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-line p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Post to Instagram</h3>
        <button type="button" className="text-sm text-muted underline underline-offset-4" onClick={() => setOpen(false)}>Close</button>
      </div>

      <label className="mt-4 block text-sm">
        <span className="font-semibold">Video</span>
        <select className="input mt-1.5" value={pick} onChange={(e) => { setPick(e.target.value); setFile(null); setState("idle"); }}>
          {videos.map((v) => (
            <option key={v.id} value={v.id}>{v.label} · {v.tall ? "tall, best for Reels" : "wide"}</option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm">
        <span className="flex items-center justify-between">
          <span className="font-semibold">Caption</span>
          <button type="button" className="text-xs text-muted underline underline-offset-4" disabled={writing} onClick={write}>
            {writing ? "Writing…" : "Write another"}
          </button>
        </span>
        <textarea className="input mt-1.5 min-h-44 font-[inherit]" value={writing && !caption ? "Writing your caption…" : caption}
          onChange={(e) => setCaption(e.target.value)} disabled={writing && !caption} />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canShare() ? (
          <button type="button" className="btn-gold min-h-12 px-6" disabled={!caption || state === "loading"} onClick={share}>
            {state === "loading" ? "Getting video…" : state === "ready" ? "Share" : "Copy caption & share"}
          </button>
        ) : (
          <button type="button" className="btn-gold px-5" disabled={!caption} onClick={desktop}>
            Copy caption & download
          </button>
        )}
        <button type="button" className="btn-ghost" disabled={!caption} onClick={async () => setMsg((await copy()) ? "Caption copied." : "Select the caption and copy it.")}>
          Copy caption only
        </button>
      </div>
      {msg && <p className="mt-3 text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
