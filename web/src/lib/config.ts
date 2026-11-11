// App-wide settings. Change the product name here once it's picked.
export const APP_NAME = "Tourvo";
export const APP_TAGLINE = "Turn listing photos into a cinematic walkthrough video, branded for you, in about 15 minutes.";

export const MAX_PHOTOS = 15;
export const REDO_LIMIT = 5; // clip redos a customer can ask for, per listing (must match 0011_redo_limit.sql)
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
  { id: "frames", name: "Room to room", blurb: "Pick a second photo and the camera walks from this room into that one." },
] as const;

// Camera direction per photo. Keep in sync with render/engine/ai_motion.py MOVES_BOLD
export const CAMERA_MOVES = [
  { id: "auto", icon: "✦", name: "Auto", blurb: "We pick the best move for the room." },
  { id: "push", icon: "↑", name: "Push in", blurb: "Glides forward into the room." },
  { id: "pull", icon: "↓", name: "Pull out", blurb: "Backs out to reveal more of the space." },
  { id: "pan_left", icon: "←", name: "Pan left", blurb: "Slides sideways, right to left." },
  { id: "pan_right", icon: "→", name: "Pan right", blurb: "Slides sideways, left to right." },
  { id: "orbit_left", icon: "↺", name: "Orbit left", blurb: "Arcs around the room to the left. Best in open spaces." },
  { id: "orbit_right", icon: "↻", name: "Orbit right", blurb: "Arcs around the room to the right. Best in open spaces." },
  { id: "rise", icon: "⤴", name: "Rise", blurb: "Flies forward and up, like a drone. Great on exteriors." },
  { id: "descend", icon: "⤵", name: "Descend", blurb: "Lowers from up high down to eye level." },
  { id: "tilt_up", icon: "⇡", name: "Tilt up", blurb: "Tilts from the floor up to the ceiling. Great for tall rooms." },
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

// Background music library. Files: web/public/music/<id>.mp3 (previews) and render/engine/music/<id>.mp3 (renders).
export const MUSIC = [
  { id: "luxe", name: "Luxe Piano", mood: "Elegant piano and soft strings" },
  { id: "bright", name: "Bright Days", mood: "Upbeat, feel-good pop" },
  { id: "cinematic", name: "Grand Entrance", mood: "Cinematic and inspiring" },
  { id: "acoustic", name: "Front Porch", mood: "Warm acoustic guitar" },
  { id: "lofi", name: "Sunday Coffee", mood: "Chill lo-fi beat" },
  { id: "house", name: "Night Drive", mood: "Modern deep house" },
  { id: "ambient", name: "Open Space", mood: "Calm, airy ambient" },
  { id: "drive", name: "Momentum", mood: "Energetic, punchy, social-first" },
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

// Virtual staging styles and rooms. Keep in sync with render/staging.py (STYLES, ROOMS)
export const STAGE_STYLES = [
  { id: "modern", name: "Modern", blurb: "Clean lines, warm greys and natural wood" },
  { id: "farmhouse", name: "Modern farmhouse", blurb: "Warm whites, oak, linen and black metal" },
  { id: "scandinavian", name: "Scandinavian", blurb: "Light oak, soft textiles, no clutter" },
  { id: "coastal", name: "Coastal", blurb: "Airy whites, sand and soft blues, rattan" },
  { id: "luxury", name: "Luxury", blurb: "Velvet, marble, brass and statement lighting" },
  { id: "midcentury", name: "Mid-century", blurb: "Walnut, tapered legs, mustard and teal" },
  { id: "industrial", name: "Industrial", blurb: "Leather, dark metal, reclaimed wood" },
  { id: "transitional", name: "Transitional", blurb: "Classic shapes, fresh neutral palette" },
] as const;
export const STAGE_ROOMS = [
  { id: "auto", name: "Detect the room" },
  { id: "living", name: "Living room" },
  { id: "bedroom", name: "Bedroom" },
  { id: "dining", name: "Dining room" },
  { id: "kitchen", name: "Kitchen" },
  { id: "office", name: "Home office" },
  { id: "kids", name: "Kid's room" },
  { id: "outdoor", name: "Patio" },
] as const;
export const STAGING_PRICE = 5; // dollars per staged photo
