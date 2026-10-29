"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type Billing = { plan: string; plan_status: string | null; credits: number };

/** Step 4 of a listing: pay (or use a monthly video) and start the clips. */
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
      .select("plan, plan_status, credits")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setBilling((data as Billing) ?? { plan: "none", plan_status: null, credits: 0 }));
  }, [user.id]);

  const subscribed = billing?.plan === "monthly" && ["active", "trialing"].includes(billing.plan_status ?? "");
  const blocked = missing.length > 0 || !!busy;

  async function start(method: "credit" | "single" | "subscribe") {
    setBusy(method);
    setError("");
    try {
      const res = await api("/api/start", { listingId, method });
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
    <section className="card p-6">
      <h2 className="font-display text-2xl font-medium">4. Make the camera moves</h2>
      <p className="text-sm text-ink-soft">
        {missing.length
          ? `Still needed: ${missing.join(", ")}.`
          : `We'll make ${clipCount} clips. You review them, redo any you don't like, then we build your 16:9 and 9:16 videos.`}
      </p>

      {paid ? (
        <button className="btn-gold mt-5 px-6 py-3" disabled={blocked} onClick={() => start("single")}>
          {busy ? "Starting…" : "Generate clips (paid)"}
        </button>
      ) : subscribed ? (
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            className="btn-gold px-6 py-3"
            disabled={blocked || (billing?.credits ?? 0) < 1}
            onClick={() => start("credit")}
          >
            {busy === "credit" ? "Starting…" : "Use 1 of my monthly videos"}
          </button>
          <span className="text-sm text-ink-soft">
            {billing?.credits ?? 0} of 3 left this month.
            {(billing?.credits ?? 0) < 1 && (
              <>
                {" "}
                <button className="underline" disabled={blocked} onClick={() => start("single")}>
                  Pay $49 for this one
                </button>
              </>
            )}
          </span>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            className="rounded-xl border-2 border-line p-4 text-left transition hover:border-gold disabled:opacity-50"
            disabled={blocked}
            onClick={() => start("single")}
          >
            <span className="block text-2xl font-bold">$49</span>
            <span className="block font-semibold">This video</span>
            <span className="mt-1 block text-sm text-ink-soft">One-time payment for this listing.</span>
            <span className="btn-primary mt-3 w-full">{busy === "single" ? "Opening checkout…" : "Pay $49"}</span>
          </button>
          <button
            className="rounded-xl border-2 border-gold p-4 text-left transition hover:brightness-105 disabled:opacity-50"
            disabled={blocked}
            onClick={() => start("subscribe")}
          >
            <span className="block text-2xl font-bold">
              $80<span className="text-base font-semibold text-ink-soft">/month</span>
            </span>
            <span className="block font-semibold">3 videos every month</span>
            <span className="mt-1 block text-sm text-ink-soft">This listing uses your first one. Cancel anytime.</span>
            <span className="btn-gold mt-3 w-full">{busy === "subscribe" ? "Opening checkout…" : "Subscribe"}</span>
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}
