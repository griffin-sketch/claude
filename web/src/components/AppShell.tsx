"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { APP_NAME } from "@/lib/config";

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

  const nav = [
    { href: "/dashboard", label: "Listings" },
    { href: "/settings", label: "Branding" },
    { href: "/billing", label: "Billing" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/dashboard" className="flex items-baseline gap-2.5" aria-label={APP_NAME}>
            <span className="font-display text-[26px] font-semibold leading-none">KGB</span>
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.28em] text-gold-deep sm:inline">Listing Videos</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-full px-3.5 py-2 font-medium ${
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
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        {user ? children(user) : <p className="text-sm text-ink-soft">Loading…</p>}
      </main>
    </div>
  );
}
