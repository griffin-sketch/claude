"use client";

import Link from "next/link";
import { useState } from "react";
import { grant, INTERVAL_IDS, INTERVALS, money, perMonth, PLAN_IDS, PLANS, savings, type IntervalId, type PlanId } from "@/lib/plans";

/**
 * Starter / Growth with a Monthly · Quarterly · Yearly switch.
 * Give `onPick` for buttons (signed in), or `href` for links (homepage; ?plan=&interval= are added).
 */
export function PlanPicker({
  onPick,
  href,
  busy,
  cta = "Choose",
  defaultInterval = "year",
}: {
  onPick?: (plan: PlanId, interval: IntervalId) => void;
  href?: string;
  busy?: string | null;
  cta?: string;
  defaultInterval?: IntervalId;
}) {
  const [interval, setInterval] = useState<IntervalId>(defaultInterval);

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Billing" className="mx-auto flex w-full max-w-md rounded-full border border-line bg-surface p-1">
        {INTERVAL_IDS.map((id) => {
          const save = Math.max(...PLAN_IDS.map((p) => savings(p, id)));
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={interval === id}
              onClick={() => setInterval(id)}
              className={`flex min-h-11 flex-1 flex-col items-center justify-center rounded-full px-2 text-sm font-semibold leading-tight transition ${
                interval === id ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              {INTERVALS[id].label}
              {save > 0 && <span className={`text-[11px] font-medium ${interval === id ? "text-white/75" : "text-muted"}`}>up to {save}% off</span>}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PLAN_IDS.map((id) => {
          const p = PLANS[id];
          const g = grant(id, interval);
          const per = INTERVALS[interval];
          const featured = id === "growth";
          const key = `${id}-${interval}`;
          const button = (
            <span className={`${featured ? "btn-gold" : "btn-primary"} mt-auto w-full`}>
              {busy === key ? "Opening checkout…" : `${cta} ${p.name}`}
            </span>
          );
          return (
            <div
              key={id}
              className={`flex flex-col gap-3 rounded-2xl border-2 bg-surface p-5 text-left sm:p-6 ${featured ? "border-ink" : "border-line"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {featured && <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-white">Most popular</span>}
              </div>
              <p className="flex items-baseline gap-1.5">
                <span className="font-display text-5xl leading-none">{money(Math.round(perMonth(id, interval)))}</span>
                <span className="text-sm text-muted">/ month</span>
              </p>
              <p className="-mt-1 text-xs text-muted">
                {per.months === 1 ? "Billed monthly" : `${money(p.price[interval])} billed every ${per.months === 3 ? "3 months" : "year"}`}
              </p>
              <ul className="space-y-1.5 text-sm text-ink-soft">
                <li>
                  <b className="text-ink">{p.videosPerMonth} listing videos</b> a month
                  {per.months > 1 && <> ({g.videos} up front)</>}
                </li>
                <li>
                  <b className="text-ink">{p.stagingPerMonth} staged photos</b> a month
                </li>
                <li>Full Reel pack, 5 clip redos per video, your branding</li>
                <li>{per.months === 1 ? "Cancel anytime" : "Unused videos last the whole term"}</li>
              </ul>
              <p className="text-xs text-muted">{p.blurb}</p>
              {onPick ? (
                <button type="button" className="mt-auto flex w-full" disabled={!!busy} onClick={() => onPick(id, interval)}>
                  {button}
                </button>
              ) : href ? (
                <Link href={`${href}?plan=${id}&interval=${interval}`} className="mt-auto flex w-full">
                  {button}
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
