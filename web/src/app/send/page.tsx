"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { bookmarklet } from "@/lib/bookmarklet";

/** How to install the Send to Tourvo button (a bookmark) in the browser's bookmarks bar. */
function SendView() {
  const btn = useRef<HTMLAnchorElement>(null);
  const [code] = useState(() => (typeof window === "undefined" ? "" : bookmarklet(window.location.origin)));
  const [copied, setCopied] = useState(false);

  // React won't render javascript: links itself, so set it on the element directly
  useEffect(() => {
    if (code) btn.current?.setAttribute("href", code);
  }, [code]);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="eyebrow">Import photos</p>
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">Send to Tourvo</h1>
        <p className="mt-3 text-ink-soft">
          Bring a listing&apos;s photos straight in from Realtor.com, HAR, your MLS or your brokerage site. Open your listing, click the
          button, pick the photos, done. Works in Chrome, Edge, Safari and Firefox on a computer.
        </p>
      </div>

      <section className="card p-5 sm:p-6">
        <h2 className="font-semibold">1. Add the button to your bookmarks bar</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Drag this button up into your bookmarks bar. Don&apos;t see the bar? Press <kbd className="rounded bg-line px-1.5 py-0.5 text-xs">Ctrl+Shift+B</kbd> (
          <kbd className="rounded bg-line px-1.5 py-0.5 text-xs">⌘+Shift+B</kbd> on a Mac).
        </p>
        <div className="mt-5 flex justify-center">
          <a
            ref={btn}
            onClick={(e) => e.preventDefault()}
            className="btn-gold cursor-grab px-6 py-3 text-base"
            title="Drag me to your bookmarks bar"
          >
            ⇪ Send to Tourvo
          </a>
        </div>
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer text-ink-soft">Can&apos;t drag it? Add it by hand</summary>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink-soft">
            <li>Copy the button code: <button type="button" className="font-semibold text-ink underline underline-offset-4" onClick={copy}>{copied ? "Copied" : "Copy code"}</button></li>
            <li>Right-click your bookmarks bar and choose <b>Add page</b> (or <b>Add bookmark</b>).</li>
            <li>Name it <b>Send to Tourvo</b> and paste the code into the URL box. Save.</li>
          </ol>
        </details>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-semibold">2. Use it on your listing</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>Open your listing on Realtor.com, HAR, your MLS or your brokerage site.</li>
          <li>Scroll through or open the photo gallery once, so all the photos load.</li>
          <li>Click <b>Send to Tourvo</b> in your bookmarks bar. Tourvo opens in a new tab with the photos it found.</li>
          <li>Pick the photos and the listing, and they&apos;re added in order.</li>
        </ol>
        <p className="mt-4 text-xs text-muted">Only use it on your own listings, or ones you have permission to market.</p>
      </section>
    </div>
  );
}

export default function SendPage() {
  return <AppShell>{() => <SendView />}</AppShell>;
}
