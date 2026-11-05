"use client";

import { use, useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { AppShell } from "@/components/AppShell";
import { PayPanel } from "@/components/PayPanel";
import { fileExt, signedUrl, supabase } from "@/lib/supabase";
import { EFFECTS, HOOKS, MUSIC, MAX_PHOTOS, MIN_PHOTOS, ROOM_SUGGESTIONS, TEMPLATES, TRANSITIONS } from "@/lib/config";
import { STATUS_LABEL, type Effect, type Listing, type Render, type Shot } from "@/lib/types";

const ACTIVE = new Set(["queued", "generating", "rendering"]);
const REEL_ORDER = ["tour", "teaser", "just_listed", "price_reveal", "top_features", "open_house"];
const REEL_LABEL: Record<string, string> = {
  tour: "Full walkthrough",
  teaser: "15-second teaser",
  just_listed: "Just Listed",
  price_reveal: "Guess the price",
  top_features: "Top features",
  open_house: "Open house",
};

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
    const need = shots.filter((s) => !thumbs[s.photo_path]).map((s) => s.photo_path);
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
  const labelsEditable = editable || listing?.status === "review" || listing?.status === "done";

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

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= shots.length) return;
    const next = [...shots];
    [next[index], next[j]] = [next[j], next[index]];
    const renumbered = next.map((s, i) => ({ ...s, position: i }));
    setShots(renumbered);
    await Promise.all(
      [renumbered[index], renumbered[j]].map((s) => sb.from("shots").update({ position: s.position }).eq("id", s.id)),
    );
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
  const stillWorking = shots.some((s) => ["queued", "generating", "redo"].includes(s.clip_status));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-sm text-ink-soft hover:text-ink">
            ← All listings
          </Link>
          <h1 className="font-display text-4xl font-medium">{listing.address || "New listing video"}</h1>
        </div>
        <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold">{STATUS_LABEL[listing.status]}</span>
      </div>
      {error && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {awaitingPayment && (listing.status === "draft" || listing.status === "failed") && (
        <p className="rounded-lg bg-gold-soft p-3 text-sm">Payment received. Starting your clips…</p>
      )}
      {listing.status === "failed" && listing.error && (
        <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">Something went wrong: {listing.error}</p>
      )}

      {/* ---------------- finished videos */}
      {listing.status === "done" && (
        <section className="card p-6">
          <h2 className="font-display text-2xl font-medium">Your Reel pack</h2>
          <p className="mb-5 mt-1 text-sm text-ink-soft">
            {renders.length} videos from this listing: the full walkthrough plus short cuts made for Reels, TikTok and Shorts.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sortedRenders.map((r) => (
              <div key={r.id}>
                {videos[r.video_path] ? (
                  <video
                    src={videos[r.video_path].play}
                    controls
                    playsInline
                    className={`w-full rounded-xl bg-black ${r.format === "9:16" ? "aspect-[9/16]" : "aspect-video"}`}
                  />
                ) : (
                  <div className={`rounded-xl bg-line ${r.format === "9:16" ? "aspect-[9/16]" : "aspect-video"}`} />
                )}
                <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-semibold">{REEL_LABEL[r.kind ?? "tour"] ?? "Video"}</span>
                    <span className="block text-xs text-muted">{r.format === "9:16" ? "Vertical · Reels, TikTok" : "16:9 · MLS, YouTube"}</span>
                  </span>
                  {videos[r.video_path] && (
                    <a href={videos[r.video_path].download} className="btn-ghost py-1.5">
                      Download
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ShareLink listing={listing} onSave={saveListing} />
            <button onClick={() => setStatus("review")} className="btn-ghost" disabled={busy}>
              Change clips or labels
            </button>
          </div>
        </section>
      )}

      {/* ---------------- progress */}
      {(listing.status === "queued" || listing.status === "generating") && (
        <section className="card p-6">
          <h2 className="font-display text-2xl font-medium">Making your camera moves</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {readyCount} of {shots.length} clips done. This usually takes 5 to 10 minutes. You can leave this page.
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-gold transition-all" style={{ width: `${(readyCount / Math.max(1, shots.length)) * 100}%` }} />
          </div>
        </section>
      )}
      {listing.status === "rendering" && (
        <section className="card p-6">
          <h2 className="font-display text-2xl font-medium">Building your video</h2>
          <p className="mt-1 text-sm text-ink-soft">Cutting your Reel pack: the full walkthrough plus short versions for social. About 10 to 15 minutes.</p>
        </section>
      )}

      {/* ---------------- clip review */}
      {listing.status === "review" && (
        <section className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-medium">Review your clips</h2>
              <p className="text-sm text-ink-soft">
                Watch each one. If a room looks off, hit Redo and we&apos;ll make a new take.
              </p>
            </div>
            <button
              className="btn-gold"
              disabled={busy || stillWorking || readyCount === 0}
              onClick={() => setStatus("rendering")}
            >
              {stillWorking ? "Waiting on redos…" : "Make my Reel pack"}
            </button>
          </div>
        </section>
      )}

      {/* ---------------- details */}
      <section className="card p-6">
        <h2 className="mb-4 font-display text-2xl font-medium">1. Listing details</h2>
        <fieldset disabled={!labelsEditable} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Street address" value={listing.address} onSave={(v) => saveListing({ address: v })} placeholder="1234 Oak Hollow Dr" />
          <Field label="City, state, ZIP" value={listing.city_line} onSave={(v) => saveListing({ city_line: v })} placeholder="Austin, TX 78704" />
          <Field label="Price (optional)" value={listing.price ?? ""} onSave={(v) => saveListing({ price: v || null })} placeholder="$875,000" />
          <Field label="Beds" type="number" value={listing.beds?.toString() ?? ""} onSave={(v) => saveListing({ beds: v ? Number(v) : null })} />
          <Field label="Baths" type="number" value={listing.baths?.toString() ?? ""} onSave={(v) => saveListing({ baths: v ? Number(v) : null })} />
          <Field label="Square feet" type="number" value={listing.sqft?.toString() ?? ""} onSave={(v) => saveListing({ sqft: v ? Number(v) : null })} />
          <Field label="Top line" value={listing.kicker} onSave={(v) => saveListing({ kicker: v || "NOW AVAILABLE" })} placeholder="NOW AVAILABLE" hint="e.g. JUST LISTED, OPEN HOUSE SAT, or the community name" />
          <Field label="Headline (optional)" value={listing.headline} onSave={(v) => saveListing({ headline: v })} placeholder="Defaults to the address" />
          <Field label="Acres (optional)" type="number" value={listing.acres?.toString() ?? ""} onSave={(v) => saveListing({ acres: v ? Number(v) : null })} />
          <Field label="Open house (optional)" value={listing.open_house ?? ""} onSave={(v) => saveListing({ open_house: v || null })} placeholder="Sat, Nov 8 · 1–4 PM" hint="Adds an Open House reel to your pack" />
        </fieldset>
      </section>

      {/* ---------------- photos */}
      <section className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-medium">2. Photos, in video order</h2>
            <p className="text-sm text-ink-soft">
              {MIN_PHOTOS} to {MAX_PHOTOS} photos. Lead with the front of the home. Label each room; the label appears on screen.
            </p>
          </div>
          {editable && shots.length < MAX_PHOTOS && (
            <label className="btn-primary cursor-pointer">
              {uploading ? `Uploading ${uploading}…` : "+ Add photos"}
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
        </div>
        <datalist id="rooms">
          {ROOM_SUGGESTIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        {shots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
            No photos yet.
          </div>
        ) : (
          <ol className="space-y-3">
            {shots.map((s, i) => (
              <li key={s.id} className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center">
                <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-line sm:w-56">
                  {s.clip_path && clips[s.clip_path] && listing.status !== "draft" ? (
                    <video src={clips[s.clip_path]} muted loop autoPlay playsInline className="h-full w-full object-cover" />
                  ) : thumbs[s.photo_path] ? (
                    <img src={thumbs[s.photo_path]} alt="" className="h-full w-full object-cover" />
                  ) : null}
                  <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  {listing.status !== "draft" && <ClipBadge status={s.clip_status} />}
                </div>
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className="sr-only">Effect for photo {i + 1}</span>
                    <select
                      className="input py-2"
                      disabled={!(editable || listing.status === "review")}
                      value={s.effect ?? "none"}
                      onChange={(e) => {
                        const effect = e.target.value as Effect;
                        saveShot(s, listing.status === "review" ? { effect, clip_status: "redo" } : { effect });
                      }}
                    >
                      {EFFECTS.map((fx) => (
                        <option key={fx.id} value={fx.id}>
                          {fx.id === "none" ? "Effect: none (camera move)" : `Effect: ${fx.name}`}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs text-muted">
                      {EFFECTS.find((fx) => fx.id === (s.effect ?? "none"))?.blurb}
                      {listing.status === "review" && " Changing it remakes this clip."}
                    </span>
                  </label>
                  {i === 0 ? (
                    <p className="text-sm text-ink-soft sm:col-span-2">
                      Opening shot. Your title card shows over this one, so it has no label.
                    </p>
                  ) : (
                    <>
                      <ShotField
                        disabled={!labelsEditable}
                        list="rooms"
                        placeholder="Room label, e.g. Updated Kitchen"
                        value={s.label}
                        onSave={(v) => saveShot(s, { label: v })}
                      />
                      <ShotField
                        disabled={!labelsEditable}
                        placeholder="Detail (optional), e.g. Quartz island"
                        value={s.sub}
                        onSave={(v) => saveShot(s, { sub: v })}
                      />
                    </>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {editable && (
                    <>
                      <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</IconBtn>
                      <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === shots.length - 1}>↓</IconBtn>
                      <IconBtn label="Remove" onClick={() => remove(s)}>✕</IconBtn>
                    </>
                  )}
                  {listing.status === "review" && s.clip_status === "ready" && (
                    <button className="btn-ghost py-1.5" onClick={() => redo(s)}>
                      Redo
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ---------------- look */}
      <section className="card p-6">
        <h2 className="mb-4 font-display text-2xl font-medium">3. Pick a look</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!labelsEditable}
              onClick={() => saveListing({ template: t.id })}
              className={`overflow-hidden rounded-xl border-2 text-left transition ${
                listing.template === t.id ? "border-gold" : "border-transparent hover:border-line"
              }`}
            >
              <img src={`/templates/t${t.id}.jpg`} alt="" className="aspect-video w-full object-cover" />
              <span className="block px-2 py-1.5 text-sm font-semibold">{t.name}</span>
              <span className="block px-2 pb-2 text-xs text-ink-soft">{t.blurb}</span>
            </button>
          ))}
        </div>
        <div className="mt-6">
          <span className="label">Transitions between rooms</span>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TRANSITIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={!labelsEditable}
                onClick={() => saveListing({ transition: t.id })}
                className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${
                  (listing.transition ?? "crossfade") === t.id ? "border-gold bg-gold-soft" : "border-line hover:border-ink-soft"
                }`}
              >
                <span className="block text-sm font-semibold">{t.name}</span>
                <span className="block text-xs text-ink-soft">{t.blurb}</span>
              </button>
            ))}
          </div>
        </div>
        <MusicPicker listing={listing} user={user} disabled={!labelsEditable} onSave={saveListing} />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <fieldset disabled={!labelsEditable}>
            <span className="label">Formats</span>
            {[
              { v: "16:9", t: "16:9 · MLS, YouTube, website" },
              { v: "9:16", t: "9:16 · Reels, TikTok, Shorts" },
            ].map((f) => (
              <label key={f.v} className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={listing.formats.includes(f.v)}
                  onChange={(e) =>
                    saveListing({
                      formats: e.target.checked
                        ? [...new Set([...listing.formats, f.v])]
                        : listing.formats.filter((x) => x !== f.v),
                    })
                  }
                />
                {f.t}
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor="outro" className="label">Closing card</label>
            <select
              id="outro"
              className="input"
              disabled={!labelsEditable}
              value={listing.outro}
              onChange={(e) => saveListing({ outro: e.target.value as Listing["outro"] })}
            >
              <option value="branded">Your branding (name, brokerage, phone, headshot, logo)</option>
              <option value="client">Your client&apos;s branding (for photographers)</option>
              <option value="simple">Address only</option>
              <option value="none">No closing card (unbranded)</option>
            </select>
            {listing.outro === "branded" && (
              <p className="mt-1 text-xs text-ink-soft">
                Edit it in <Link href="/settings" className="underline">Branding</Link>.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="hook" className="label">Teaser opening line</label>
            <select
              id="hook"
              className="input"
              disabled={!labelsEditable}
              value={listing.hook ?? "inside"}
              onChange={(e) => saveListing({ hook: e.target.value })}
            >
              {HOOKS.map((h) => (
                <option key={h.id} value={h.id}>{h.text}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-soft">Shown at the start of the 15-second teaser Reel.</p>
          </div>
          {listing.outro === "client" && (
            <ClientBranding listing={listing} user={user} disabled={!labelsEditable} onSave={saveListing} />
          )}
        </div>
      </section>

      {/* ---------------- go */}
      {editable && (
        <PayPanel
          user={user}
          listingId={id}
          missing={missing}
          clipCount={shots.length}
          paid={listing.paid}
          onStarted={load}
        />
      )}
    </div>
  );
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

function IconBtn(props: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
      className="h-9 w-9 rounded-lg border border-line text-sm hover:border-gold disabled:opacity-30"
    >
      {props.children}
    </button>
  );
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
      <button onClick={make} className="btn-gold">
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
