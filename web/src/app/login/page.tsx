"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

// Turn on once Google sign-in is set up in Supabase: Vercel variable NEXT_PUBLIC_GOOGLE_AUTH=1
const GOOGLE_ON = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

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
  const [googleBusy, setGoogleBusy] = useState(false);

  async function google() {
    setGoogleBusy(true);
    setMessage("");
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
    });
    if (error) {
      setGoogleBusy(false);
      setState("error");
      setMessage(error.message);
    }
  }

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
    <div className="w-full max-w-sm">
      <p className="eyebrow">Welcome</p>
      <h1 className="mt-3 font-display text-5xl font-medium leading-none">Sign in</h1>
      <p className="mt-3 text-sm text-ink-soft">No password needed. New here? This creates your free account.</p>
      {state !== "sent" && GOOGLE_ON && (
        <>
          <button type="button" onClick={google} disabled={googleBusy} className="btn-ghost mt-8 min-h-12 w-full">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            {googleBusy ? "Opening Google…" : "Continue with Google"}
          </button>
          <div className="my-5 flex items-center gap-3 text-xs text-ink-soft">
            <span className="h-px flex-1 bg-line" />
            or get a link by email
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      {state === "sent" ? (
        <form onSubmit={verify} className="mt-6 space-y-4">
          <p className="rounded-2xl bg-gold-soft p-4 text-sm leading-relaxed">
            We sent an email to <strong>{email}</strong>. Open it <strong>in this same browser</strong> and click
            the sign-in link. If your email shows a code instead, type it below.
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
        <form onSubmit={send} className={`space-y-4 ${GOOGLE_ON ? "" : "mt-8"}`}>
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
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside
        className="relative hidden flex-col justify-between bg-night bg-cover bg-center p-12 text-white lg:flex"
        style={{
          backgroundImage:
            "linear-gradient(180deg,rgba(10,12,15,.55) 0%,rgba(10,12,15,.1) 40%,rgba(10,12,15,.8) 100%),url(/home/living.jpg)",
        }}
      >
        <Link href="/" className="flex items-baseline gap-2.5">
          <span className="font-display text-[30px] font-semibold">KGB</span>
          <span className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E9DCC4]">Listing Videos</span>
        </Link>
        <div>
          <p className="font-display text-6xl font-medium leading-[0.95]">
            Your listing,
            <br />
            <span className="italic">in motion.</span>
          </p>
          <p className="mt-5 max-w-sm text-[#E7E7E4]">Cinematic walkthrough videos from your listing photos, branded for you.</p>
        </div>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="flex items-baseline gap-2.5 lg:hidden">
          <span className="font-display text-[26px] font-semibold">KGB</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold-deep">Listing Videos</span>
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="text-center text-xs text-muted">Sign up free. You only pay when you make a video.</p>
      </main>
    </div>
  );
}
