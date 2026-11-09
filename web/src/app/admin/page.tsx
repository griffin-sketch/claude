"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { STATUS_LABEL, type ListingStatus } from "@/lib/types";

type Row = {
  id: string; address: string; city: string | null; status: ListingStatus; paid_via: string | null; error: string | null;
  created_at: string; updated_at: string; email: string; name: string; account_type: string;
  photos: number; ready: number; failed: number; attempts: number; vertical: number; effects: number; videos: number;
  ai_cost: number; revenue: number;
};
type Media = {
  address: string;
  videos: { kind: string; format: string; play: string | null; download: string | null }[];
  clips: { position: number; label: string; effect: string; play: string | null; vertical: string | null }[];
};
const REEL: Record<string, string> = {
  tour: "Full walkthrough", teaser: "15-second teaser", just_listed: "Just Listed", price_reveal: "Guess the price",
  top_features: "Top features", build_up: "Built from the ground up", staged: "Virtually staged", open_house: "Open house",
};
const ORDER = Object.keys(REEL);

type Data = {
  totals: { users: number; photographers: number; subscribers: number; mrr: number; listings: number; revenue: number; ai_cost: number; problems: number; byStatus: Record<string, number> };
  rows: Row[];
};

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (s: string) => new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const TONE: Record<string, string> = {
  done: "bg-ok/15 text-ok", failed: "bg-danger/15 text-danger", review: "bg-gold-soft text-ink",
  generating: "bg-gold-soft text-gold-deep", rendering: "bg-gold-soft text-gold-deep", queued: "bg-line text-ink-soft", draft: "bg-line text-muted",
};

function Admin() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);

  const load = () => api<Data>("/api/admin").then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);   // refresh every 30 s
    return () => clearInterval(t);
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.rows.filter((r) =>
      (filter === "all" || (filter === "problems" ? r.status === "failed" || r.failed > 0 : r.status === filter)) &&
      (!term || `${r.address} ${r.city ?? ""} ${r.email} ${r.name}`.toLowerCase().includes(term)));
  }, [data, filter, q]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-ink-soft">Loading…</p>;
  const t = data.totals;
  const tiles = [
    ["Users", String(t.users), `${t.photographers} photographers`],
    ["Subscribers", String(t.subscribers), `${money(t.mrr)} / month`],
    ["Listings", String(t.listings), `${t.byStatus.done ?? 0} finished`],
    ["Revenue (est.)", money(t.revenue), "from listings"],
    ["AI cost (est.)", money(t.ai_cost), "fal.ai clips + edits"],
    ["Needs attention", String(t.problems), "failed listings or clips"],
  ];
  const chips = ["all", "problems", "draft", "queued", "generating", "review", "rendering", "done", "failed"];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow">Owner view</p>
        <h1 className="mt-2 font-display text-5xl leading-none">Admin</h1>
        <p className="mt-2 text-sm text-ink-soft">Every customer listing, live. Refreshes every 30 seconds.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${label === "Needs attention" && t.problems ? "text-danger" : ""}`}>{value}</p>
            <p className="text-xs text-ink-soft">{sub}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button key={c} onClick={() => setFilter(c)}
            className={`rounded-full px-3.5 py-2 text-sm font-medium ${filter === c ? "bg-ink text-white" : "bg-surface text-ink-soft ring-1 ring-line hover:text-ink"}`}>
            {c === "all" ? "All" : c === "problems" ? "Problems" : STATUS_LABEL[c as ListingStatus] ?? c}
            {c !== "all" && c !== "problems" && t.byStatus[c] ? ` · ${t.byStatus[c]}` : ""}
          </button>
        ))}
        <label className="ml-auto w-full sm:w-64">
          <span className="sr-only">Search listings</span>
          <input className="input" placeholder="Search address or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-[0.12em] text-muted">
            <tr>
              {["Listing", "Customer", "Status", "Clips", "Videos", "Paid", "AI cost", "Updated"].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="px-4 py-3">
                  <span className="block font-semibold">{r.address}</span>
                  <span className="block text-xs text-muted">{r.city}</span>
                  {r.error && <span className="mt-1 block max-w-xs text-xs text-danger">{r.error}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="block">{r.name || "—"}</span>
                  <span className="block text-xs text-muted">{r.email}{r.account_type === "photographer" ? " · photographer" : ""}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[r.status] ?? "bg-line"}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.ready}/{r.photos} ready{r.failed ? <span className="text-danger"> · {r.failed} failed</span> : null}
                  <span className="block text-muted">{r.attempts} tries · {r.vertical} vertical · {r.effects} effects</span>
                </td>
                <td className="px-4 py-3">
                  {r.videos || r.ready ? (
                    <button className="btn-ghost whitespace-nowrap py-1.5" onClick={() => setOpen(r.id)}>
                      Watch{r.videos ? ` · ${r.videos}` : " clips"}
                    </button>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-xs">{r.paid_via ? `${r.paid_via}${r.revenue ? ` · ${money(r.revenue)}` : ""}` : "—"}</td>
                <td className="px-4 py-3">{money(r.ai_cost)}</td>
                <td className="px-4 py-3 text-xs text-muted">{when(r.updated_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-ink-soft">No listings match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {open && <Viewer listingId={open} onClose={close} />}
      <p className="text-xs text-muted">Costs are estimates from clip counts (about $0.35 per Kling clip). Check fal.ai billing for exact numbers.</p>
    </div>
  );
}

/** Full-screen panel with a customer's finished videos and the AI clips behind them. */
function Viewer({ listingId, onClose }: { listingId: string; onClose: () => void }) {
  const [m, setM] = useState<Media | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Media>("/api/admin", { listing: listingId }).then(setM).catch((e) => setErr(e.message));
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [listingId, onClose]);
  const videos = [...(m?.videos ?? [])].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (a.format === "16:9" ? -1 : 1));
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 sm:p-8" onClick={onClose}>
      <div className="card mx-auto max-w-6xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Customer videos</p>
            <h2 className="mt-1 font-display text-3xl">{m?.address || "Loading…"}</h2>
          </div>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
        {m && !videos.length && <p className="text-sm text-ink-soft">No finished videos yet.</p>}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {videos.map((v, i) => (
            <div key={i} className={v.format === "16:9" ? "sm:col-span-2" : ""}>
              {v.play && (
                <video src={v.play} controls playsInline preload="metadata"
                  className={`w-full rounded-xl bg-black ${v.format === "9:16" ? "aspect-[9/16]" : "aspect-video"}`} />
              )}
              <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                <span>
                  <span className="block font-semibold">{REEL[v.kind] ?? v.kind}</span>
                  <span className="block text-xs text-muted">{v.format === "9:16" ? "Vertical" : "16:9"}</span>
                </span>
                {v.download && <a href={v.download} className="btn-ghost py-1.5">Download</a>}
              </div>
            </div>
          ))}
        </div>
        {!!m?.clips.length && (
          <details className="mt-8">
            <summary className="cursor-pointer text-sm font-semibold">AI clips ({m.clips.length}), in play order</summary>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {m.clips.map((c) => (
                <div key={c.position}>
                  {c.play && <video src={c.play} muted loop playsInline controls preload="metadata" className="aspect-video w-full rounded-lg bg-black" />}
                  <span className="mt-1 block text-xs text-ink-soft">
                    #{c.position + 1} {c.label || (c.position === 0 ? "Opening" : "Unlabeled")}
                    {c.effect && c.effect !== "none" ? ` · ${c.effect}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return <AppShell>{() => <Admin />}</AppShell>;
}
