/** Subscription plans. Shared by the server (Stripe checkout, webhook) and the pages that show prices. */

export type PlanId = "starter" | "growth";
export type IntervalId = "month" | "quarter" | "year";

export const INTERVALS: Record<IntervalId, { label: string; short: string; months: number; stripe: { interval: "month" | "year"; interval_count: number } }> = {
  month: { label: "Monthly", short: "mo", months: 1, stripe: { interval: "month", interval_count: 1 } },
  quarter: { label: "Quarterly", short: "quarter", months: 3, stripe: { interval: "month", interval_count: 3 } },
  year: { label: "Yearly", short: "year", months: 12, stripe: { interval: "year", interval_count: 1 } },
};

export const PLANS: Record<PlanId, { name: string; blurb: string; videosPerMonth: number; stagingPerMonth: number; price: Record<IntervalId, number> }> = {
  starter: {
    name: "Starter",
    blurb: "For agents with a listing or two a month",
    videosPerMonth: 2,
    stagingPerMonth: 10,
    price: { month: 39, quarter: 99, year: 288 }, // dollars per billing period
  },
  growth: {
    name: "Growth",
    blurb: "For busy agents, teams and photographers",
    videosPerMonth: 5,
    stagingPerMonth: 40,
    price: { month: 59, quarter: 159, year: 468 },
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];
export const INTERVAL_IDS = Object.keys(INTERVALS) as IntervalId[];

export function isPlan(v: unknown): v is PlanId {
  return typeof v === "string" && v in PLANS;
}
export function isInterval(v: unknown): v is IntervalId {
  return typeof v === "string" && v in INTERVALS;
}

/** What one billing period includes. Unused videos and staged photos last until the period ends. */
export function grant(plan: PlanId, interval: IntervalId) {
  const m = INTERVALS[interval].months;
  return { videos: PLANS[plan].videosPerMonth * m, staging: PLANS[plan].stagingPerMonth * m };
}

/** Price per month, for comparing intervals. */
export function perMonth(plan: PlanId, interval: IntervalId) {
  return PLANS[plan].price[interval] / INTERVALS[interval].months;
}

/** Percent saved compared with paying monthly. */
export function savings(plan: PlanId, interval: IntervalId) {
  const monthly = PLANS[plan].price.month;
  return Math.round((1 - perMonth(plan, interval) / monthly) * 100);
}

export function money(n: number) {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

/** The legacy $80/month plan from before tiers, so its subscribers keep working. */
export const LEGACY_MONTHLY = { videos: 3, staging: 0 };

/** Each side of a referral gets this many free videos once the friend pays for a plan. */
export const REFERRAL_REWARD_VIDEOS = 1;
