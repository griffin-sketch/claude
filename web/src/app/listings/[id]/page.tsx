"use client";

import { use, useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { AppShell } from "@/components/AppShell";
import { PayPanel } from "@/components/PayPanel";
import { fileExt, signedUrl, supabase } from "@/lib/supabase";
import { EFFECTS, HOOKS, STAGE_ROOMS, STAGE_STYLES, MUSIC, MAX_PHOTOS, MIN_PHOTOS, ROOM_SUGGESTIONS, TEMPLATES, TRANSITIONS } from "@/lib/config";
import { STATUS_LABEL, type Effect, type Listing, type Render, type Shot } from "@/lib/types";
import { packPlan, walkthroughOrder } from "@/lib/pack";
import { describeMove } from "@/lib/camera";
import { CameraControl } from "@/components/CameraControl";
import { EffectPicker } from "@/components/EffectPicker";
import { EndFramePicker } from "@/components/EndFramePicker";

const ACTIVE = new Set(["queued", "generating", "rendering"]);
const REEL_ORDER = ["tour", "teaser", "just_listed", "price_reveal", "top_features", "build_up", "staged", "open_house"];
const REEL_LABEL: Record<string, string> = {
  tour: "Full walkthrough",
  teaser: "15-second teaser",
  just_listed: "Just Listed",
  price_reveal: "Guess the price",
  top_features: "Top features",
  build_up: "Built from the ground up",
  staged: "Virtually staged",
  open_house: "Open house",
};

type StepId = "photos" | "arrange" | "motion" | "style" | "details" | "checkout" | "clips" | "videos";
const STEPS: { id: StepId; name: string }[] = [
  { id: "photos", name: "Upload photos" },
  { id: "arrange", name: "Order & rooms" },
  { id: "motion", name: "Effects" },
  { id: "style", name: "Look & music" },
  { id: "details", name: "Home details" },
  { id: "checkout", name: "Review & pay" },
  { id: "clips", name: "Approve clips" },
  { id: "videos", name: "Your videos" },
];

function stepAllowed(st: StepId, status: Listing["status"], photos: number): boolean {
  if (status === "draft" || status === "failed") {
    if (st === "photos") return true;
    if (st === "clips" || st === "videos") return false;
    return photos >= MIN_PHOTOS;
  }
  if (status === "queued" || status === "generating") return st === "clips";
  if (status === "review") return ["arrange", "motion", "style", "details", "clips"].includes(st);
  return st === "videos"; // rendering, done
}

function defaultStep(l: Listing, photos: number): StepId {
  if (l.status === "draft" || l.status === "failed") {
    if (photos < MIN_PHOTOS) return "photos";
    try {
      const saved = localStorage.getItem(`tourvo-step-${l.id}`) as StepId | null;
      if (saved && stepAllowed(saved, l.status, photos)) return saved;
    } catch {}
    return "arrange";
  }
  if (l.status === "rendering" || l.status === "done") return "videos";
  return "clips";
}

function Editor({ id, user }: { id: string; user: User }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [renders, setRenders] = useState<Render[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [clips, setClips] = useState<Record<string, string>>({});
  const [videos, setVideos] = useState<Record<string, { play: string; download: string }>>({});
  const sortedRenders = useMemo(
    () =>
      [...renders].sort(
        (a, b) =>
          REEL_ORDER.indexOf(a.kind ?? "tour") - REEL_ORDER.indexOf(b.kind ?? "tour") ||
          (a.format === "16:9" ? -1 : 1) - (b.format === "16:9" ? -1 : 1),
      ),
    [renders],
  );
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sb = supabase();

  const load = useCallback(async () => {
    const [{ data: l, error: le }, { data: s }, { data: r }] = await Promise.all([
      sb.from("listings").select("*").eq("id", id).single(),
      sb.from("shots").select("*").eq("listing_id", id).order("position"),
      sb.from("renders").select("*").eq("listing_id", id).order("created_at", { ascending: false }),
    ]);
    if (le || !l) {
      setError("Listing not found.");
      return;
    }
    setListing(l as Listing);
    setShots((s as Shot[]) ?? []);
    setRenders((r as Render[]) ?? []);
  }, [id, sb]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    load();
  }, [load]);

  // Just back from Stripe Checkout: Stripe tells us about the payment a few seconds later.
  const [awaitingPayment, setAwaitingPayment] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("paid") === "1",
  );
  useEffect(() => {
    if (!awaitingPayment) return;
    if (listing && listing.status !== "draft" && listing.status !== "failed") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- payment landed
      setAwaitingPayment(false);
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    const t = setInterval(load, 3000);
    const stop = setTimeout(() => setAwaitingPayment(false), 60000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [awaitingPayment, listing, load]);

  // Poll while the worker is busy.
  useEffect(() => {
    if (!listing || !ACTIVE.has(listing.status)) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [listing, load]);

  // Signed URLs for photo thumbnails, clips and finished videos.
  useEffect(() => {
    const need = [...new Set(shots.flatMap((s) => [s.photo_path, s.end_photo_path ?? ""]))].filter((p) => p && !thumbs[p]);
    if (need.length) {
      sb.storage
        .from("photos")
        .createSignedUrls(need, 3600)
        .then(({ data }) => {
          if (!data) return;
          setThumbs((prev) => {
            const next = { ...prev };
            data.forEach((d) => d.path && d.signedUrl && (next[d.path] = d.signedUrl));
            return next;
          });
        });
    }
    const needClips = shots.filter((s) => s.clip_path && !clips[s.clip_path]).map((s) => s.clip_path!) ;
    if (needClips.length) {
      sb.storage
        .from("clips")
        .createSignedUrls(needClips, 3600)
        .then(({ data }) => {
          if (!data) return;
          setClips((prev) => {
            const next = { ...prev };
            data.forEach((d) => d.path && d.signedUrl && (next[d.path] = d.signedUrl));
            return next;
          });
        });
    }
  }, [shots, thumbs, clips, sb]);

  useEffect(() => {
    renders.forEach(async (r) => {
      if (videos[r.video_path]) return;
      const name = `${(listing?.address || "listing").replace(/[^a-z0-9]+/gi, "-")}-${r.format === "9:16" ? "vertical" : "16x9"}.mp4`;
      const [play, download] = await Promise.all([
        signedUrl("videos", r.video_path),
        signedUrl("videos", r.video_path, 3600, name),
      ]);
      if (play && download) setVideos((prev) => ({ ...prev, [r.video_path]: { play, download } }));
    });
  }, [renders, videos, listing?.address]);

  const editable = listing?.status === "draft" || listing?.status === "failed";
  const reorderable = editable || listing?.status === "review";
  const [dragOver, setDragOver] = useState<number | null>(null);
  const labelsEditable = editable || listing?.status === "review" || listing?.status === "done";
  const [dropping, setDropping] = useState(false);
  const [fxFor, setFxFor] = useState<string | null>(null); // the photo whose effects sheet is open
  useEffect(() => {
    if (!fxFor) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setFxFor(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fxFor]);

  // Which step is open. Follows the listing's status (paying moves you to clips, etc.); while a draft, the
  // last step you were on is remembered on this device.
  const [step, setStep] = useState<StepId>("photos");
  const [stepFor, setStepFor] = useState("");
  if (listing && stepFor !== `${listing.id}:${listing.status}`) {
    setStepFor(`${listing.id}:${listing.status}`);
    setStep(defaultStep(listing, shots.length));
  }
  function go(st: StepId) {
    setStep(st);
    try { localStorage.setItem(`tourvo-step-${id}`, st); } catch {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveListing(patch: Partial<Listing>) {
    if (!listing) return;
    setListing({ ...listing, ...patch });
    const { error } = await sb.from("listings").update(patch).eq("id", id);
    if (error) setError(error.message);
  }

  async function saveShot(shot: Shot, patch: Partial<Shot>) {
    setShots((prev) => prev.map((s) => (s.id === shot.id ? { ...s, ...patch } : s)));
    const { error } = await sb.from("shots").update(patch).eq("id", shot.id);
    if (error) setError(error.message);
  }

  async function addPhotos(files: FileList) {
    const room = MAX_PHOTOS - shots.length;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)).slice(0, room);
    if (!list.length) return;
    setUploading(list.length);
    let pos = shots.length ? Math.max(...shots.map((s) => s.position)) + 1 : 0;
    const added: Shot[] = [];
    for (const f of list) {
      const path = `${user.id}/${id}/${crypto.randomUUID()}.${fileExt(f.name)}`;
      const up = await sb.storage.from("photos").upload(path, f, { contentType: f.type || undefined });
      if (up.error) {
        setError(`${f.name}: ${up.error.message}`);
        setUploading((n) => n - 1);
        continue;
      }
      const { data, error } = await sb
        .from("shots")
        .insert({ listing_id: id, position: pos++, photo_path: path, label: shots.length + added.length === 0 ? "" : "" })
        .select("*")
        .single();
      if (error || !data) setError(error?.message ?? "Could not save photo.");
      else {
        added.push(data as Shot);
        setThumbs((prev) => ({ ...prev, [path]: URL.createObjectURL(f) }));
      }
      setUploading((n) => n - 1);
    }
    setShots((prev) => [...prev, ...added]);
  }

  // Save a new play order. Clips stay attached to their photo, so reordering never remakes anything.
  async function saveOrder(next: Shot[]) {
    const before = new Map(shots.map((s) => [s.id, s.position]));
    const renumbered = next.map((s, i) => ({ ...s, position: i }));
    setShots(renumbered);
    const changed = renumbered.filter((s) => before.get(s.id) !== s.position);
    const res = await Promise.all(changed.map((s) => sb.from("shots").update({ position: s.position }).eq("id", s.id)));
    const bad = res.find((r) => r.error);
    if (bad?.error) setError(bad.error.message);
  }

  function moveTo(from: number, to: number) {
    if (from === to || to < 0 || to >= shots.length) return;
    const next = [...shots];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    saveOrder(next);
  }

  async function remove(shot: Shot) {
    setShots((prev) => prev.filter((s) => s.id !== shot.id));
    await sb.from("shots").delete().eq("id", shot.id);
    await sb.storage.from("photos").remove([shot.photo_path]);
  }

  async function setStatus(status: Listing["status"]) {
    setBusy(true);
    setError("");
    const { error } = await sb.from("listings").update({ status }).eq("id", id);
    setBusy(false);
    if (error) setError(error.message);
    else load();
  }

  async function redo(shot: Shot) {
    await saveShot(shot, { clip_status: "redo", approved: false });
  }

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!listing) return m;
    if (!listing.address.trim()) m.push("the street address");
    if (shots.length < MIN_PHOTOS) m.push(`at least ${MIN_PHOTOS} photos`);
    if (!listing.formats.length) m.push("a video format");
    return m;
  }, [listing, shots.length]);

  if (error && !listing) return <p className="text-sm text-danger">{error}</p>;
  if (!listing) return <p className="text-sm text-ink-soft">Loading…</p>;

  const readyCount = shots.filter((s) => s.clip_status === "ready").length;
  const plan = packPlan(listing, shots);
  const startAt = shots.reduce<number[]>((acc, s, i) => {
    const prev = i ? acc[i - 1] + (shots[i - 1].effect && ["build", "staging", "dusk"].includes(shots[i - 1].effect) ? 5 : 4.6) - 0.6 : 0;
    return [...acc, prev];
  }, []);
  const stillWorking = shots.some((s) => ["queued", "generating", "redo"].includes(s.clip_status));

  const status = listing.status;
  const ok = (st: StepId) => stepAllowed(st, status, shots.length);
  const idx = STEPS.findIndex((x) => x.id === step);
  const prevStep = STEPS.slice(0, idx).reverse().find((x) => ok(x.id));
  const nextStep = STEPS.slice(idx + 1).find((x) => ok(x.id));
  const nextBlocked =
    (step === "photos" && shots.length < MIN_PHOTOS) ||
    (step === "details" && (!listing.address.trim() || !listing.formats.length));
  const nextHint =
    step === "photos" && shots.length < MIN_PHOTOS
      ? `Add at least ${MIN_PHOTOS} photos to continue.`
      : step === "details" && !listing.address.trim()
        ? "Add the street address to continue."
        : step === "details" && !listing.formats.length
          ? "Pick at least one format to continue."
          : "";

  const fxIndex = shots.findIndex((x) => x.id === fxFor);
  const fxShot = fxIndex >= 0 ? shots[fxIndex] : null;

  const thumb = (sh: Shot, i: number, playClip: boolean) => (
    <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-line sm:w-56">
      {playClip && sh.clip_path && clips[sh.clip_path] ? (
        <video src={clips[sh.clip_path]} muted loop autoPlay playsInline className="h-full w-full object-cover" />
      ) : thumbs[sh.photo_path] ? (
        <img src={thumbs[sh.photo_path]} alt="" className="h-full w-full object-cover" />
      ) : null}
      <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">
        #{i + 1} · {fmtTime(startAt[i] ?? 0)}
      </span>
      {playClip && <ClipBadge status={sh.clip_status} />}
      {(sh.move || "auto") !== "auto" && (
        <span title={`Camera: ${describeMove(sh.move).text}`}
          className="absolute bottom-2 left-2 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-base text-white">
          {describeMove(sh.move).icon}
        </span>
      )}
    </div>
  );

  const motionControls = (sh: Shot, i: number, inline = false) => (
    <>
      <EffectPicker
        inline={inline}
        value={(sh.effect ?? "none") as Effect}
        review={status === "review"}
        onPick={(effect) => saveShot(sh, status === "review" ? { effect, clip_status: "redo" } : { effect })}
      />
      {sh.effect === "frames" && (
        <EndFramePicker
          shot={sh}
          shots={shots}
          thumbs={thumbs}
          review={status === "review"}
          onPick={(end_photo_path) =>
            saveShot(sh, status === "review" ? { end_photo_path, clip_status: "redo" } : { end_photo_path })}
          onUpload={async (f) => {
            const path = `${user.id}/${id}/end-${crypto.randomUUID()}.${fileExt(f.name)}`;
            const up = await sb.storage.from("photos").upload(path, f, { contentType: f.type || undefined });
            if (up.error) return setError(up.error.message);
            setThumbs((prev) => ({ ...prev, [path]: URL.createObjectURL(f) }));
            await saveShot(sh, status === "review" ? { end_photo_path: path, clip_status: "redo" } : { end_photo_path: path });
          }}
        />
      )}
      {sh.effect === "staging" && (
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          <label>
            <span className="label">Furniture style</span>
            <select className="input py-2" value={sh.stage_style ?? "modern"}
              onChange={(e) => saveShot(sh, status === "review" ? { stage_style: e.target.value, clip_status: "redo" } : { stage_style: e.target.value })}>
              {STAGE_STYLES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Room</span>
            <select className="input py-2" value={sh.stage_room ?? "auto"}
              onChange={(e) => saveShot(sh, status === "review" ? { stage_room: e.target.value, clip_status: "redo" } : { stage_room: e.target.value })}>
              {STAGE_ROOMS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        </div>
      )}
      <CameraControl
        shot={sh}
        photo={thumbs[sh.photo_path]}
        disabled={sh.effect === "reveal"}
        review={status === "review"}
        onSave={(move) => saveShot(sh, status === "review" ? { move, clip_status: "redo" } : { move })}
      />
    </>
  );

  const packSection = shots.length >= 3 && (
    <section className="card p-6">
      <h2 className="font-display text-2xl">The videos you&apos;ll get</h2>
      <p className="mb-5 mt-1 text-sm text-ink-soft">
        {plan.length} videos from one listing, each with its own style, ready to post. The numbers match your photo order.
      </p>
      <ol className="space-y-4">
        {plan.map((pl) => (
          <li key={pl.kind + pl.format} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-semibold">{pl.name}</span>
              <span className="text-xs text-muted">
                {pl.format === "9:16" ? "Tall" : "Wide"} · about {pl.seconds} seconds
              </span>
            </div>
            <p className="mt-0.5 text-sm text-ink-soft">{pl.style}</p>
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
              {pl.shots.map((sh, k) => (
                <div key={sh.id + k} className="relative w-20 shrink-0 sm:w-24">
                  <div className={`overflow-hidden rounded-md bg-line ${pl.format === "9:16" ? "aspect-[9/16]" : "aspect-video"}`}>
                    {thumbs[sh.photo_path] && <img src={thumbs[sh.photo_path]} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">
                    #{shots.indexOf(sh) + 1}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-ink-soft">
                    {k === 0 ? "Opening" : sh.label || "Photo"}
                  </span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-sm text-ink-soft hover:text-ink">
            ← All listings
          </Link>
          <h1 className="font-display text-4xl">{listing.address || "New listing video"}</h1>
        </div>
        <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold">{STATUS_LABEL[status]}</span>
      </div>

      {/* ---------------- step bar */}
      <nav aria-label="Steps" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <ol className="flex min-w-max gap-1 sm:min-w-0">
          {STEPS.map((st, k) => {
            const allowed = ok(st.id);
            const current = st.id === step;
            const done = k < idx;
            return (
              <li key={st.id} className="flex-1">
                <button
                  type="button"
                  disabled={!allowed || current}
                  onClick={() => go(st.id)}
                  className={`group flex w-full flex-col items-start gap-1.5 rounded-lg px-1 py-1 text-left ${allowed && !current ? "hover:bg-line/50" : ""}`}
                >
                  <span className={`h-1 w-full rounded-full ${current || done ? "bg-gold" : "bg-line"}`} />
                  <span className={`flex items-center gap-1.5 whitespace-nowrap text-xs ${
                    current ? "font-semibold text-ink" : allowed ? "text-ink-soft" : "text-muted/70"}`}>
                    <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
                      current ? "bg-ink text-white" : done ? "bg-gold text-white" : "bg-line text-ink-soft"}`}>
                      {done ? "✓" : k + 1}
                    </span>
                    {st.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {error && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {awaitingPayment && (status === "draft" || status === "failed") && (
        <p className="rounded-lg bg-gold-soft p-3 text-sm">Payment received. Starting your clips…</p>
      )}
      {status === "failed" && listing.error && (
        <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">Something went wrong: {listing.error}</p>
      )}

      {/* ---------------- 1. photos */}
      {step === "photos" && (
        <section className="card p-6">
          <h2 className="font-display text-2xl">Upload your listing photos</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Add {MIN_PHOTOS} to {MAX_PHOTOS} photos. Use the MLS photos, landscape is best. You&apos;ll put them in order next.
          </p>
          {editable && shots.length < MAX_PHOTOS && (
            <label
              onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
              onDragLeave={() => setDropping(false)}
              onDrop={(e) => { e.preventDefault(); setDropping(false); if (e.dataTransfer.files.length) addPhotos(e.dataTransfer.files); }}
              className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
                dropping ? "border-gold bg-gold-soft" : "border-line hover:border-ink-soft"}`}
            >
              <span className="text-3xl" aria-hidden>⇪</span>
              <span className="mt-2 font-semibold">{uploading ? `Uploading ${uploading}…` : "Drop photos here or tap to choose"}</span>
              <span className="mt-1 text-xs text-muted">JPG, PNG or HEIC · {shots.length} of {MAX_PHOTOS} added</span>
              <input
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                className="hidden"
                disabled={!!uploading}
                onChange={(e) => {
                  if (e.target.files) addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {shots.length > 0 && (
            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {shots.map((sh) => (
                <li key={sh.id} className="relative aspect-video overflow-hidden rounded-lg bg-line">
                  {thumbs[sh.photo_path] && <img src={thumbs[sh.photo_path]} alt="" className="h-full w-full object-cover" />}
                  {editable && (
                    <button type="button" aria-label="Remove photo" onClick={() => remove(sh)}
                      className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-sm text-white hover:bg-black">
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------------- 2. arrange */}
      {step === "arrange" && (
        <section className="card p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-xl">
              <h2 className="font-display text-2xl">Put your photos in order</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Your video plays them in this order. Drag a photo to move it, then type the room name under each one.
              </p>
            </div>
            {reorderable && shots.length > 2 && (
              <button type="button" className="btn-ghost" onClick={() => saveOrder(walkthroughOrder(shots))}
                title="Front of the home first, then living areas, kitchen, bedrooms, baths and outdoor spaces">
                ✨ Auto-arrange
              </button>
            )}
          </div>
          <datalist id="rooms">
            {ROOM_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <ol className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {shots.map((sh, i) => (
              <li
                key={sh.id}
                id={`shot-${sh.id}`}
                draggable={reorderable}
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { if (reorderable) { e.preventDefault(); setDragOver(i); } }}
                onDragLeave={() => setDragOver((d) => (d === i ? null : d))}
                onDrop={(e) => { e.preventDefault(); setDragOver(null); moveTo(Number(e.dataTransfer.getData("text/plain")), i); }}
                className="group flex min-w-0 flex-col gap-2"
              >
                <div className={`relative aspect-[4/3] overflow-hidden rounded-xl bg-line ring-2 transition ${
                  dragOver === i ? "ring-ink" : "ring-transparent"} ${reorderable ? "cursor-grab active:cursor-grabbing" : ""}`}>
                  {thumbs[sh.photo_path] && (
                    <img src={thumbs[sh.photo_path]} alt={sh.label || `Photo ${i + 1}`} draggable={false} className="h-full w-full object-cover" />
                  )}
                  <span className="absolute left-2 top-2 grid h-7 min-w-7 place-items-center rounded-full bg-white px-2 text-sm font-bold text-ink shadow">
                    {i + 1}
                  </span>
                  {editable && (
                    <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => remove(sh)}
                      className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-xs text-white opacity-100 transition hover:bg-black sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">
                      ✕
                    </button>
                  )}
                  {reorderable && (
                    <span className="absolute bottom-2 right-2 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                      <button type="button" aria-label={`Move photo ${i + 1} earlier`} disabled={i === 0} onClick={() => moveTo(i, i - 1)}
                        className="grid h-8 w-8 place-items-center rounded-full bg-white text-ink shadow disabled:opacity-40">‹</button>
                      <button type="button" aria-label={`Move photo ${i + 1} later`} disabled={i === shots.length - 1} onClick={() => moveTo(i, i + 1)}
                        className="grid h-8 w-8 place-items-center rounded-full bg-white text-ink shadow disabled:opacity-40">›</button>
                    </span>
                  )}
                </div>
                {i === 0 ? (
                  <p className="px-1 text-xs leading-snug text-ink-soft">
                    <span className="font-semibold text-ink">Opening shot.</span> The address shows here, so no room name needed.
                  </p>
                ) : (
                  <RoomName shot={sh} disabled={!labelsEditable} onSave={(patch) => saveShot(sh, patch)} />
                )}
              </li>
            ))}
          </ol>
          {status === "review" && <p className="mt-5 text-xs text-muted">Changing the order is free; your clips stay as they are.</p>}
        </section>
      )}

      {/* ---------------- 3. motion */}
      {step === "motion" && (
        <section className="card p-6">
          <div className="mb-5 max-w-xl">
            <h2 className="font-display text-2xl">Add effects (optional)</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Every photo already gets a smooth camera move, so you can skip this. Want something extra, like staging an
              empty room or turning the sky to sunset? Tap that photo.
            </p>
          </div>
          <ol className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {shots.map((sh, i) => {
              const fx = EFFECTS.find((x) => x.id === (sh.effect ?? "none"));
              const has = (sh.effect ?? "none") !== "none";
              return (
                <li key={sh.id} className="flex min-w-0 flex-col gap-2">
                  <button type="button" onClick={() => setFxFor(sh.id)} aria-label={`Effects for photo ${i + 1}`}
                    className={`group relative block aspect-[4/3] overflow-hidden rounded-xl bg-line ring-2 transition ${
                      has ? "ring-ink" : "ring-transparent hover:ring-line"}`}>
                    {thumbs[sh.photo_path] && (
                      <img src={thumbs[sh.photo_path]} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                    )}
                    <span className="absolute left-2 top-2 grid h-7 min-w-7 place-items-center rounded-full bg-white px-2 text-sm font-bold text-ink shadow">
                      {i + 1}
                    </span>
                    {has && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white shadow">
                        ✨ {fx?.name}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="truncate text-sm font-medium">{i === 0 ? "Opening shot" : sh.label || `Photo ${i + 1}`}</span>
                    <button type="button" onClick={() => setFxFor(sh.id)} className="shrink-0 text-xs font-semibold text-ink underline underline-offset-2">
                      {has ? "Change" : "Add effect"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* effect sheet for one photo */}
      {fxShot && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-3 sm:p-8" onClick={() => setFxFor(null)}>
          <div role="dialog" aria-modal="true" aria-label="Effects for this photo"
            className="card mx-auto max-w-4xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {thumbs[fxShot.photo_path] && (
                  <img src={thumbs[fxShot.photo_path]} alt="" className="aspect-[4/3] w-20 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted">Photo {fxIndex + 1}</p>
                  <h3 className="truncate font-display text-2xl">{fxIndex === 0 ? "Opening shot" : fxShot.label || `Photo ${fxIndex + 1}`}</h3>
                </div>
              </div>
              <button type="button" className="btn-primary" onClick={() => setFxFor(null)}>Done</button>
            </div>
            <p className="mb-3 text-sm text-ink-soft">Pick an effect for this photo. Each card plays an example.</p>
            <div className="grid gap-3 sm:grid-cols-2">{motionControls(fxShot, fxIndex, true)}</div>
          </div>
        </div>
      )}

      {/* ---------------- 4. style */}
      {step === "style" && (
        <section className="card p-6">
          <h2 className="font-display text-2xl">Pick a look and music</h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">Choose how the words on your video look. Any of them works; pick the one that feels like you.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" disabled={!labelsEditable} onClick={() => saveListing({ template: t.id })}
                className={`overflow-hidden rounded-xl border-2 text-left transition ${
                  listing.template === t.id ? "border-gold" : "border-transparent hover:border-line"}`}>
                <img src={`/templates/t${t.id}.jpg`} alt="" className="aspect-video w-full object-cover" />
                <span className="block px-2 py-1.5 text-sm font-semibold">{t.name}</span>
                <span className="block px-2 pb-2 text-xs text-ink-soft">{t.blurb}</span>
              </button>
            ))}
          </div>
          <MusicPicker listing={listing} user={user} disabled={!labelsEditable} onSave={saveListing} />
          <MoreOptions>
            <span className="label">How the video moves between rooms</span>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {TRANSITIONS.map((t) => (
                <button key={t.id} type="button" disabled={!labelsEditable} onClick={() => saveListing({ transition: t.id })}
                  className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${
                    (listing.transition ?? "crossfade") === t.id ? "border-gold bg-gold-soft" : "border-line hover:border-ink-soft"}`}>
                  <span className="block text-sm font-semibold">{t.name}</span>
                  <span className="block text-xs text-ink-soft">{t.blurb}</span>
                </button>
              ))}
            </div>
          </MoreOptions>
        </section>
      )}

      {/* ---------------- 5. details */}
      {step === "details" && (
        <section className="card p-6">
          <h2 className="font-display text-2xl">Tell us about the home</h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">This shows at the start of your video. Only the address is required.</p>
          <fieldset disabled={!labelsEditable} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Street address" value={listing.address} onSave={(v) => saveListing({ address: v })} placeholder="1234 Oak Hollow Dr" />
            <Field label="City, state, ZIP" value={listing.city_line} onSave={(v) => saveListing({ city_line: v })} placeholder="Austin, TX 78704" />
            <Field label="Price (optional)" value={listing.price ?? ""} onSave={(v) => saveListing({ price: v || null })} placeholder="$875,000" />
            <Field label="Beds" type="number" value={listing.beds?.toString() ?? ""} onSave={(v) => saveListing({ beds: v ? Number(v) : null })} />
            <Field label="Baths" type="number" value={listing.baths?.toString() ?? ""} onSave={(v) => saveListing({ baths: v ? Number(v) : null })} />
            <Field label="Square feet" type="number" value={listing.sqft?.toString() ?? ""} onSave={(v) => saveListing({ sqft: v ? Number(v) : null })} />
          </fieldset>

          <div className="mt-6 max-w-xl">
            <label htmlFor="outro" className="label">What shows at the end of the video?</label>
            <select id="outro" className="input" disabled={!labelsEditable} value={listing.outro}
              onChange={(e) => saveListing({ outro: e.target.value as Listing["outro"] })}>
              <option value="branded">My name, photo, brokerage and phone</option>
              <option value="client">My client&apos;s info (I&apos;m a photographer)</option>
              <option value="simple">Just the address</option>
              <option value="none">Nothing</option>
            </select>
            {listing.outro === "branded" && (
              <p className="mt-1 text-xs text-ink-soft">Change your name, photo or logo anytime in <Link href="/settings" className="underline">Branding</Link>.</p>
            )}
          </div>
          {listing.outro === "client" && (
            <div className="mt-4"><ClientBranding listing={listing} user={user} disabled={!labelsEditable} onSave={saveListing} /></div>
          )}

          <MoreOptions>
            <fieldset disabled={!labelsEditable} className="grid gap-4 sm:grid-cols-2">
              <Field label="Small line above the address" value={listing.kicker} onSave={(v) => saveListing({ kicker: v || "NOW AVAILABLE" })}
                placeholder="NOW AVAILABLE" hint="For example JUST LISTED, OPEN HOUSE SAT, or the neighborhood name" />
              <Field label="Big headline" value={listing.headline} onSave={(v) => saveListing({ headline: v })}
                placeholder="Uses the address if left blank" />
              <Field label="Acres" type="number" value={listing.acres?.toString() ?? ""} onSave={(v) => saveListing({ acres: v ? Number(v) : null })} />
              <Field label="Open house date and time" value={listing.open_house ?? ""} onSave={(v) => saveListing({ open_house: v || null })}
                placeholder="Sat, Nov 8 · 1–4 PM" hint="We'll add an Open House Reel" />
            </fieldset>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <fieldset disabled={!labelsEditable}>
                <span className="label">Video shapes</span>
                {[
                  { v: "16:9", t: "Wide, for MLS, YouTube and your website" },
                  { v: "9:16", t: "Tall, for Instagram, TikTok and Facebook Reels" },
                ].map((f) => (
                  <label key={f.v} className="flex items-center gap-2 py-1 text-sm">
                    <input type="checkbox" checked={listing.formats.includes(f.v)}
                      onChange={(e) => saveListing({
                        formats: e.target.checked ? [...new Set([...listing.formats, f.v])] : listing.formats.filter((x) => x !== f.v),
                      })} />
                    {f.t}
                  </label>
                ))}
              </fieldset>
              <div>
                <label htmlFor="hook" className="label">First words of your short teaser video</label>
                <select id="hook" className="input" disabled={!labelsEditable} value={listing.hook ?? "inside"}
                  onChange={(e) => saveListing({ hook: e.target.value })}>
                  {HOOKS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.text
                        .replace("{beds}", listing.beds ? String(listing.beds) : "#")
                        .replace("{city}", listing.city_line.split(",")[0].trim() || "your city")
                        .replace("{price}", listing.price || "$___")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </MoreOptions>
        </section>
      )}

      {/* ---------------- 6. checkout */}
      {step === "checkout" && (
        <>
          <section className="card p-6">
            <h2 className="font-display text-2xl">Look it over, then we&apos;ll make it</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {([
                ["Photos", `${shots.length} photos`, "arrange"],
                ["Effects", `${shots.filter((x) => x.effect && x.effect !== "none").length || "No"} special effects`, "motion"],
                ["Look", `${TEMPLATES.find((t) => t.id === listing.template)?.name ?? "—"} · ${
                  TRANSITIONS.find((t) => t.id === (listing.transition ?? "crossfade"))?.name ?? ""}`, "style"],
                ["Music", MUSIC.find((m) => m.id === (listing.music ?? "none"))?.name ?? (listing.music === "custom" ? "Your upload" : "None"), "style"],
                ["Address", [listing.address, listing.city_line].filter(Boolean).join(", ") || "—", "details"],
                ["Video shapes", listing.formats.map((f) => (f === "9:16" ? "Tall" : "Wide")).join(" + ") || "—", "details"],
              ] as [string, string, StepId][]).map(([k, v, st]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                  <dt className="text-ink-soft">{k}</dt>
                  <dd className="text-right">
                    {v}{" "}
                    <button type="button" className="ml-1 text-xs font-semibold text-gold-deep underline" onClick={() => go(st)}>Edit</button>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          {packSection}
          {editable && (
            <PayPanel user={user} listingId={id} missing={missing} clipCount={shots.length} paid={listing.paid} onStarted={load} />
          )}
        </>
      )}

      {/* ---------------- 7. clips */}
      {step === "clips" && (status === "queued" || status === "generating") && (
        <section className="card p-6">
          <h2 className="font-display text-2xl">Bringing your photos to life</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {readyCount} of {shots.length} clips done. This usually takes 5 to 10 minutes. You can leave this page; we&apos;ll keep going.
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-gold transition-all" style={{ width: `${(readyCount / Math.max(1, shots.length)) * 100}%` }} />
          </div>
        </section>
      )}
      {step === "clips" && status === "review" && (
        <>
          <section className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">Approve your clips</h2>
                <p className="text-sm text-ink-soft">
                  Each photo is now a short moving clip. Watch them, and if one looks off, tap Redo for a free new
                  version. Happy with them? Tap the button to make your videos.
                </p>
              </div>
              <button className="btn-gold" disabled={busy || stillWorking || readyCount === 0} onClick={() => setStatus("rendering")}>
                {stillWorking ? "Finishing your redos…" : "Make my videos →"}
              </button>
            </div>
            <ol className="mt-5 space-y-3">
              {shots.map((sh, i) => (
                <li key={sh.id} className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-start">
                  {thumb(sh, i, true)}
                  <div className="grid flex-1 gap-2 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-2 sm:col-span-2">
                      <p className="text-sm font-semibold">{i === 0 ? "Opening shot" : sh.label || `Photo ${i + 1}`}</p>
                      {sh.clip_status === "ready" && (
                        <button className="btn-ghost py-1.5" onClick={() => redo(sh)}>Redo</button>
                      )}
                    </div>
                    {motionControls(sh, i)}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {packSection}
        </>
      )}

      {/* ---------------- 8. videos */}
      {step === "videos" && status === "rendering" && (
        <section className="card p-6">
          <h2 className="font-display text-2xl">Building your videos</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Putting together your full video and short social clips. This takes about 10 minutes, and you can leave this page; we&apos;ll keep going.
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-gold" />
          </div>
        </section>
      )}
      {step === "videos" && status === "done" && (
        <section className="card p-6">
          <h2 className="font-display text-2xl">Your videos are ready</h2>
          <p className="mb-5 mt-1 text-sm text-ink-soft">
            {renders.length} videos from this listing: the full walkthrough plus short cuts made for Reels, TikTok and Shorts.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sortedRenders.map((r) => (
              <div key={r.id}>
                {videos[r.video_path] ? (
                  <video src={videos[r.video_path].play} controls playsInline
                    className={`w-full rounded-xl bg-black ${r.format === "9:16" ? "aspect-[9/16]" : "aspect-video"}`} />
                ) : (
                  <div className={`rounded-xl bg-line ${r.format === "9:16" ? "aspect-[9/16]" : "aspect-video"}`} />
                )}
                <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-semibold">{REEL_LABEL[r.kind ?? "tour"] ?? "Video"}</span>
                    <span className="block text-xs text-muted">{r.format === "9:16" ? "Tall · Instagram, TikTok" : "Wide · MLS, YouTube"}</span>
                  </span>
                  {videos[r.video_path] && (
                    <a href={videos[r.video_path].download} className="btn-ghost py-1.5">Download</a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ShareLink listing={listing} onSave={saveListing} />
            <button onClick={() => setStatus("review")} className="btn-ghost" disabled={busy}>
              Make changes
            </button>
          </div>
          <p className="mt-4 text-xs text-muted">
            Tip: in Instagram, turn on Settings → Media quality → &quot;Upload at highest quality&quot; so your Reels stay sharp.
          </p>
        </section>
      )}

      {/* ---------------- back / next */}
      {(prevStep || (nextStep && step !== "checkout")) && !(step === "clips" && status !== "review") && (
        <div className="sticky bottom-0 z-10 -mx-5 flex items-center justify-between gap-3 border-t border-line bg-bg/95 px-5 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          {prevStep ? (
            <button type="button" className="btn-ghost" onClick={() => go(prevStep.id)}>← {prevStep.name}</button>
          ) : <span />}
          {nextStep && step !== "checkout" && (
            <span className="flex items-center gap-3">
              {nextHint && <span className="hidden text-xs text-muted sm:inline">{nextHint}</span>}
              <button type="button" className="btn-primary" disabled={nextBlocked} onClick={() => go(nextStep.id)}>
                Next: {nextStep.name} →
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}


/** Room name under a photo, with an optional detail line that stays hidden until asked for. */
function RoomName({ shot, disabled, onSave }: { shot: Shot; disabled: boolean; onSave: (patch: Partial<Shot>) => void }) {
  const [showDetail, setShowDetail] = useState(!!shot.sub);
  return (
    <div className="flex flex-col gap-1.5">
      <ShotField disabled={disabled} list="rooms" placeholder="Room name" value={shot.label}
        onSave={(v) => onSave({ label: v })} />
      {showDetail ? (
        <ShotField disabled={disabled} placeholder="Detail, e.g. Quartz island" value={shot.sub}
          onSave={(v) => onSave({ sub: v })} />
      ) : (
        !disabled && (
          <button type="button" onClick={() => setShowDetail(true)} className="self-start px-1 text-xs font-medium text-ink-soft hover:text-ink">
            + Add detail
          </button>
        )
      )}
    </div>
  );
}

/** Extra settings most people never need, tucked away until asked for. */
function MoreOptions({ children }: { children: React.ReactNode }) {
  return (
    <details className="group mt-6 rounded-xl border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
        More options
        <span className="text-xs font-normal text-muted group-open:hidden">Optional · the defaults work great</span>
        <span aria-hidden className="text-muted transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}

function fmtTime(sec: number) {
  const t = Math.max(0, Math.round(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}


function ClipBadge({ status }: { status: Shot["clip_status"] }) {
  const map: Record<string, [string, string]> = {
    queued: ["In line", "bg-black/60 text-white"],
    generating: ["Making…", "bg-black/60 text-white"],
    redo: ["Redoing…", "bg-black/60 text-white"],
    ready: ["Ready", "bg-ok text-white"],
    failed: ["Failed", "bg-danger text-white"],
  };
  const m = map[status];
  if (!m) return null;
  return <span className={`absolute right-2 top-2 rounded px-1.5 py-0.5 text-xs font-semibold ${m[1]}`}>{m[0]}</span>;
}


/** Text input that saves on blur (and on Enter). */
/** Background music: a library track (with a preview), the customer's own MP3, or none. */
function MusicPicker({ listing, user, disabled, onSave }: {
  listing: Listing; user: User; disabled: boolean; onSave: (p: Partial<Listing>) => Promise<void> | void;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [audio] = useState(() => (typeof Audio !== "undefined" ? new Audio() : null));
  const [note, setNote] = useState("");
  useEffect(() => () => audio?.pause(), [audio]);
  function preview(id: string) {
    if (!audio) return;
    if (playing === id) { audio.pause(); setPlaying(null); return; }
    audio.src = `/music/${id}.mp3`;
    audio.currentTime = 0;
    audio.play().then(() => setPlaying(id)).catch(() => setNote("Preview not available yet."));
    audio.onended = () => setPlaying(null);
  }
  async function upload(file: File) {
    if (file.size > 25 * 1024 * 1024) return setNote("Please use an MP3 under 25 MB.");
    setNote("Uploading…");
    const path = `${user.id}/${listing.id}/music-${crypto.randomUUID()}.${fileExt(file.name) || "mp3"}`;
    const { error } = await supabase().storage.from("photos").upload(path, file, { upsert: true, contentType: file.type || "audio/mpeg" });
    if (error) return setNote(error.message);
    await onSave({ music: "custom", music_path: path });
    setNote(`Using "${file.name}".`);
  }
  const current = listing.music ?? "none";
  const choice = (id: string, name: string, mood: string, previewable: boolean) => (
    <div
      key={id}
      className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 ${current === id ? "border-gold bg-gold-soft" : "border-line"}`}
    >
      {previewable ? (
        <button type="button" onClick={() => preview(id)} aria-label={`${playing === id ? "Stop" : "Play"} ${name}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white">
          {playing === id ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="2" width="3.5" height="10" fill="currentColor" /><rect x="8.5" y="2" width="3.5" height="10" fill="currentColor" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>
          )}
        </button>
      ) : <span className="h-11 w-11 shrink-0" />}
      <button type="button" disabled={disabled} onClick={() => onSave({ music: id })} className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold">{name}</span>
        <span className="block text-xs text-ink-soft">{mood}</span>
      </button>
    </div>
  );
  return (
    <div className="mt-6">
      <span className="label">Music</span>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {choice("none", "No music", "Silent, add your own sound when you post", false)}
        {MUSIC.map((m) => choice(m.id, m.name, m.mood, true))}
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2.5 ${current === "custom" ? "border-gold bg-gold-soft" : "border-dashed border-line"}`}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-line text-lg text-ink" aria-hidden="true">+</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{current === "custom" ? "Your own track" : "Upload your own"}</span>
            <span className="block text-xs text-ink-soft">MP3 you have the rights to use</span>
          </span>
          <input type="file" accept="audio/mpeg,audio/mp3,audio/*" className="hidden" disabled={disabled}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
      {note && <p className="mt-2 text-xs text-ink-soft">{note}</p>}
    </div>
  );
}

/** A private link the realtor or photographer sends to a client: they watch and download, no account needed. */
function ShareLink({ listing, onSave }: { listing: Listing; onSave: (p: Partial<Listing>) => Promise<void> | void }) {
  const [copied, setCopied] = useState(false);
  const url = listing.share_token && typeof window !== "undefined" ? `${window.location.origin}/share/${listing.share_token}` : "";
  async function make() {
    const token = listing.share_token ?? crypto.randomUUID();
    if (!listing.share_token) await onSave({ share_token: token });
    const link = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked: the link is still shown */
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={make} className="btn-primary">
        {copied ? "Link copied" : listing.share_token ? "Copy client link" : "Share with client"}
      </button>
      {url && <span className="max-w-full truncate text-xs text-muted">{url}</span>}
    </div>
  );
}

/** Client agent's details for a photographer's deliverable. */
function ClientBranding({ listing, user, disabled, onSave }: {
  listing: Listing; user: User; disabled: boolean; onSave: (p: Partial<Listing>) => Promise<void> | void;
}) {
  const [note, setNote] = useState("");
  async function upload(kind: "logo" | "headshot", file: File) {
    const path = `${user.id}/client-${listing.id}-${kind}-${crypto.randomUUID()}.${fileExt(file.name)}`;
    const { error } = await supabase().storage.from("branding").upload(path, file, { upsert: true });
    if (error) return setNote(error.message);
    await onSave(kind === "logo" ? { client_logo_path: path } : { client_headshot_path: path });
    setNote(`${kind === "logo" ? "Logo" : "Headshot"} uploaded.`);
  }
  return (
    <fieldset disabled={disabled} className="grid gap-3 rounded-xl border border-line p-4 sm:col-span-2 sm:grid-cols-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Client branding</legend>
      <Field label="Agent name" value={listing.client_name ?? ""} onSave={(v) => onSave({ client_name: v || null })} placeholder="Julio Ayala" />
      <Field label="Brokerage" value={listing.client_brokerage ?? ""} onSave={(v) => onSave({ client_brokerage: v || null })} placeholder="MRG Realty" />
      <Field label="Phone" value={listing.client_phone ?? ""} onSave={(v) => onSave({ client_phone: v || null })} placeholder="(915) 555-0123" />
      {(["logo", "headshot"] as const).map((k) => (
        <label key={k} className="btn-ghost cursor-pointer">
          {(k === "logo" ? listing.client_logo_path : listing.client_headshot_path) ? `Replace ${k}` : `Upload ${k}`}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(k, e.target.files[0])} />
        </label>
      ))}
      {note && <p className="self-center text-xs text-ink-soft">{note}</p>}
    </fieldset>
  );
}

function Field(props: { label: string; value: string; onSave: (v: string) => void; placeholder?: string; type?: string; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">{props.label}</label>
      <ShotField id={id} type={props.type} value={props.value} placeholder={props.placeholder} onSave={props.onSave} />
      {props.hint && <p className="mt-1 text-xs text-ink-soft">{props.hint}</p>}
    </div>
  );
}

function ShotField(props: {
  id?: string;
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  type?: string;
  list?: string;
  disabled?: boolean;
}) {
  const [v, setV] = useState(props.value);
  const [seen, setSeen] = useState(props.value);
  if (props.value !== seen) {
    // the saved value changed elsewhere (e.g. a reload): show it
    setSeen(props.value);
    setV(props.value);
  }
  return (
    <input
      id={props.id}
      className="input"
      type={props.type ?? "text"}
      list={props.list}
      disabled={props.disabled}
      value={v}
      placeholder={props.placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== props.value && props.onSave(v.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export default function ListingPage({ params }: PageProps<"/listings/[id]">) {
  const { id } = use(params);
  return <AppShell>{(user) => <Editor id={id} user={user} />}</AppShell>;
}
