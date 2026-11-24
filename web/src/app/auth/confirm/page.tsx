"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Landing spot for the emailed sign-in link when the email carries a token hash
 * ({{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email). Unlike the ?code= link, this works in any
 * browser, including the one inside the Gmail or Outlook app, because nothing has to match the browser that asked
 * for the link.
 */
function Confirm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem("tourvo_next"); localStorage.removeItem("tourvo_next"); } catch { /* fine */ }
    const next = params.get("next") || stored || "/dashboard";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    const token_hash = params.get("token_hash");
    const type = (params.get("type") || "email") as EmailOtpType;
    if (!token_hash) {
      setError("This sign-in link is missing its code. Request a new one.");
      return;
    }
    supabase()
      .auth.verifyOtp({ token_hash, type })
      .then(({ error }) => {
        if (error) setError("This sign-in link has expired or was already used. Request a new one and it'll work right away.");
        else router.replace(safeNext);
      });
  }, [params, router]);

  return error ? (
    <div className="card max-w-sm p-8 text-sm">
      <p className="text-danger">{error}</p>
      <a href="/login" className="btn-primary mt-4">Back to sign in</a>
    </div>
  ) : (
    <p className="text-sm text-ink-soft">Signing you in…</p>
  );
}

export default function ConfirmPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <Confirm />
      </Suspense>
    </div>
  );
}
