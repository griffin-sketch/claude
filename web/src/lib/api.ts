"use client";

import { supabase } from "@/lib/supabase";

/** POST to one of our /api routes with the signed-in user's token. */
export async function api<T = { ok?: boolean; url?: string; error?: string }>(path: string, body: unknown = {}): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}
