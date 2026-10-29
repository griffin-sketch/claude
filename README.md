# KGB Listing Videos

Self-serve listing videos for realtors: upload photos, pick a template, get AI camera-move
walkthrough videos in 16:9 and 9:16.

| Folder | What it is | Hosted on |
| --- | --- | --- |
| `web/` | The website realtors use (Next.js) | Vercel (root directory `web`) |
| `render/` | Render worker: sends photos to fal.ai, builds videos with the template engine | Railway (root directory `render`) |
| `supabase/migrations/` | Database tables, security rules, storage buckets | Supabase (run in SQL Editor) |

## How a video gets made

1. Realtor uploads photos, labels rooms, picks a template → clicks **Generate clips** (listing `queued`).
2. Worker sends each photo to fal.ai (Kling) for a camera move → `generating`.
3. Clips come back into Supabase Storage → `review`. Realtor watches each clip, can **Redo** any.
4. Realtor clicks **Make my video** → `rendering`. Worker builds the videos with the template,
   labels and their branding → `done`, ready to download.

## Setup

1. Supabase: SQL Editor → run each file in `supabase/migrations/` in order (0001, 0002, …).
   Authentication → URL Configuration: set Site URL to the app's domain and add
   `https://YOUR-DOMAIN/auth/callback` to Redirect URLs.
2. Vercel: import this repo, root directory `web`, add the variables in `web/.env.example`.
3. Railway: new service from this repo, root directory `render`, add the variables in
   `render/.env.example`.

Secrets go only in the Vercel / Railway dashboards, never in the code.

## Payments

$49 per listing video, or $80/month for 3 videos (no rollover). Each video = one listing, both
formats, and clip redos.

- `web/src/app/api/start` starts a listing: uses a monthly video, or opens Stripe Checkout.
- `web/src/app/api/stripe/webhook` marks listings paid and grants/refills monthly videos.
  In Stripe → Developers → Webhooks, point an endpoint at `/api/stripe/webhook` with events
  `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`,
  `customer.subscription.deleted`.
- Emails in `ADMIN_EMAILS` skip payment (testing and comps).

## Local engine use

```
python render/engine/render.py job.json out.mp4 [--format 9:16]
```
