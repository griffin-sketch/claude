"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { APP_NAME } from "@/lib/config";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import { REF_KEY } from "@/components/RefCapture";

/** Signed-in frame: header + nav. Sends signed-out visitors to /login. */
export function AppShell({ children }: { children: (user: User) => ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace(`/login?next=${encodeURIComponent(path)}`);
      setUser(data.user ?? null);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router, path]);

  // the owner sees an Admin tab (the server decides who that is)
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    if (!user) return;
    api("/api/admin", { ping: true }).then(() => setIsOwner(true)).catch(() => {});
  }, [user]);
  // a friend's referral link, remembered from before sign-in
  const [refNote, setRefNote] = useState("");
  useEffect(() => {
    if (!user) return;
    let code: string | null = null;
    try {
      code = localStorage.getItem(REF_KEY);
    } catch {}
    if (!code) return;
    api<{ ok: boolean; reason?: string }>("/api/referral", { action: "claim", code })
      .then((r) => {
        try {
          localStorage.removeItem(REF_KEY);
        } catch {}
        if (r.ok) setRefNote("You were invited by a friend: when you start a plan, you both get a free listing video.");
      })
      .catch(() => {});
  }, [user]);

  const [menu, setMenu] = useState(false);
  const nav = [
    { href: "/dashboard", label: "Listings" },
    { href: "/staging", label: "Staging" },
    { href: "/settings", label: "Branding" },
    { href: "/billing", label: "Billing" },
    { href: "/refer", label: "Refer a friend" },
    ...(isOwner ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <Link href="/dashboard" aria-label={`${APP_NAME} dashboard`}>
            <Logo size={30} />
          </Link>
          <nav className="-mr-2 hidden items-center gap-1 text-sm lg:flex">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 font-medium ${
                  path.startsWith(n.href) ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <button
              onClick={() => supabase().auth.signOut()}
              className="ml-1 rounded-full px-3 py-2 font-medium text-muted hover:text-ink"
            >
              Sign out
            </button>
          </nav>
          {/* phones: one Menu button instead of a row of links */}
          <button
            type="button"
            aria-expanded={menu}
            aria-controls="phone-menu"
            onClick={() => setMenu((m) => !m)}
            className="flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold lg:hidden"
          >
            {menu ? "Close" : "Menu"}
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              {menu ? (
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
        {menu && (
          <nav id="phone-menu" className="border-t border-line px-4 pb-4 pt-2 lg:hidden">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenu(false)}
                className={`flex min-h-12 items-center rounded-xl px-3 text-base font-medium ${
                  path.startsWith(n.href) ? "bg-gold-soft text-ink" : "text-ink-soft"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <button
              onClick={() => supabase().auth.signOut()}
              className="flex min-h-12 w-full items-center rounded-xl px-3 text-base font-medium text-muted"
            >
              Sign out
            </button>
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {refNote && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-xl bg-gold-soft p-4 text-sm">
            <span>🎁 {refNote}</span>
            <button type="button" aria-label="Dismiss" className="text-muted hover:text-ink" onClick={() => setRefNote("")}>✕</button>
          </div>
        )}
        {user ? children(user) : <p className="text-sm text-ink-soft">Loading…</p>}
      </main>
    </div>
  );
}
