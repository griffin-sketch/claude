"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { APP_NAME } from "@/lib/config";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirect },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else {
      setState("sent");
    }
  }

  return (
    <div className="card w-full max-w-sm p-8">
      <h1 className="text-xl font-bold">Sign in to {APP_NAME}</h1>
      <p className="mt-1 text-sm text-ink-soft">We&apos;ll email you a sign-in link. No password needed.</p>
      {state === "sent" ? (
        <p className="mt-6 rounded-lg bg-gold-soft p-4 text-sm">
          Check <strong>{email}</strong> for your sign-in link. You can close this tab.
        </p>
      ) : (
        <form onSubmit={send} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@brokerage.com"
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Email me a link"}
          </button>
          {state === "error" && <p className="text-sm text-danger">{message}</p>}
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
