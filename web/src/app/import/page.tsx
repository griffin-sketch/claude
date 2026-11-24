"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useMaxPhotos } from "@/lib/useMaxPhotos";
import { supabase } from "@/lib/supabase";
import { OWNER_MAX_PHOTOS } from "@/lib/config";
import { fullSize, readSent, type SentPage } from "@/lib/bookmarklet";

const KEY = "tourvo-sent-photos";
// a listing photo, not a logo or icon: long side at least 600px, short side at least 400px (some MLS photos are only 471x630)
const MIN_LONG = 600, MIN_SHORT = 400;

// Keep what the button sent, so it survives a trip through the sign-in page.
if (typeof window !== "undefined") {
  const sent = readSent(window.location.hash);
  if (sent) {
    try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), sent })); } catch { /* private mode */ }
    history.replaceState(null, "", window.location.pathname);
  }
}

function stored(): SentPage | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null") as { at: number; sent: SentPage } | null;
    return v && Date.now() - v.at < 6 * 3600_000 ? v.sent : null;
  } catch {
    return null;
  }
}

type Draft = { id: string; address: string; created_at: string; count: number };

function ImportView({ user }: { user: User }) {
  const router = useRouter();
  const [sent] = useState<SentPage | null>(() => (typeof window === "undefined" ? null : stored()));
  const [sizes, setSizes] = useState<Record<string, number>>({});   // url -> 1 once loaded and big enough, 0 = too small or failed
  const [choice, setChoice] = useState<string[] | null>(null);   // null = the first photos, picked for her
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // the owner's own account can use more photos (the server checks this too)
  const MAX_PHOTOS = useMaxPhotos();
  const [target, setTarget] = useState<string>("new");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // listings that can still take photos
  useEffect(() => {
    supabase()
      .from("listings")
      .select("id, address, created_at, status, shots(count)")
      .in("status", ["draft", "failed"])
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = ((data ?? []) as unknown as { id: string; address: string; created_at: string; shots: { count: number }[] }[])
          .map((r) => ({ id: r.id, address: r.address, created_at: r.created_at, count: r.shots?.[0]?.count ?? 0 }))
          .filter((r) => r.count < OWNER_MAX_PHOTOS);
        setDrafts(rows);
      });
  }, [user.id]);

  // real listing photos are big; icons, logos, agent headshots and map tiles are not
  const candidates = useMemo(() => fullSize(sent?.i ?? []), [sent]);
  const photos = useMemo(() => candidates.filter((u) => (sizes[u] ?? -1) >= 1), [candidates, sizes]);
  const [gaveUp, setGaveUp] = useState(false);
  // stop waiting on photos that never answer (a slow site, or a numbered photo that doesn't exist)
  useEffect(() => {
    const t = setTimeout(() => setGaveUp(true), 12000);
    return () => clearTimeout(t);
  }, [candidates]);
  const checking = !gaveUp && candidates.some((u) => sizes[u] === undefined);
  const room = MAX_PHOTOS - (drafts.find((d) => d.id === target)?.count ?? 0);

  const picked = (choice ?? photos).slice(0, Math.max(0, room));   // photos show up as they load
  const setPicked = (f: (p: string[]) => string[]) => setChoice(f(picked));

  const seen = (u: string, w: number) => setSizes((s) => (s[u] === undefined ? { ...s, [u]: w } : s));
  const toggle = (u: string) => setPicked((p) => (p.includes(u) ? p.filter((x) => x !== u) : p.length >= room ? p : [...p, u]));

  async function go() {
    if (!picked.length || !consent || busy) return;
    setBusy(true);
    setError("");
    try {
      let listingId = target;
      if (target === "new") {
        const { data: prof } = await supabase().from("profiles").select("account_type").eq("id", user.id).single();
        const { data, error } = await supabase()
          .from("listings")
          .insert({ user_id: user.id, ...(prof?.account_type === "photographer" ? { outro: "client" } : {}) })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message ?? "Couldn't start a new listing.");
        listingId = data.id;
      }
      const ordered = photos.filter((u) => picked.includes(u)).slice(0, room);   // keep the listing's photo order
      await api("/api/import", { listingId, urls: ordered, page: sent?.u, consent });
      try { localStorage.removeItem(KEY); } catch { /* fine */ }
      router.push(`/listings/${listingId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!sent) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <h1 className="font-display text-4xl">Nothing to import yet</h1>
        <p className="mt-3 text-ink-soft">
          Open your listing on Realtor.com, HAR or your MLS and click the <b>Send to Tourvo</b> button in your bookmarks bar.
        </p>
        <Link href="/send" className="btn-gold mt-6 inline-block px-5 py-2.5">Get the Send to Tourvo button</Link>
      </div>
    );
  }

  let host = "";
  try { host = new URL(sent.u).hostname.replace(/^www\./, ""); } catch { /* fine */ }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">Send to Tourvo</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">Pick your photos</h1>
        <p className="mt-2 text-sm text-ink-soft">
          From <b>{sent.t || host}</b>{host && sent.t ? ` · ${host}` : ""}.{" "}
          {`${photos.length} photo${photos.length === 1 ? "" : "s"} found${checking ? " so far, still looking…" : "."} Tap to choose up to ${room}.`}
          {picked.length > 0 && (
            <button type="button" className="ml-2 font-semibold text-ink underline underline-offset-4" onClick={() => setChoice([])}>Clear picks</button>
          )}
        </p>
      </div>

      {/* load every candidate quietly to learn its size */}
      <div className="hidden" aria-hidden>
        {candidates.filter((u) => sizes[u] === undefined).map((u) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={u} src={u} alt="" referrerPolicy="no-referrer" onLoad={(e) => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; seen(u, Math.max(w, h) >= MIN_LONG && Math.min(w, h) >= MIN_SHORT ? 1 : 0); }} onError={() => seen(u, 0)} />
        ))}
      </div>

      {!checking && !photos.length && (
        <p className="card p-5 text-sm text-ink-soft">
          No listing photos came through from that page. Open the photo gallery and scroll through it so the photos load, then click
          the button again. Or <Link href="/dashboard" className="font-semibold text-ink underline underline-offset-4">upload them</Link> instead.
        </p>
      )}

      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {photos.map((u) => {
            const n = picked.indexOf(u);
            return (
              <li key={u}>
                <button type="button" onClick={() => toggle(u)} aria-pressed={n >= 0}
                  className={`relative block aspect-video w-full overflow-hidden rounded-lg bg-line ring-offset-2 ${n >= 0 ? "ring-2 ring-[var(--accent)]" : "opacity-60 hover:opacity-100"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  {n >= 0 && (
                    <span className="absolute left-1.5 top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-[var(--accent)] px-1.5 text-xs font-bold text-white">
                      {photos.filter((x) => picked.includes(x)).indexOf(u) + 1}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {photos.length > 0 && (
        <section className="card flex flex-col gap-4 p-5 sm:p-6">
          <label className="block text-sm">
            <span className="font-semibold">Add them to</span>
            <select className="input mt-2" value={target} onChange={(e) => { setTarget(e.target.value); setPicked((p) => p.slice(0, MAX_PHOTOS - (drafts.find((d) => d.id === e.target.value)?.count ?? 0))); }}>
              <option value="new">A new listing</option>
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {(d.address || "Untitled listing")} · {d.count} photo{d.count === 1 ? "" : "s"} so far
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>This is my listing (or I have permission to market it), and I have the right to use these photos in videos.</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-gold px-5 py-2.5" disabled={!picked.length || !consent || busy} onClick={go}>
              {busy ? "Bringing in photos…" : `Import ${picked.length} photo${picked.length === 1 ? "" : "s"}`}
            </button>
            {busy && <span className="text-xs text-muted">This can take up to a minute.</span>}
          </div>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}

export default function ImportPage() {
  return <AppShell>{(user) => <ImportView user={user} />}</AppShell>;
}
