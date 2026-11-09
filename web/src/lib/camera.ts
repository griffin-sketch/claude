// Camera control: six sliders (-10..10) per photo, like a camera operator's controls.
// Saved in shots.move as "custom:h=2.9,v=0,z=8.7,p=6.3,t=0,r=0". Keep in sync with
// render/engine/ai_motion.py (parse_custom, custom_prompt).
import { CAMERA_MOVES } from "./config";

export type Axis = "h" | "v" | "z" | "p" | "t" | "r";
export type Cam = Record<Axis, number>;

export const AXES: { id: Axis; name: string; neg: string; pos: string }[] = [
  { id: "h", name: "Horizontal", neg: "Slide left", pos: "Slide right" },
  { id: "p", name: "Pan", neg: "Turn left", pos: "Turn right" },
  { id: "v", name: "Vertical", neg: "Lower", pos: "Raise" },
  { id: "t", name: "Tilt", neg: "Look down", pos: "Look up" },
  { id: "z", name: "Zoom", neg: "Pull out", pos: "Push in" },
  { id: "r", name: "Rotate", neg: "Roll left", pos: "Roll right" },
];

export const ZERO: Cam = { h: 0, v: 0, z: 0, p: 0, t: 0, r: 0 };

// What each named move looks like on the sliders (for the preview, and as a starting point to fine-tune).
export const PRESET_CAM: Record<string, Partial<Cam>> = {
  auto: { z: 4 },
  push: { z: 6 },
  pull: { z: -6 },
  pan_left: { h: -6 },
  pan_right: { h: 6 },
  orbit_left: { h: -5, p: 4 },
  orbit_right: { h: 5, p: -4 },
  rise: { v: 5, z: 4 },
  descend: { v: -5, z: 3 },
  tilt_up: { t: 6 },
  glide: { h: 6 },
};

export function parseCam(move: string | null | undefined): Cam {
  const m = move || "auto";
  if (!m.startsWith("custom:")) return { ...ZERO, ...(PRESET_CAM[m] ?? PRESET_CAM.auto) };
  const out = { ...ZERO };
  for (const part of m.slice(7).split(",")) {
    const [k, v] = part.split("=");
    if (k in out) out[k as Axis] = Math.max(-10, Math.min(10, Number(v) || 0));
  }
  return out;
}

export function camToMove(c: Cam): string {
  return "custom:" + AXES.map((a) => `${a.id}=${Math.round(c[a.id] * 10) / 10}`).join(",");
}

/** Short summary for a collapsed card, e.g. "↑ Push in" or "Custom: push in + pan right". */
export function describeMove(move: string | null | undefined): { icon: string; text: string } {
  const m = move || "auto";
  if (!m.startsWith("custom:")) {
    const p = CAMERA_MOVES.find((c) => c.id === m) ?? CAMERA_MOVES[0];
    return { icon: p.icon, text: p.name };
  }
  const c = parseCam(m);
  const top = AXES.filter((a) => Math.abs(c[a.id]) >= 0.5)
    .sort((a, b) => Math.abs(c[b.id]) - Math.abs(c[a.id]))
    .slice(0, 2)
    .map((a) => (c[a.id] > 0 ? a.pos : a.neg).toLowerCase());
  return { icon: "⌖", text: top.length ? `Custom: ${top.join(" + ")}` : "Custom" };
}

/** CSS transform for the preview at the end of the move (the start is the neutral frame). */
export function previewTransform(c: Cam, k: number): string {
  const base = 1.22; // start zoomed in a little so moves never show the photo's edges
  const s = base * (1 + (c.z / 10) * 0.18 * k);
  return [
    "perspective(900px)",
    `rotateY(${(-c.p / 10) * 9 * k}deg)`,
    `rotateX(${(c.t / 10) * 7 * k}deg)`,
    `rotate(${(-c.r / 10) * 6 * k}deg)`,
    `translate(${(-c.h / 10) * 7 * k}%, ${(c.v / 10) * 6 * k}%)`,
    `scale(${s})`,
  ].join(" ");
}
