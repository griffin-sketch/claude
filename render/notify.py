"""Customer emails from the render worker, sent with Resend (resend.com).

Turned off until RESEND_API_KEY is set in Railway. EMAIL_FROM must be an address on a domain verified in
Resend, e.g. "Tourvo <videos@gettourvo.com>". SITE_URL is where links point.
"""
import html, os
import requests

KEY = os.environ.get("RESEND_API_KEY", "").strip()
FROM = os.environ.get("EMAIL_FROM", "Tourvo <onboarding@resend.dev>").strip()
SITE = os.environ.get("SITE_URL", "https://www.gettourvo.com").rstrip("/")
BLUE, INK, SOFT = "#C4553A", "#2B201C", "#5B4B44"  # Clay brand


def _page(heading, body, button, url):
    return f"""<!doctype html><html><body style="margin:0;background:#F5F7FA;font-family:Helvetica,Arial,sans-serif;color:{INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:22px;font-weight:800;font-style:italic;letter-spacing:-0.5px;color:{INK}">Tourvo</td></tr>
<tr><td style="padding-top:24px;font-size:24px;font-weight:700;line-height:1.25">{heading}</td></tr>
<tr><td style="padding-top:12px;font-size:16px;line-height:1.6;color:{SOFT}">{body}</td></tr>
<tr><td style="padding-top:24px"><a href="{url}" style="display:inline-block;background:{BLUE};color:#ffffff;text-decoration:none;
font-weight:700;font-size:16px;padding:14px 26px;border-radius:999px">{button}</a></td></tr>
<tr><td style="padding-top:28px;font-size:12px;color:#8A96A8">You're getting this because you made a listing video on Tourvo.</td></tr>
</table></td></tr></table></body></html>"""


def send(to, subject, heading, body, button, url):
    """Best effort: an email problem never stops a video."""
    if not KEY or not to:
        return False
    try:
        r = requests.post("https://api.resend.com/emails", timeout=20,
                          headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
                          json={"from": FROM, "to": [to], "subject": subject, "html": _page(heading, body, button, url)})
        return r.ok
    except Exception:
        return False


def _where(l):
    return html.escape(l.get("address") or "your listing")


def clips_ready(to, l):
    return send(to, "Your clips are ready to review", "Your clips are ready",
                f"The camera moves for <b>{_where(l)}</b> are done. Take a quick look, redo any you don't love, "
                "then click <b>Make my Reel pack</b>.", "Review my clips", f"{SITE}/listings/{l['id']}")


def pack_ready(to, l, count):
    return send(to, "Your Reel pack is ready", "Your videos are ready to post",
                f"{count} videos for <b>{_where(l)}</b> are ready to download: the full walkthrough plus short Reels "
                "for Instagram, TikTok and YouTube Shorts.", "Get my videos", f"{SITE}/listings/{l['id']}")


def failed(to, l, reason):
    return send(to, "We hit a snag with your listing video", "Something went wrong",
                f"We couldn't finish the video for <b>{_where(l)}</b>: {html.escape(reason or 'unknown error')}. "
                "Open the listing to try again. Nothing extra is charged for a retry.", "Open my listing", f"{SITE}/listings/{l['id']}")
