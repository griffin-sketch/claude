"use client";

import { useEffect } from "react";

/**
 * Counts a view of a share link. Runs in the browser, so link previews (iMessage, Facebook, Slack) that only
 * fetch the page don't count, and a refresh in the same tab counts once.
 */
export function CountView({ token }: { token: string }) {
  useEffect(() => {
    const key = `tourvo-viewed-${token}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* private mode: count it anyway */ }
    fetch("/api/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }), keepalive: true }).catch(() => {});
  }, [token]);
  return null;
}
