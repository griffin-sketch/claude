"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

function BillingView({ user }: { user: User }) {
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [justSubscribed] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("subscribed") === "1",
  );

  useEffect(() => {
    const read = () =>
      supabase()
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()
        .then(({ data }) => setP(data as Profile));
    read();
    if (!justSubscribed) return;
    const t = setInterval(read, 3000); // Stripe confirms a few seconds after checkout
    const stop = setTimeout(() => clearInterval(t), 30000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [user.id, justSubscribed]);

  async function go(path: string) {
    setBusy(true);
    setError("");
    try {
      const res = await api(path);
      if (res.url) window.location.href = res.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!p) return <p className="text-sm text-ink-soft">Loading…</p>;
  const active = p.plan === "monthly" && ["active", "trialing", "past_due"].includes(p.plan_status ?? "");
  const resets = p.credits_period_end ? new Date(p.credits_period_end).toLocaleDateString() : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-ink-soft">$49 per listing video, or $80/month for 3 videos.</p>
      </div>

      {active ? (
        <section className="card p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">Monthly plan</p>
          <p className="mt-1 text-3xl font-bold">
            {p.credits} <span className="text-base font-semibold text-ink-soft">of 3 videos left this month</span>
          </p>
          {resets && <p className="mt-1 text-sm text-ink-soft">Refills to 3 on {resets}. Unused videos don&apos;t roll over.</p>}
          {p.plan_status === "past_due" && (
            <p className="mt-3 rounded-lg bg-danger/10 p-3 text-sm text-danger">
              Your last payment didn&apos;t go through. Update your card to keep your monthly videos.
            </p>
          )}
          <button className="btn-ghost mt-5" disabled={busy} onClick={() => go("/api/portal")}>
            Manage card, invoices or cancel
          </button>
        </section>
      ) : (
        <section className="card p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">Save with the monthly plan</p>
          <p className="mt-1 text-3xl font-bold">
            $80<span className="text-base font-semibold text-ink-soft">/month</span>
          </p>
          <p className="text-sm text-ink-soft">3 listing videos every month, about $27 each instead of $49. Cancel anytime.</p>
          <button className="btn-gold mt-5" disabled={busy} onClick={() => go("/api/subscribe")}>
            {busy ? "Opening checkout…" : "Start monthly plan"}
          </button>
          {p.stripe_customer_id && (
            <button className="btn-ghost ml-3 mt-5" disabled={busy} onClick={() => go("/api/portal")}>
              Past receipts
            </button>
          )}
        </section>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export default function BillingPage() {
  return <AppShell>{(user) => <BillingView user={user} />}</AppShell>;
}
