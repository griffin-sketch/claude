"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { APP_NAME } from "@/lib/config";

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get("next") || "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [verifying, setVerifying] = useState(false);

  // The 6-digit code works on any device, even when the link opens in another browser.
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setMessage("");
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setVerifying(false);
    if (error) setMessage(error.message);
    else router.replace(safeNext);
  }

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
      <p className="mt-1 text-sm text-ink-soft">We&apos;ll email you a sign-in code. No password needed.</p>
      {state === "sent" ? (
        <form onSubmit={verify} className="mt-6 space-y-4">
          <p className="rounded-lg bg-gold-soft p-4 text-sm">
            We sent an email to <strong>{email}</strong>. Type the code from it below, or click the link in the
            email on this device.
          </p>
          <div>
            <label htmlFor="code" className="label">
              Code from the email
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              pattern="[0-9]{6,8}"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="input text-center text-lg tracking-[0.4em]"
              placeholder="123456"
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={verifying || code.length < 6}>
            {verifying ? "Checking…" : "Sign in"}
          </button>
          {message && <p className="text-sm text-danger">{message}</p>}
          <button
            type="button"
            className="w-full text-center text-xs text-ink-soft underline"
            onClick={() => {
              setState("idle");
              setCode("");
              setMessage("");
            }}
          >
            Use a different email or send a new code
          </button>
        </form>
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
            {state === "sending" ? "Sending…" : "Email me a code"}
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
