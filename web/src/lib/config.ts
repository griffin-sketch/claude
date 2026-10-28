// App-wide settings. Change the product name here once it's picked.
export const APP_NAME = "KGB Listing Videos";
export const APP_TAGLINE = "Cinematic listing videos from your photos, in minutes.";

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
