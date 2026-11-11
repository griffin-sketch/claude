"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { PlanPicker } from "@/components/PlanPicker";
import type { IntervalId, PlanId } from "@/lib/plans";

type Billing = { plan: string; plan_status: string | null; credits: number; bonus_credits: number; credits_period_end: string | null };

/** Last step before clips: use one of your videos, or pick a plan. */
export function PayPanel({
  user,
  listingId,
  missing,
  clipCount,
  paid,
  onStarted,
}: {
  user: User;
  listingId: string;
  missing: string[];
  clipCount: number;
  paid: boolean;
  onStarted: () => void;
}) {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase()
      .from("profiles")
      .select("plan, plan_status, credits, bonus_credits, credits_period_end")
      .eq("id", user.id)
      .single()
      .then(({ data }) =>
        setBilling((data as Billing) ?? { plan: "none", plan_status: null, credits: 0, bonus_credits: 0, credits_period_end: null }),
      );
  }, [user.id]);

  const subscribed = !!billing && billing.plan !== "none" && ["active", "trialing"].includes(billing.plan_status ?? "");
  const left = (subscribed ? billing?.credits ?? 0 : 0) + (billing?.bonus_credits ?? 0);
  const blocked = missing.length > 0 || !!busy;
  const refill = billing?.credits_period_end ? new Date(billing.credits_period_end).toLocaleDateString() : null;

  async function start(body: Record<string, string>, key: string) {
    setBusy(key);
    setError("");
    try {
      const res = await api("/api/start", { listingId, ...body });
      if (res.url) {
        window.location.href = res.url; // Stripe Checkout
        return;
      }
      onStarted();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="font-display text-2xl">Ready? Let&apos;s make it</h2>
      <p className="text-sm text-ink-soft">
        {missing.length
          ? `Still needed: ${missing.join(", ")}.`
          : `We'll make ${clipCount} clips. You review them, redo any you don't like, then we build your videos.`}
      </p>

      {!billing ? null : paid ? (
        <button className="btn-gold mt-5 px-6 py-3" disabled={blocked} onClick={() => start({ method: "credit" }, "credit")}>
          {busy ? "Starting…" : "Generate clips (paid)"}
        </button>
      ) : left > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button className="btn-gold min-h-12 px-6" disabled={blocked} onClick={() => start({ method: "credit" }, "credit")}>
            {busy === "credit" ? "Starting…" : "Use 1 of my videos"}
          </button>
          <span className="text-sm text-ink-soft">
            {left} video{left === 1 ? "" : "s"} left
            {billing.bonus_credits > 0 && ` (${billing.bonus_credits} free from referrals)`}.
          </span>
        </div>
      ) : subscribed ? (
        <div className="mt-5 rounded-xl bg-gold-soft p-4 text-sm">
          <p className="font-semibold">You&apos;ve used all your videos for now.</p>
          <p className="mt-1 text-ink-soft">
            {refill ? `They refill on ${refill}.` : "They refill when your plan renews."} Need one sooner?{" "}
            <Link href="/refer" className="underline">Refer a friend</Link> and you both get a free video.
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <p className="mb-4 text-sm font-semibold">Pick a plan. This listing uses your first video.</p>
          <PlanPicker
            busy={busy}
            cta="Start"
            onPick={(plan: PlanId, interval: IntervalId) => !blocked && start({ method: "subscribe", plan, interval }, `${plan}-${interval}`)}
          />
        </div>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}
