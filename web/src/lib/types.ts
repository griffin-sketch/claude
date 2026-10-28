export type ListingStatus = "draft" | "queued" | "generating" | "review" | "rendering" | "done" | "failed";
export type ClipStatus = "none" | "queued" | "generating" | "ready" | "redo" | "failed";

export type Profile = {
  id: string;
  full_name: string | null;
  title: string | null;
  brokerage: string | null;
  phone: string | null;
  email: string | null;
  headshot_path: string | null;
  logo_path: string | null;
};

export type Listing = {
  id: string;
  user_id: string;
  status: ListingStatus;
  address: string;
  city_line: string;
  headline: string;
  kicker: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  acres: number | null;
  price: string | null;
  template: number;
  formats: string[];
  outro: "branded" | "simple" | "none";
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type Shot = {
  id: string;
  listing_id: string;
  position: number;
  photo_path: string;
  label: string;
  sub: string;
  move: string;
  clip_status: ClipStatus;
  clip_path: string | null;
  clip_attempts: number;
  approved: boolean;
  error: string | null;
};

export type Render = {
  id: string;
  listing_id: string;
  format: "16:9" | "9:16";
  video_path: string;
  created_at: string;
};

export const STATUS_LABEL: Record<ListingStatus, string> = {
  draft: "Draft",
  queued: "In line",
  generating: "Making clips",
  review: "Ready to review",
  rendering: "Building video",
  done: "Done",
  failed: "Needs attention",
};
