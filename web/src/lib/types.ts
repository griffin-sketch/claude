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
  account_type: "agent" | "photographer";
  company: string | null;
  stripe_customer_id: string | null;
  plan: "none" | "monthly" | "starter" | "growth";
  plan_interval: "month" | "quarter" | "year" | null;
  plan_status: string | null;
  credits: number;
  credits_period_end: string | null;
  staging_credits: number;
  bonus_credits: number;
  referral_code: string | null;
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
  hook: string | null;
  music: string;
  music_path: string | null;
  client_name: string | null;
  client_brokerage: string | null;
  client_phone: string | null;
  client_logo_path: string | null;
  client_headshot_path: string | null;
  share_token: string | null;
  open_house: string | null;
  transition: "crossfade" | "speed_ramp" | "flash" | "cut";
  formats: string[];
  outro: "branded" | "client" | "simple" | "none";
  paid: boolean;
  paid_via: "single" | "credit" | "comp" | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type Effect = "none" | "build" | "staging" | "dusk" | "water" | "fire" | "reveal" | "frames";

export type Shot = {
  id: string;
  listing_id: string;
  position: number;
  photo_path: string;
  label: string;
  sub: string;
  move: string;
  effect: Effect;
  clip_status: ClipStatus;
  vclip_status?: string;
  vclip_path?: string | null;
  clip_path: string | null;
  clip_attempts: number;
  approved: boolean;
  error: string | null;
  stage_style?: string;
  stage_room?: string;
  end_photo_path?: string | null;
};

export type Staging = {
  id: string;
  user_id: string;
  listing_id: string | null;
  source_path: string;
  room: string;
  style: string;
  status: "queued" | "processing" | "ready" | "failed";
  preview_path: string | null;
  paid: boolean;
  error: string | null;
  created_at: string;
};

export type Render = {
  id: string;
  listing_id: string;
  format: "16:9" | "9:16";
  kind?: string;
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
