"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { STATUS_LABEL, type ListingStatus } from "@/lib/types";

type Row = {
  id: string; address: string; city: string | null; status: ListingStatus; paid_via: string | null; error: string | null;
  created_at: string; updated_at: string; email: string; name: string; account_type: string;
  photos: number; ready: number; failed: number; attempts: number; vertical: number; effects: number; videos: number;
  ai_cost: number; revenue: number;
};
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
        <h1 className="mt-2 font-display text-5xl font-medium leading-none">Admin</h1>
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
                <td className="px-4 py-3">{r.videos || "—"}</td>
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
      <p className="text-xs text-muted">Costs are estimates from clip counts (about $0.35 per Kling clip). Check fal.ai billing for exact numbers.</p>
    </div>
  );
}

export default function AdminPage() {
  return <AppShell>{() => <Admin />}</AppShell>;
}
