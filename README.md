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

1. Supabase: SQL Editor → paste `supabase/migrations/0001_init.sql` → Run.
   Authentication → URL Configuration: set Site URL to the app's domain and add
   `https://YOUR-DOMAIN/auth/callback` to Redirect URLs.
2. Vercel: import this repo, root directory `web`, add the variables in `web/.env.example`.
3. Railway: new service from this repo, root directory `render`, add the variables in
   `render/.env.example`.

Secrets go only in the Vercel / Railway dashboards, never in the code.

## Local engine use

```
python render/engine/render.py job.json out.mp4 [--format 9:16]
```
