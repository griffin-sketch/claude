"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AppShell } from "@/components/AppShell";
import { BeforeAfter } from "@/components/Showcase";
import { api } from "@/lib/api";
import { fileExt, signedUrl, supabase } from "@/lib/supabase";
import { STAGE_ROOMS, STAGE_STYLES, STAGING_PRICE } from "@/lib/config";
import type { Listing, Shot, Staging } from "@/lib/types";

const BUSY = new Set(["queued", "processing"]);

function StagingStudio({ user }: { user: User }) {
  const sb = supabase();
  const [rows, setRows] = useState<Staging[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({}); // "photos:<path>" / "staged:<path>" -> signed URL
  const [style, setStyle] = useState("modern");
  const [room, setRoom] = useState("auto");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [planPhotos, setPlanPhotos] = useState<number | null>(null); // staged photos left in the plan; null = no plan
  const [uploading, setUploading] = useState(0);
  const [dropping, setDropping] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("paid") === "1"
      ? "Payment received. Unlocking your photos…"
      : "",
  );
  const [listings, setListings] = useState<Listing[]>([]);
  const [fromListing, setFromListing] = useState("");
  const [listingShots, setListingShots] = useState<Shot[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await sb.from("stagings").select("*").order("created_at", { ascending: false });
    if (error) return setError(error.message);
    setRows((data as Staging[]) ?? []);
    const { data: prof } = await sb.from("profiles").select("plan, plan_status, staging_credits").eq("id", user.id).single();
    const onPlan = !!prof && prof.plan !== "none" && ["active", "trialing"].includes(prof.plan_status ?? "");
    setPlanPhotos(onPlan ? prof.staging_credits ?? 0 : null);
  }, [sb, user.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    load();
    sb.from("listings").select("*").order("created_at", { ascending: false })
      .then(({ data }) => setListings((data as Listing[]) ?? []));
  }, [load, sb]);

  // keep checking while photos are being staged (or a payment is landing)
  const working = (rows ?? []).some((r) => BUSY.has(r.status)) || !!note;
  useEffect(() => {
    if (!working) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [working, load]);
  useEffect(() => {
    if (note && rows?.some((r) => r.paid)) setTimeout(() => setNote(""), 4000);
  }, [note, rows]);

  // signed links for every photo on screen (each one asked for once)
  const asked = useRef(new Set<string>());
  useEffect(() => {
    const need: [string, string][] = [];
    const want = (b: string, p: string) => {
      const k = `${b}:${p}`;
      if (!asked.current.has(k)) { asked.current.add(k); need.push([b, p]); }
    };
    for (const r of rows ?? []) {
      want("photos", r.source_path);
      if (r.preview_path) want("staged", r.preview_path);
    }
    for (const sh of listingShots) want("photos", sh.photo_path);
    if (!need.length) return;
    Promise.all(need.map(async ([b, p]) => [`${b}:${p}`, await signedUrl(b, p)] as const)).then((pairs) => {
      const got: Record<string, string> = {};
      for (const [k, u] of pairs) if (u) got[k] = u;
      setUrls((prev) => ({ ...got, ...prev }));
    });
  }, [rows, listingShots]);

  useEffect(() => {
    if (!fromListing) return;
    sb.from("shots").select("*").eq("listing_id", fromListing).order("position")
      .then(({ data }) => setListingShots((data as Shot[]) ?? []));
  }, [fromListing, sb]);

  async function addFiles(files: FileList) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)).slice(0, 20);
    setError("");
    setUploading(list.length);
    for (const f of list) {
      const path = `${user.id}/staging/${crypto.randomUUID()}.${fileExt(f.name)}`;
      const up = await sb.storage.from("photos").upload(path, f, { contentType: f.type || undefined });
      if (up.error) setError(`${f.name}: ${up.error.message}`);
      else {
        asked.current.add(`photos:${path}`);
        setUrls((prev) => ({ ...prev, [`photos:${path}`]: URL.createObjectURL(f) }));
        await add(path, null);
      }
      setUploading((n) => n - 1);
    }
    load();
  }

  async function add(source_path: string, listing_id: string | null) {
    const { error } = await sb.from("stagings").insert({ user_id: user.id, source_path, listing_id, room, style });
    if (error) setError(error.message);
  }

  async function restage(r: Staging, patch: Partial<Staging> = {}) {
    setRows((prev) => prev?.map((x) => (x.id === r.id ? { ...x, ...patch, status: "queued" } : x)) ?? null);
    const { error } = await sb.from("stagings").update({ ...patch, status: "queued" }).eq("id", r.id);
    if (error) setError(error.message);
  }

  async function removeRow(r: Staging) {
    setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? null);
    await sb.from("stagings").delete().eq("id", r.id);
  }

  async function unlock() {
    setBusy("unlock");
    setError("");
    try {
      const res = await api<{ url?: string; comp?: boolean; included?: number }>("/api/staging", { action: "checkout", ids: [...picked] });
      if (res.url) window.location.href = res.url;
      else {
        if (res.comp) setNote("Unlocked free because this is an admin account. Use a different email to test the real checkout.");
        else if (res.included) setNote(`Unlocked ${res.included} photo${res.included === 1 ? "" : "s"} with your plan.`);
        setPicked(new Set());
        await load();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function download(r: Staging) {
    setBusy(r.id);
    try {
      const res = await api("/api/staging", { action: "download", id: r.id });
      if (res.url) window.location.href = res.url;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const pickable = (rows ?? []).filter((r) => r.status === "ready" && !r.paid);
  const covered = Math.min(picked.size, planPhotos ?? 0);
  const toPay = picked.size - covered;

  return (
    <div className="space-y-8 pb-24">
      <div>
        <p className="eyebrow">Virtual staging</p>
        <h1 className="font-display text-4xl">Furnish empty rooms in seconds</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Upload a photo of an empty room, pick a style and get a photoreal staged version. Previews are free;
          {planPhotos !== null
            ? <> your plan has <b>{planPhotos}</b> full-size photo{planPhotos === 1 ? "" : "s"} left, then ${STAGING_PRICE} each.</>
            : <> unlock the full-size photo for ${STAGING_PRICE} each, or get 10–40 a month <Link href="/billing" className="underline">with a plan</Link>.</>}
        </p>
      </div>

      {error && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {note && <p className="rounded-lg bg-gold-soft p-3 text-sm">{note}</p>}

      {/* ---------------- new photos */}
      <section className="card p-6">
        <h2 className="font-display text-2xl">1. Pick a style</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STAGE_STYLES.map((s) => (
            <button key={s.id} type="button" onClick={() => setStyle(s.id)}
              className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${
                style === s.id ? "border-gold bg-gold-soft" : "border-line hover:border-ink-soft"}`}>
              <span className="block text-sm font-semibold">{s.name}</span>
              <span className="block text-xs text-ink-soft">{s.blurb}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 max-w-xs">
          <label htmlFor="room" className="label">Room</label>
          <select id="room" className="input" value={room} onChange={(e) => setRoom(e.target.value)}>
            {STAGE_ROOMS.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <h2 className="mt-8 font-display text-2xl">2. Add photos of empty rooms</h2>
        <label
          onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => { e.preventDefault(); setDropping(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
            dropping ? "border-gold bg-gold-soft" : "border-line hover:border-ink-soft"}`}
        >
          <span className="text-3xl" aria-hidden>⇪</span>
          <span className="mt-2 font-semibold">{uploading ? `Uploading ${uploading}…` : "Drop photos here or tap to choose"}</span>
          <span className="mt-1 text-xs text-muted">
            Each one is staged as {STAGE_STYLES.find((s) => s.id === style)?.name} · {STAGE_ROOMS.find((r) => r.id === room)?.name}
          </span>
          <input type="file" accept="image/*,.heic,.heif" multiple className="hidden" disabled={!!uploading}
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        </label>

        {listings.length > 0 && (
          <div className="mt-5">
            <label htmlFor="from" className="label">Or use photos from one of your listings</label>
            <select id="from" className="input max-w-md" value={fromListing} onChange={(e) => setFromListing(e.target.value)}>
              <option value="">Choose a listing…</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>{l.address || "Untitled listing"}</option>
              ))}
            </select>
            {fromListing && (
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {listingShots.map((s) => {
                  const used = (rows ?? []).some((r) => r.source_path === s.photo_path && r.style === style && r.room === room);
                  return (
                    <li key={s.id}>
                      <button type="button" disabled={used}
                        onClick={async () => { await add(s.photo_path, fromListing); load(); }}
                        className="group relative block aspect-video w-full overflow-hidden rounded-md bg-line disabled:opacity-50">
                        {urls[`photos:${s.photo_path}`] && <img src={urls[`photos:${s.photo_path}`]} alt="" className="h-full w-full object-cover" />}
                        <span className="absolute inset-0 grid place-items-center bg-black/0 text-xs font-semibold text-white opacity-0 transition group-hover:bg-black/50 group-hover:opacity-100">
                          {used ? "Added" : "+ Stage this"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ---------------- results */}
      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl">Your staged photos</h2>
          {pickable.length > 1 && (
            <button type="button" className="text-sm font-semibold text-gold-deep underline"
              onClick={() => setPicked(picked.size === pickable.length ? new Set() : new Set(pickable.map((r) => r.id)))}>
              {picked.size === pickable.length ? "Clear selection" : "Select all"}
            </button>
          )}
        </div>
        {rows === null ? (
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
            Nothing yet. Add a photo above and your staged version shows up here in about 30 seconds.
          </div>
        ) : (
          <ul className="grid gap-6 md:grid-cols-2">
            {rows.map((r) => {
              const before = urls[`photos:${r.source_path}`];
              const after = r.preview_path ? urls[`staged:${r.preview_path}`] : "";
              return (
                <li key={r.id} className="card overflow-hidden p-3">
                  {r.status === "ready" && before && after ? (
                    <BeforeAfter before={before} after={after} beforeLabel="Before" afterLabel="Staged" alt="Room" />
                  ) : (
                    <div className="relative aspect-video overflow-hidden rounded-[14px] bg-line">
                      {before && <img src={before} alt="" className="h-full w-full object-cover opacity-70" />}
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">
                          {r.status === "failed" ? "Didn't work, try again" : "Staging… about 30 seconds"}
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select aria-label="Style" className="input w-auto py-1.5 text-sm" value={r.style} disabled={r.paid || BUSY.has(r.status)}
                      onChange={(e) => restage(r, { style: e.target.value })}>
                      {STAGE_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select aria-label="Room" className="input w-auto py-1.5 text-sm" value={r.room} disabled={r.paid || BUSY.has(r.status)}
                      onChange={(e) => restage(r, { room: e.target.value })}>
                      {STAGE_ROOMS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <span className="flex-1" />
                    {!r.paid && !BUSY.has(r.status) && (
                      <button type="button" className="btn-ghost py-1.5" onClick={() => restage(r)}>Try another version</button>
                    )}
                    {!r.paid && (
                      <button type="button" aria-label="Delete" className="btn-ghost px-3 py-1.5" onClick={() => removeRow(r)}>✕</button>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                    {r.paid ? (
                      <>
                        <span className="text-sm text-ink-soft">Unlocked · full size, no watermark</span>
                        <button type="button" className="btn-primary py-1.5" disabled={busy === r.id} onClick={() => download(r)}>
                          {busy === r.id ? "…" : "Download"}
                        </button>
                      </>
                    ) : r.status === "ready" ? (
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={picked.has(r.id)}
                          onChange={(e) => {
                            const next = new Set(picked);
                            if (e.target.checked) next.add(r.id); else next.delete(r.id);
                            setPicked(next);
                          }} />
                        Unlock this photo{planPhotos ? " · included" : ` · $${STAGING_PRICE}`}
                      </label>
                    ) : (
                      <span className="text-sm text-muted">{r.status === "failed" ? r.error : "Working on it…"}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-6 text-xs text-muted">
          Most MLSs require virtually staged photos to be labeled as virtually staged, and an unstaged version may need to be included. Check your MLS rules.
        </p>
      </section>

      {/* ---------------- checkout bar */}
      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <span className="text-sm">
              <b>{picked.size}</b> photo{picked.size === 1 ? "" : "s"} selected ·{" "}
              {covered > 0 && <>{covered} included in your plan{toPay > 0 ? " + " : ""}</>}
              {toPay > 0 && <b>${toPay * STAGING_PRICE}</b>}
            </span>
            <button type="button" className="btn-gold" disabled={busy === "unlock"} onClick={unlock}>
              {busy === "unlock" ? (toPay > 0 ? "Opening checkout…" : "Unlocking…") : "Unlock and download"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StagingPage() {
  return <AppShell>{(user) => <StagingStudio user={user} />}</AppShell>;
}
