"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

/** Landing spot for the emailed sign-in link: swaps the one-time code for a session. */
function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = params.get("code");
    const next = params.get("next") || "/dashboard";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    (async () => {
      const sb = supabase();
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) {
          setError(error.message);
          return;
        }
      }
      const { data } = await sb.auth.getSession();
      if (data.session) router.replace(safeNext);
      else setError("That sign-in link has expired. Request a new one.");
    })();
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
