import Link from "next/link";

const LOOKS = [
  { id: 1, name: "Signature Gold", note: "Classic luxury" },
  { id: 2, name: "Editorial", note: "Magazine serif" },
  { id: 7, name: "Coastal Glass", note: "Frosted and modern" },
  { id: 5, name: "Terracotta", note: "Bold boutique" },
  { id: 9, name: "Golden Hour", note: "Script and gold" },
  { id: 10, name: "Cinema", note: "Letterboxed" },
];

const STEPS = [
  {
    img: "/home/living.jpg",
    alt: "Living room listing photo",
    title: "Upload your photos",
    body: "Drop in 3 to 20 listing photos in the order you want them shown. Lead with the front of the home, then label each room.",
  },
  {
    img: "/templates/t1.jpg",
    alt: "A finished title card in the Signature Gold look",
    title: "Pick a look",
    body: "Choose one of ten designed title-and-label styles. Your name, brokerage, phone, headshot and logo go on the closing card.",
  },
  {
    img: "/home/kitchen.jpg",
    alt: "Kitchen listing photo",
    title: "Review, then download",
    body: "Watch every clip. Redo any shot you don't love at no charge. Then download a 16:9 video for MLS and YouTube and a 9:16 one for Reels and TikTok.",
  },
];

const FAQ = [
  ["Will it change how the home looks?", "No. The camera moves, the room stays as photographed. If a clip ever looks off, redo it before your video is made."],
  ["What photos work best?", "Your professional listing photos, wide and well lit. Phone photos work too, though bright, level shots give the smoothest moves."],
  ["How long does it take?", "About 5 to 10 minutes for the clips, then a few minutes to build the finished videos. You can close the page while it works."],
  ["Can I use it for any listing?", "Yes: houses, condos, land and rentals. Use photos you have the rights to share."],
];

const pad = "px-[max(20px,4vw)]";
const wrap = "mx-auto w-full max-w-[1320px]";
const h2 = "font-display text-[clamp(38px,4.4vw,60px)] font-medium leading-[1.05] text-balance";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="bg-bg text-ink">
      {/* Nav */}
      <header className={`absolute inset-x-0 top-0 z-10 pt-7 ${pad}`}>
        <div className={`${wrap} flex items-center justify-between gap-4`}>
          <Link href="/" className="flex items-baseline gap-2.5 text-white">
            <span className="font-display text-[30px] font-semibold tracking-[0.02em]">KGB</span>
            <span className="hidden text-xs font-semibold uppercase tracking-[0.28em] text-[#E9DCC4] sm:inline">Listing Videos</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-5 whitespace-nowrap text-sm font-medium text-white sm:gap-7">
            <a href="#how" className="hidden hover:text-[#E9DCC4] sm:inline">How it works</a>
            <a href="#looks" className="hidden hover:text-[#E9DCC4] sm:inline">The looks</a>
            <a href="#pricing" className="hidden hover:text-[#E9DCC4] sm:inline">Pricing</a>
            <Link href="/login" className="hover:text-[#E9DCC4]">Sign in</Link>
            <Link href="/login" className="inline-flex min-h-11 items-center rounded-full bg-white px-5 font-semibold text-ink hover:bg-[#F1EBE1]">
              Make a video
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative flex min-h-[680px] items-end bg-night bg-cover pt-36 sm:min-h-[760px]"
        style={{
          backgroundImage:
            "linear-gradient(180deg,rgba(10,12,15,.55) 0%,rgba(10,12,15,.05) 30%,rgba(10,12,15,.10) 55%,rgba(10,12,15,.82) 100%),url(/home/house.jpg)",
          backgroundPosition: "center 40%",
        }}
      >
        <div className={`${wrap} flex flex-wrap items-end justify-between gap-10 pb-[72px] ${pad}`}>
          <div className="min-w-0 flex-[1_1_560px] text-white">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-[#E9DCC4]">For listing agents</p>
            <h1 className="font-display text-[clamp(52px,7vw,104px)] font-medium leading-[0.95] tracking-[-0.01em]">
              Your listing,
              <br />
              <span className="italic">in motion.</span>
            </h1>
            <p className="mt-7 max-w-[520px] text-lg leading-relaxed text-[#E7E7E4]">
              Upload your listing photos. We turn each room into a smooth, cinematic camera move and finish it with your
              branding. A walkthrough video ready for MLS and Reels in about 15 minutes.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3.5">
              <Link href="/login" className="inline-flex min-h-[52px] items-center rounded-full bg-gold px-7 text-base font-semibold text-white hover:bg-gold-deep">
                Make your first video
              </Link>
              <a href="#how" className="inline-flex min-h-[52px] items-center gap-2.5 rounded-full border border-white/55 px-6 text-base font-medium text-white hover:bg-white/10">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M3 1.5v11l9-5.5z" fill="#FFFFFF" />
                </svg>
                See how it works
              </a>
            </div>
          </div>
          <div className="hidden min-w-0 flex-[0_1_300px] flex-col gap-2.5 rounded-[18px] md:flex border border-white/20 bg-[rgba(18,20,23,.55)] px-6 py-5 text-white backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#E9DCC4]">Now playing</p>
            <p className="font-display text-[26px] font-medium leading-tight">Sample listing · Front exterior</p>
            <p className="text-[13px] text-[#CFCFCB]">Slow drone-style rise, 5 seconds</p>
            <div className="h-[3px] rounded bg-white/20">
              <div className="h-[3px] w-[38%] rounded bg-[#E9DCC4]" />
            </div>
          </div>
        </div>
      </section>

      {/* Still to walkthrough */}
      <section className={`pb-24 pt-28 ${pad}`}>
        <div className={`${wrap} flex flex-wrap items-center gap-16`}>
          <div className="min-w-0 flex-[1_1_380px]">
            <p className="eyebrow mb-4">From still to walkthrough</p>
            <h2 className={h2}>The camera moves through the home, not across a slideshow.</h2>
            <p className="mt-6 max-w-[520px] text-[17px] leading-[1.7] text-ink-soft">
              Each photo becomes a five-second shot with real depth: a push into the living room, a glide toward the
              kitchen island, a rise over the front lawn. Nothing in the room is added or moved. Every clip is yours to
              review before the video is made.
            </p>
          </div>
          <div className="grid min-w-0 flex-[1.3_1_520px] grid-cols-3 gap-2.5">
            {[
              ["/home/frame1.jpg", "0.0 s", "Front of the home, first frame"],
              ["/home/frame2.jpg", "2.5 s", "The camera moving closer"],
              ["/home/frame3.jpg", "5.0 s", "The camera arriving at the front door"],
            ].map(([src, t, alt]) => (
              <figure key={t} className="flex flex-col gap-2.5">
                <img src={src} alt={alt} className="aspect-video w-full rounded-[10px] object-cover" />
                <figcaption className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{t}</figcaption>
              </figure>
            ))}
            <p className="col-span-3 mt-1.5 text-[13px] text-muted">One listing photo, three moments from its camera move.</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className={`scroll-mt-6 border-y border-line bg-white py-24 ${pad}`}>
        <div className={`${wrap} flex flex-col gap-14`}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className={h2}>Three steps. About fifteen minutes.</h2>
            <p className="max-w-[380px] leading-relaxed text-ink-soft">
              No filming, no editing software, no waiting on a videographer&apos;s schedule.
            </p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-10">
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex flex-col gap-[18px]">
                <img src={s.img} alt={s.alt} className="aspect-[4/3] w-full rounded-[14px] object-cover" />
                <div className="flex items-baseline gap-3.5">
                  <span className="font-display text-[40px] font-medium text-gold">{i + 1}</span>
                  <h3 className="text-xl font-semibold">{s.title}</h3>
                </div>
                <p className="text-[15px] leading-[1.65] text-ink-soft">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Looks */}
      <section id="looks" className={`scroll-mt-6 pb-24 pt-28 ${pad}`}>
        <div className={`${wrap} flex flex-col gap-12`}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="eyebrow mb-4">Ten looks</p>
              <h2 className={h2}>Designed to match the home.</h2>
            </div>
            <p className="max-w-[380px] leading-relaxed text-ink-soft">
              From quiet magazine serif to bold boutique type. Six of the ten, shown on the same title card.
            </p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-x-6 gap-y-7">
            {LOOKS.map((l) => (
              <figure key={l.id} className="flex flex-col gap-3">
                <img src={`/templates/t${l.id}.jpg`} alt={`${l.name} title card`} className="aspect-video w-full rounded-xl object-cover" />
                <figcaption className="flex justify-between gap-3 text-[15px]">
                  <span className="font-semibold">{l.name}</span>
                  <span className="text-muted">{l.note}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className={`bg-night py-[104px] text-[#F2F1EE] ${pad}`}>
        <div className={`${wrap} flex flex-wrap items-center gap-16`}>
          <div className="relative min-w-0 flex-[1.2_1_520px]">
            <img src="/home/pool.jpg" alt="Backyard pool at dusk, shown as a 16:9 video" className="aspect-video w-full rounded-[14px] object-cover" />
            <img
              src="/home/pool.jpg"
              alt="The same shot as a vertical 9:16 video"
              className="absolute -bottom-9 right-0 aspect-[9/16] w-[26%] rounded-[14px] border-4 border-night object-cover object-[60%_center] sm:-right-3"
            />
          </div>
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-7">
            <h2 className="font-display text-[clamp(38px,4.4vw,58px)] font-medium leading-[1.05]">One upload. Every place you post.</h2>
            <ul className="flex flex-col gap-[22px]">
              {[
                ["16:9 video", "for MLS, YouTube and your website"],
                ["9:16 video", "for Instagram Reels, TikTok and Shorts, made from the same clips"],
                ["Your branding", "on the closing card: name, brokerage, phone, headshot, logo"],
                ["Free redos", "on any clip before your video is built"],
              ].map(([b, rest]) => (
                <li key={b} className="flex items-start gap-4">
                  <span className="mt-[13px] h-px w-[18px] flex-none bg-gold-light" />
                  <span className="leading-relaxed">
                    <strong className="font-semibold">{b}</strong> <span className="text-[#B9BBBF]">{rest}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className={`scroll-mt-6 pb-[104px] pt-[120px] ${pad}`}>
        <div className="mx-auto flex max-w-[1100px] flex-col gap-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="eyebrow">Pricing</p>
            <h2 className={h2}>Less than one hour of a videographer&apos;s time.</h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-6">
            <div className="flex flex-col gap-5 rounded-[20px] border border-line bg-white p-8 sm:p-10">
              <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">Single listing</p>
              <p className="flex items-baseline gap-2">
                <span className="font-display text-[72px] font-medium leading-none">$49</span>
                <span className="text-[15px] text-muted">per video</span>
              </p>
              <p className="text-[15px] leading-relaxed text-ink-soft">Pay for the listing in front of you. Both formats and clip redos included.</p>
              <Link href="/login" className="mt-auto inline-flex min-h-[52px] items-center justify-center rounded-full border border-ink text-base font-semibold hover:bg-ink hover:text-white">
                Make one video
              </Link>
            </div>
            <div className="flex flex-col gap-5 rounded-[20px] bg-ink p-8 text-[#F2F1EE] sm:p-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-gold-light">Monthly</p>
                <span className="rounded-full bg-[rgba(201,168,119,.16)] px-3 py-1.5 text-xs font-semibold text-[#E9DCC4]">About $27 a video</span>
              </div>
              <p className="flex items-baseline gap-2">
                <span className="font-display text-[72px] font-medium leading-none">$80</span>
                <span className="text-[15px] text-[#B9BBBF]">per month</span>
              </p>
              <p className="text-[15px] leading-relaxed text-[#C8C9CC]">Three listing videos every month for agents who list often. Cancel anytime.</p>
              <Link href="/login" className="mt-auto inline-flex min-h-[52px] items-center justify-center rounded-full bg-gold text-base font-semibold text-white hover:bg-gold-deep">
                Start the monthly plan
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={`pb-28 ${pad}`}>
        <div className="mx-auto grid max-w-[1100px] grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-x-14 gap-y-10 border-t border-line pt-16">
          {FAQ.map(([q, a]) => (
            <div key={q} className="flex flex-col gap-2.5">
              <h3 className="text-[17px] font-semibold">{q}</h3>
              <p className="text-[15px] leading-[1.65] text-ink-soft">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing */}
      <section
        className={`bg-night bg-cover bg-center py-[140px] text-white ${pad}`}
        style={{
          backgroundImage:
            "linear-gradient(90deg,rgba(10,12,15,.86) 0%,rgba(10,12,15,.55) 60%,rgba(10,12,15,.35) 100%),url(/home/kitchen.jpg)",
        }}
      >
        <div className={`${wrap} flex flex-col items-start gap-7`}>
          <h2 className="max-w-[760px] font-display text-[clamp(44px,5.6vw,80px)] font-medium leading-none text-balance">
            Your next listing deserves a <span className="italic">walkthrough.</span>
          </h2>
          <div className="flex flex-wrap gap-3.5">
            <Link href="/login" className="inline-flex min-h-[54px] items-center gap-3 rounded-full bg-white px-7 text-base font-semibold text-ink hover:bg-[#F1EBE1]">
              <GoogleIcon />
              Start with Google
            </Link>
            <Link href="/login" className="inline-flex min-h-[54px] items-center rounded-full border border-white/55 px-6 text-base font-medium text-white hover:bg-white/10">
              Use my email instead
            </Link>
          </div>
          <p className="text-sm text-[#CFCFCB]">Sign up free. You only pay when you make a video.</p>
        </div>
      </section>

      <footer className={`bg-[#0D0F11] py-10 text-[#9A9DA3] ${pad}`}>
        <div className={`${wrap} flex flex-wrap justify-between gap-5 text-[13px]`}>
          <span>© {new Date().getFullYear()} KGB Marketing LLC · Texas</span>
          <Link href="/login" className="hover:text-white">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
