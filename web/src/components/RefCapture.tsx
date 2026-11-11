"use client";

import { useEffect } from "react";

export const REF_KEY = "tourvo-ref";

/** Remembers ?ref=CODE from a friend's link until the visitor signs in (AppShell claims it). */
export function RefCapture() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (!code) return;
    try {
      localStorage.setItem(REF_KEY, code.slice(0, 16));
    } catch {}
  }, []);
  return null;
}
