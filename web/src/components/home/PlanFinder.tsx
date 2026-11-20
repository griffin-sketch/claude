"use client";

import { useState } from "react";
import { EXTRA_VIDEO_PRICE, PLANS, money, type PlanId } from "@/lib/plans";

/** "How many listings a month?" The cheapest way to cover them, monthly billing, extras at the add-on price. */
export function PlanFinder() {
  const [n, setN] = useState(3);
  const cost = (id: PlanId) => PLANS[id].price.month + Math.max(0, n - PLANS[id].videosPerMonth) * EXTRA_VIDEO_PRICE;
  const best: PlanId = cost("starter") <= cost("growth") ? "starter" : "growth";
  const total = cost(best);
  const extras = Math.max(0, n - PLANS[best].videosPerMonth);

  return (
    <div className="flex flex-col gap-6 rounded-[28px] bg-white p-6 sm:flex-row sm:items-center sm:gap-10 sm:p-8">
      <label className="flex min-w-0 flex-1 flex-col gap-4">
        <span className="text-lg font-semibold">How many listings do you take a month?</span>
        <input type="range" min={1} max={12} value={n} onChange={(e) => setN(Number(e.target.value))}
          className="w-full accent-[var(--accent)]" aria-valuetext={`${n} listings a month`} />
        <span className="flex justify-between text-xs font-semibold text-muted"><span>1</span><span>6</span><span>12</span></span>
      </label>
      <div className="flex min-w-[240px] flex-col gap-1 rounded-[20px] bg-bg p-5">
        <span className="text-sm text-ink-soft">{n} listing{n === 1 ? "" : "s"} a month</span>
        <span className="font-display text-[40px] leading-none">{money(total)}<span className="text-base text-ink-soft"> /mo</span></span>
        <span className="text-[15px]">
          <strong className="font-semibold">{PLANS[best].name}</strong>
          <span className="text-ink-soft">{extras ? ` + ${extras} extra video${extras === 1 ? "" : "s"}` : ""} · {money(Math.round((total / n) * 100) / 100)} a video</span>
        </span>
        <span className="text-xs text-muted">Billed monthly. Yearly plans save more.</span>
      </div>
    </div>
  );
}
