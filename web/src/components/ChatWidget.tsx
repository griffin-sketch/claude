"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

type Msg = { role: "user" | "assistant"; content: string };
const KEY = "tourvo-chat";
const SUGGESTIONS = ["How does Tourvo work?", "What do the plans include?", "Can I stage an empty room?", "How do referrals work?"];
const GREETING = "Hi! I'm the Tourvo assistant. Ask me anything about making listing videos, plans, staging or your account.";

/** Turns [text](/path) and bare https links into links; keeps everything else as text. */
function rich(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)|(\*\*([^*]+)\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[5]) out.push(<b key={k++}>{m[5]}</b>);
    else {
      const href = m[2] ?? m[3];
      const label = m[1] ?? m[3];
      const internal = href.startsWith("/");
      out.push(
        internal ? (
          <Link key={k++} href={href} className="font-semibold underline underline-offset-2">{label}</Link>
        ) : (
          <a key={k++} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">{label}</a>
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function ChatWidget() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [conv, setConv] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // restore this tab's conversation
  useEffect(() => {
    let saved: { conv?: string; msgs?: Msg[] } = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(KEY) || "{}");
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore from storage once
    setConv(saved.conv || crypto.randomUUID());
    if (saved.msgs?.length) setMsgs(saved.msgs);
  }, []);
  useEffect(() => {
    if (!conv) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ conv, msgs: msgs.slice(-30) }));
    } catch {}
  }, [conv, msgs]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  // hidden until the Claude API key is added in Vercel (then set NEXT_PUBLIC_CHAT_ENABLED=1)
  if (process.env.NEXT_PUBLIC_CHAT_ENABLED !== "1" || path.startsWith("/share")) return null;
  const lifted = path.startsWith("/listings/"); // clear the sticky Back/Next bar on phones

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      let token = "";
      try {
        token = (await supabase().auth.getSession()).data.session?.access_token ?? "";
      } catch {}
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ conversationId: conv, messages: next, page: path }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Something went wrong.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: acc }]);
      }
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: `${(e as Error).message} You can also email info@gettourvo.com.` }]);
    }
    setBusy(false);
  }

  function reset() {
    setMsgs([]);
    setConv(crypto.randomUUID());
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask Tourvo a question"
          className={`fixed right-4 z-40 flex min-h-14 items-center gap-2.5 rounded-full bg-accent px-4 text-white shadow-[0_10px_30px_rgba(43,32,28,0.25)] transition hover:bg-accent-deep sm:right-6 sm:bottom-6 sm:px-5 ${lifted ? "bottom-24" : "bottom-4"}`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M8.5 9.5h7M8.5 12.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="hidden text-[15px] font-semibold sm:inline">Ask Tourvo</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Ask Tourvo"
          className="fixed inset-0 z-50 flex flex-col bg-surface sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[620px] sm:max-h-[calc(100vh-48px)] sm:w-[400px] sm:overflow-hidden sm:rounded-[24px] sm:border sm:border-line sm:shadow-[0_20px_60px_rgba(43,32,28,0.22)]"
        >
          <div className="flex items-center justify-between gap-3 bg-accent px-5 py-4 text-white">
            <div>
              <p className="text-base font-bold">Ask Tourvo</p>
              <p className="text-xs text-white/80">AI assistant · answers in seconds</p>
            </div>
            <div className="flex items-center gap-1">
              {msgs.length > 0 && (
                <button type="button" onClick={reset} className="rounded-full px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/15">New chat</button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/15">
                <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-bg px-4 py-5">
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-surface px-4 py-3 text-[15px] leading-relaxed shadow-sm">{GREETING}</div>
            {msgs.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-gold-light bg-surface px-3.5 py-2 text-sm font-medium text-gold-deep hover:bg-gold-soft">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-ink px-4 py-3 text-[15px] leading-relaxed text-white">{m.content}</div>
              ) : (
                <div key={i} className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-md bg-surface px-4 py-3 text-[15px] leading-relaxed shadow-sm">
                  {m.content ? rich(m.content) : <span className="inline-flex gap-1 py-1" aria-label="Typing"><span className="h-2 w-2 animate-bounce rounded-full bg-muted" /><span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:150ms]" /><span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:300ms]" /></span>}
                </div>
              ),
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-line bg-surface px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, 1500))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="Type your question…"
                aria-label="Your question"
                className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-line bg-bg px-4 py-3 text-base outline-none focus:border-gold sm:text-[15px]"
              />
              <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid h-12 w-12 flex-none place-items-center rounded-full bg-accent text-white hover:bg-accent-deep disabled:opacity-40">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <p className="mt-2 px-1 text-[11px] text-muted">
              AI can make mistakes. For refunds or account help, email <a href="mailto:info@gettourvo.com" className="underline">info@gettourvo.com</a>.
            </p>
          </form>
        </div>
      )}
    </>
  );
}
