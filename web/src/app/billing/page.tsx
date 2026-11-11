"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { PlanPicker } from "@/components/PlanPicker";
import { INTERVALS, isInterval, isPlan, money, PLANS, savings } from "@/lib/plans";

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

  async function go(path: string, body?: Record<string, string>) {
    setBusy(true);
    setError("");
    try {
      const res = await api(path, body);
      if (res.url) window.location.href = res.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!p) return <p className="text-sm text-ink-soft">Loading…</p>;
  const active = p.plan !== "none" && ["active", "trialing", "past_due"].includes(p.plan_status ?? "");
  const resets = p.credits_period_end ? new Date(p.credits_period_end).toLocaleDateString() : null;
  const tier = isPlan(p.plan) ? PLANS[p.plan] : null;
  const interval = isInterval(p.plan_interval) ? INTERVALS[p.plan_interval] : null;
  const planName = tier ? `${tier.name} · ${interval?.label ?? ""}` : "Monthly plan";
  const price = tier && isInterval(p.plan_interval) ? `${money(tier.price[p.plan_interval])} / ${interval?.short}` : "$80 / mo";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">Billing</h1>
        <p className="text-sm text-ink-soft">Plans include listing videos and staged photos. Save up to {Math.max(savings("starter", "year"), savings("growth", "year"))}% when you pay yearly.</p>
      </div>

      {active ? (
        <section className="card p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold">{planName}</p>
            <p className="text-sm text-muted">{price}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gold-soft p-4">
              <p className="font-display text-4xl leading-none">{p.credits + p.bonus_credits}</p>
              <p className="mt-1 text-sm text-ink-soft">listing video{p.credits + p.bonus_credits === 1 ? "" : "s"} left</p>
            </div>
            <div className="rounded-xl bg-gold-soft p-4">
              <p className="font-display text-4xl leading-none">{p.staging_credits}</p>
              <p className="mt-1 text-sm text-ink-soft">staged photo{p.staging_credits === 1 ? "" : "s"} left</p>
            </div>
          </div>
          {resets && (
            <p className="mt-3 text-sm text-ink-soft">
              Your plan renews on {resets} and refills then. Unused plan videos and photos end at renewal
              {p.bonus_credits > 0 ? `; your ${p.bonus_credits} free referral video${p.bonus_credits === 1 ? "" : "s"} never expire.` : "."}
            </p>
          )}
          {p.plan_status === "past_due" && (
            <p className="mt-3 rounded-lg bg-danger/10 p-3 text-sm text-danger">
              Your last payment didn&apos;t go through. Update your card to keep your videos.
            </p>
          )}
          <button className="btn-ghost mt-5" disabled={busy} onClick={() => go("/api/portal")}>
            Manage card, invoices or cancel
          </button>
        </section>
      ) : (
        <section className="space-y-4">
          {p.bonus_credits > 0 && (
            <p className="rounded-xl bg-gold-soft p-4 text-sm">
              You have <b>{p.bonus_credits} free video{p.bonus_credits === 1 ? "" : "s"}</b> from referrals. Use {p.bonus_credits === 1 ? "it" : "them"} on any listing.
            </p>
          )}
          <PlanPicker busy={busy ? "x" : null} cta="Start" onPick={(plan, iv) => go("/api/subscribe", { plan, interval: iv })} />
          {p.stripe_customer_id && (
            <button className="btn-ghost" disabled={busy} onClick={() => go("/api/portal")}>
              Past receipts
            </button>
          )}
        </section>
      )}

      <section className="card flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
        <div>
          <p className="font-semibold">Give a free video, get a free video</p>
          <p className="text-sm text-ink-soft">When someone you refer starts a plan, you both get a listing video free.</p>
        </div>
        <Link href="/refer" className="btn-primary">Refer a friend</Link>
      </section>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export default function BillingPage() {
  return <AppShell>{(user) => <BillingView user={user} />}</AppShell>;
}
