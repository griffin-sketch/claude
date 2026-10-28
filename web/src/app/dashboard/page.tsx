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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Your listings</h1>
          <p className="text-sm text-ink-soft">Upload photos, pick a look, and we make the video.</p>
        </div>
        <button onClick={create} disabled={creating} className="btn-gold">
          {creating ? "Creating…" : "+ New listing video"}
        </button>
      </div>
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      {rows === null ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-semibold">No listings yet</p>
          <p className="mt-1 text-sm text-ink-soft">Start one with the button above. You&apos;ll need 3 to 20 listing photos.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((l) => (
            <li key={l.id}>
              <Link
                href={`/listings/${l.id}`}
                className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:border-gold"
              >
                <div>
                  <p className="font-semibold">{l.address || "Untitled listing"}</p>
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

export default function DashboardPage() {
  return <AppShell>{(user) => <Listings user={user} />}</AppShell>;
}
