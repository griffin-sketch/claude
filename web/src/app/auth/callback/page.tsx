"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Landing spot for the emailed sign-in link.
 * The Supabase client swaps the one-time ?code= for a session by itself when it loads,
 * so this page only waits for that session (calling the exchange again would fail with
 * "code verifier not found").
 */
function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const next = params.get("next") || "/dashboard";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    const urlError = params.get("error_description");
    const sb = supabase();
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      router.replace(safeNext);
    };

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    (async () => {
      // getSession waits for the client to finish reading the link.
      const { data } = await sb.auth.getSession();
      if (data.session) return finish();
      // Give the automatic exchange a moment, then report.
      setTimeout(async () => {
        const again = await sb.auth.getSession();
        if (again.data.session) return finish();
        setError(
          urlError ||
            "This sign-in link didn't work here. It may have opened in a different browser than the one you used, or it expired. Use the 6-digit code from the same email instead.",
        );
      }, 2500);
    })();

    return () => sub.subscription.unsubscribe();
  }, [params, router]);

  return error ? (
    <div className="card max-w-sm p-8 text-sm">
      <p className="text-danger">{error}</p>
      <a href="/login" className="btn-primary mt-4">
        Back to sign in
      </a>
    </div>
  ) : (
    <p className="text-sm text-ink-soft">Signing you in…</p>
  );
}

export default function CallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <Callback />
      </Suspense>
    </div>
  );
}
