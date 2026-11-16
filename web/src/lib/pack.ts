// What each video in the Reel pack will show, and in what order, so the realtor sees the plan before
// making it. Mirrors render/reels.py build_pack (keep the two in sync).
import type { Listing, Shot } from "./types";

const ROLES: [string, string[]][] = [
  ["exterior", ["front", "exterior", "curb", "street", "facade", "elevation", "aerial", "drone"]],
  ["outdoor", ["pool", "yard", "patio", "backyard", "deck", "garden", "view", "outdoor", "porch"]],
  ["kitchen", ["kitchen", "island", "pantry"]],
  ["living", ["living", "family", "great room", "den", "dining", "entry", "foyer"]],
  ["bed", ["bed", "suite", "primary", "master"]],
  ["bath", ["bath", "shower", "tub"]],
];

export function role(s: Pick<Shot, "label" | "sub">, i = 1): string {
  const t = `${s.label ?? ""} ${s.sub ?? ""}`.toLowerCase();
  for (const [r, words] of ROLES) if (words.some((w) => t.includes(w))) return r;
  return i === 0 ? "exterior" : "other";
}

function pick<T>(shots: T[], n: number): T[] {
  if (shots.length <= n) return [...shots];
  const rest = shots.slice(1);
  const step = rest.length / (n - 1);
  return [shots[0], ...Array.from({ length: n - 1 }, (_, i) => rest[Math.floor(i * step)])];
}

function byRoles(shots: Shot[], wanted: string[], n: number): Shot[] {
  const [hero, ...rest] = shots;
  const out: Shot[] = [];
  for (const r of wanted) {
    const s = rest.find((x) => !out.includes(x) && role(x) === r);
    if (s) out.push(s);
  }
  for (const s of rest) {
    if (out.length >= n - 1) break;
    if (!out.includes(s)) out.push(s);
  }
  return [hero, ...out.slice(0, n - 1)];
}

function lead(seq: Shot[], roles: string[]): Shot[] {
  for (const r of roles) {
    const k = seq.findIndex((s, i) => i > 0 && role(s, i) === r);
    if (k > 0) return [seq[k], ...seq.slice(0, k), ...seq.slice(k + 1)];
  }
  return seq;
}

export type PackItem = {
  kind: string;
  name: string;
  style: string; // how this one looks and moves, in plain words
  format: "16:9" | "9:16";
  shots: Shot[];
  seconds: number;
  auto: Shot[]; // the photos it would pick on its own
  custom: boolean; // true when the realtor picked this video's photos
};

const TRANSFORM = new Set(["build", "staging", "dusk"]);

function length(durs: number[], overlap: number, outro: boolean) {
  const body = durs.reduce((a, b) => a + b, 0) - overlap * Math.max(0, durs.length - 1);
  return Math.round(body + (outro ? 5 : 0));
}

/** The most photos each short video can hold (keeps them short enough to post). */
export const REEL_MAX: Record<string, number> = {
  teaser: 8, just_listed: 7, price_reveal: 8, top_features: 7, open_house: 8, build_up: 15, staged: 15,
};
export const REEL_MIN = 2;

/** "Guess the price" speeds up shot by shot and holds the last one (the reveal). Keep in sync with reels.py. */
export function priceDurations(n: number): number[] {
  const ramp = [3, 2.5, 2.1, 1.8, 1.6, 1.5, 1.4];
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? 2.6 : ramp[Math.min(i, ramp.length - 1)]));
}

export function packPlan(listing: Listing, shots: Shot[]): PackItem[] {
  const out: PackItem[] = [];
  const outro = listing.outro !== "none";
  const ov: Record<string, number> = { crossfade: 0.6, speed_ramp: 0.14, flash: 0.3, cut: 0 };
  const byId = new Map(shots.map((s) => [s.id, s]));
  // The realtor's own pick for a video, if they made one that still has enough photos.
  const chosen = (kind: string, auto: Shot[]) => {
    const ids = listing.reel_shots?.[kind];
    const mine = (ids ?? []).map((i) => byId.get(i)).filter((s): s is Shot => !!s).slice(0, REEL_MAX[kind] ?? 15);
    return mine.length >= REEL_MIN ? { shots: mine, auto, custom: true } : { shots: auto, auto, custom: false };
  };

  const tourDur = shots.map((s) => (TRANSFORM.has(s.effect) ? 5 : 4.6));
  for (const f of listing.formats.length ? listing.formats : ["16:9"]) {
    out.push({
      kind: "tour",
      name: "Full walkthrough",
      style: "Your look and transitions. Every photo, in your order.",
      format: f as "16:9" | "9:16",
      shots, auto: shots, custom: false,
      seconds: length(tourDur, ov[listing.transition ?? "crossfade"] ?? 0.6, outro),
    });
  }
  if (shots.length < 3) return out;

  const t = chosen("teaser", lead(pick(shots, 6), ["kitchen", "living", "outdoor"]));
  out.push({
    kind: "teaser",
    name: "15-second teaser",
    style: "Fast speed ramps, bold type, punchy color, no room labels.",
    format: "9:16",
    ...t,
    seconds: length(Array(t.shots.length).fill(2), 0.14, true),
  });
  const jl = chosen("just_listed", byRoles(shots, ["living", "kitchen", "bed", "outdoor"], 5));
  out.push({
    kind: "just_listed",
    name: "Just Listed",
    style: "Cinematic slow motion with letterbox bars and a film tone.",
    format: "9:16",
    ...jl,
    seconds: length(Array(jl.shots.length).fill(3.8), 0.6, outro),
  });
  if ((listing.price ?? "").trim()) {
    const inside = shots.slice(1).filter((s) => role(s) !== "exterior");
    let seq = pick([shots[0], ...inside], 6);
    if (seq.length > 2) seq = [...seq.slice(1), seq[0]];
    const pr = chosen("price_reveal", seq);
    out.push({
      kind: "price_reveal",
      name: "Guess the price",
      style: "Quick cuts that speed up, inside first, the front of the home last, then the price.",
      format: "9:16",
      ...pr,
      seconds: length(priceDurations(pr.shots.length), 0, true),
    });
  }
  const labeled = shots.slice(1).filter((s) => (s.label ?? "").trim());
  if (labeled.length >= 3 || listing.reel_shots?.top_features?.length) {
    const feats = labeled.slice(0, 5);
    const last = shots[shots.length - 1];
    const tf = chosen("top_features", [feats.includes(last) ? shots[0] : last, ...feats]);
    if (tf.shots.length >= 3) {
      out.push({
        kind: "top_features",
        name: "Top features",
        style: "A numbered list of your labeled rooms. Slow, bright and airy.",
        format: "9:16",
        ...tf,
        seconds: length(Array(tf.shots.length).fill(3.6), 0.6, outro),
      });
    }
  }
  const built = shots.filter((s) => s.effect === "build");
  if (built.length >= 2) {
    const b = chosen("build_up", built);
    out.push({ kind: "build_up", name: "Built from the ground up", style: "Every construction shot, played in full with speed ramps.",
      format: "9:16", ...b, seconds: length(Array(b.shots.length).fill(5), 0.14, outro) });
  }
  const staged = shots.filter((s) => s.effect === "staging");
  if (staged.length >= 2) {
    const st = chosen("staged", staged);
    out.push({ kind: "staged", name: "Virtually staged", style: "Empty rooms furnishing themselves, soft dissolves.",
      format: "9:16", ...st, seconds: length(Array(st.shots.length).fill(5), 0.6, outro) });
  }
  if ((listing.open_house ?? "").trim()) {
    const oh = chosen("open_house", lead(byRoles(shots, ["outdoor", "kitchen", "living", "bed", "bath"], 6), ["outdoor", "kitchen"]));
    out.push({
      kind: "open_house",
      name: "Open house",
      style: "Warm tone, light-flash cuts, outdoor spaces first, your date and time up top.",
      format: "9:16",
      ...oh,
      seconds: length(Array(oh.shots.length).fill(2.8), 0.3, true),
    });
  }
  return out;
}

// "Auto-arrange": the order a buyer would walk the home. Front first, outdoor spaces near the end, aerials last.
const FLOW = ["exterior", "living", "kitchen", "other", "bed", "bath", "outdoor"];
export function walkthroughOrder(shots: Shot[]): Shot[] {
  const rank = (s: Shot, i: number) => {
    const t = `${s.label} ${s.sub}`.toLowerCase();
    if (/aerial|drone/.test(t)) return 100;
    return FLOW.indexOf(role(s, i)) * 10;
  };
  return shots
    .map((s, i) => ({ s, i, r: i === 0 && role(s, 0) === "exterior" ? -1 : rank(s, i) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.s);
}
