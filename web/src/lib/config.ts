// App-wide settings. Change the product name here once it's picked.
export const APP_NAME = "Tourvo";
export const APP_TAGLINE = "Turn listing photos into a cinematic walkthrough video, branded for you, in about 15 minutes.";

export const MAX_PHOTOS = 20;
export const MIN_PHOTOS = 3;

export const TEMPLATES = [
  { id: 1, name: "Signature Gold", blurb: "Polished classic luxury. Works for any home." },
  { id: 2, name: "Editorial", blurb: "Magazine-style serif with a gold hairline." },
  { id: 3, name: "Emerald", blurb: "Bold labels in rounded pills. Social-first." },
  { id: 4, name: "Frosted", blurb: "Frosted-glass panels. Sleek and modern." },
  { id: 5, name: "Terracotta", blurb: "Tall condensed type, warm accent. Boutique feel." },
  { id: 6, name: "Editorial II", blurb: "Left-aligned serif with numbered features." },
  { id: 7, name: "Coastal Glass", blurb: "Navy glass cards with seafoam accents." },
  { id: 8, name: "Emerald Sidebar", blurb: "Deep green panel, champagne details." },
  { id: 9, name: "Golden Hour", blurb: "Script lettering with warm gold." },
  { id: 10, name: "Cinema", blurb: "Letterbox bars and wide-tracked caps." },
] as const;

export const TRANSITIONS = [
  { id: "crossfade", name: "Smooth fade", blurb: "Soft dissolve between rooms. Calm and classic." },
  { id: "speed_ramp", name: "Speed ramp", blurb: "Camera rushes into each cut, then settles. High energy." },
  { id: "flash", name: "Light flash", blurb: "Quick dissolve through a soft white glow." },
  { id: "cut", name: "Straight cut", blurb: "Clean, instant cuts. Fast paced." },
] as const;

// Keep in sync with render/effects.py EFFECTS
export const EFFECTS = [
  { id: "none", name: "Camera move", blurb: "A smooth cinematic move through the space." },
  { id: "build", name: "Construction build-up", blurb: "Starts as framing or bare studs and builds itself. Great for new builds." },
  { id: "staging", name: "Virtual staging", blurb: "An empty room furnishes itself. For vacant listings." },
  { id: "dusk", name: "Day to dusk", blurb: "The sky turns to twilight and the lights glow on. Best on exteriors." },
  { id: "water", name: "Moving water", blurb: "Pool, spa or water view ripples and shimmers." },
  { id: "fire", name: "Fireplace glow", blurb: "A warm fire flickers in the fireplace or fire pit." },
  { id: "reveal", name: "Drone reveal", blurb: "Flies back and up to reveal the whole property. Use on aerials." },
] as const;

// Opening line of the teaser Reel. Keep in sync with render/reels.py HOOKS
export const HOOKS = [
  { id: "inside", text: "Wait till you see inside" },
  { id: "pov", text: "POV: you just found your dream home" },
  { id: "would", text: "Would you live here?" },
  { id: "hit", text: "This just hit the market" },
  { id: "tour", text: "Tour this {beds}-bed home in {city}" },
  { id: "rate", text: "Rate this home 1 to 10" },
  { id: "under", text: "What {price} gets you in {city}" },
  { id: "backyard", text: "Wait for the backyard" },
] as const;

export const ROOM_SUGGESTIONS = [
  "Front Exterior",
  "Open Living Room",
  "Updated Kitchen",
  "Dining Room",
  "Family Room",
  "Primary Suite",
  "Primary Bath",
  "Guest Bedroom",
  "Guest Bath",
  "Home Office",
  "Laundry Room",
  "Private Backyard",
  "Pool + Patio",
  "Aerial View",
];
