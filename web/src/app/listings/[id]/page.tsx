"use client";

import { use, useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { AppShell } from "@/components/AppShell";
import { PayPanel } from "@/components/PayPanel";
import { fileExt, signedUrl, supabase } from "@/lib/supabase";
import { MAX_PHOTOS, MIN_PHOTOS, ROOM_SUGGESTIONS, TEMPLATES, TRANSITIONS } from "@/lib/config";
import { STATUS_LABEL, type Listing, type Render, type Shot } from "@/lib/types";

const ACTIVE = new Set(["queued", "generating", "rendering"]);

function Editor({ id, user }: { id: string; user: User }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [renders, setRenders] = useState<Render[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [clips, setClips] = useState<Record<string, string>>({});
  const [videos, setVideos] = useState<Record<string, { play: string; download: string }>>({});
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
          <h2 className="mb-4 font-display text-2xl font-medium">Your videos</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {renders.map((r) => (
              <div key={r.id}>
                {videos[r.video_path] ? (
                  <video
                    src={videos[r.video_path].play}
                    controls
                    playsInline
                    className={`w-full rounded-lg bg-black ${r.format === "9:16" ? "mx-auto aspect-[9/16] max-h-[560px] w-auto" : "aspect-video"}`}
                  />
                ) : (
                  <div className="aspect-video rounded-lg bg-line" />
                )}
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="font-semibold">{r.format === "9:16" ? "Vertical · Reels, TikTok" : "16:9 · MLS, YouTube"}</span>
                  {videos[r.video_path] && (
                    <a href={videos[r.video_path].download} className="btn-ghost py-1.5">
                      Download
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setStatus("review")} className="btn-ghost mt-6" disabled={busy}>
            Change clips or labels
          </button>
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
          <p className="mt-1 text-sm text-ink-soft">Adding your template, labels and branding. About 3 to 6 minutes.</p>
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
              {stillWorking ? "Waiting on redos…" : "Make my video"}
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
              <option value="simple">Address only</option>
              <option value="none">No closing card</option>
            </select>
            {listing.outro === "branded" && (
              <p className="mt-1 text-xs text-ink-soft">
                Edit it in <Link href="/settings" className="underline">Branding</Link>.
              </p>
            )}
          </div>
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
