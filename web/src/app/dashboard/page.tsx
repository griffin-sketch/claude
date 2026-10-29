"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { STATUS_LABEL, type Listing } from "@/lib/types";
import { TEMPLATES } from "@/lib/config";

function Listings({ user }: { user: User }) {
  const router = useRouter();
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase()
      .from("listings")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setRows((data as Listing[]) ?? []);
      });
  }, []);

  async function create() {
    setCreating(true);
    const { data, error } = await supabase()
      .from("listings")
      .insert({ user_id: user.id })
      .select("id")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Could not create the listing.");
      setCreating(false);
      return;
    }
    router.push(`/listings/${data.id}`);
  }

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{greeting(user)}</p>
          <h1 className="mt-2 font-display text-5xl font-medium leading-none">Your listings</h1>
          <p className="mt-2 text-sm text-ink-soft">Upload photos, pick a look, and we make the video.</p>
        </div>
        <button onClick={create} disabled={creating} className="btn-gold">
          {creating ? "Creating…" : "+ New listing video"}
        </button>
      </div>
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      {rows === null ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card grid overflow-hidden md:grid-cols-2">
          <img src="/home/house.jpg" alt="" className="h-full min-h-56 w-full object-cover" />
          <div className="flex flex-col justify-center gap-5 p-8 sm:p-10">
            <h2 className="font-display text-4xl font-medium leading-tight">
              Let&apos;s make your <span className="italic">first video.</span>
            </h2>
            <ol className="space-y-3 text-sm text-ink-soft">
              {["Add 3 to 20 listing photos, front of the home first", "Pick one of ten looks", "Review each clip, then download"].map((t, i) => (
                <li key={t} className="flex items-baseline gap-3">
                  <span className="font-display text-2xl text-gold">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
            <button onClick={create} disabled={creating} className="btn-gold self-start px-6">
              {creating ? "Creating…" : "Start a listing video"}
            </button>
          </div>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((l) => (
            <li key={l.id}>
              <Link
                href={`/listings/${l.id}`}
                className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:-translate-y-px hover:border-gold hover:shadow-[0_8px_24px_rgba(23,25,28,.06)]"
              >
                <div>
                  <p className="font-display text-2xl font-medium leading-tight">{l.address || "Untitled listing"}</p>
                  <p className="text-sm text-ink-soft">
                    {[l.city_line, TEMPLATES.find((t) => t.id === l.template)?.name].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    l.status === "done"
                      ? "bg-ok/15 text-ok"
                      : l.status === "failed"
                        ? "bg-danger/15 text-danger"
                        : l.status === "review"
                          ? "bg-gold-soft text-ink"
                          : "bg-line text-ink-soft"
                  }`}
                >
                  {STATUS_LABEL[l.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function greeting(user: User) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const name = (user.user_metadata?.full_name as string | undefined)?.split(" ")[0];
  return name ? `${part}, ${name}` : part;
}

export default function DashboardPage() {
  return <AppShell>{(user) => <Listings user={user} />}</AppShell>;
}
