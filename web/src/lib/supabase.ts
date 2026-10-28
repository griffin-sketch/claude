"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** One shared browser client. Row Level Security in the database keeps each realtor to their own data. */
export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them in Vercel → Settings → Environment Variables.",
      );
    }
    client = createBrowserClient(url, key);
  }
  return client;
}

/** Signed URL for a private file, valid for an hour. */
export async function signedUrl(bucket: string, path: string, seconds = 3600, download?: string) {
  const { data, error } = await supabase()
    .storage.from(bucket)
    .createSignedUrl(path, seconds, download ? { download } : undefined);
  if (error) return null;
  return data.signedUrl;
}

export function fileExt(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m ? m[1] : "jpg").toLowerCase();
}
