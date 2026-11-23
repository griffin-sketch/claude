"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

/**
 * The homepage's motion layer (GSAP + ScrollTrigger + Lenis). The page itself stays plain markup; elements opt in
 * with data attributes:
 *   data-split          headline: words rise into place as it scrolls into view (on load for the hero)
 *   data-stagger        its children fade up one after another
 *   data-parallax="n"   drifts n% against the scroll
 *   data-scrub-film     pinned block: its <video> plays with the scroll, [data-step] captions light up in turn
 * Everything is skipped for visitors who prefer reduced motion.
 */
export function HomeMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);

    // weighted, smooth scrolling, kept in step with ScrollTrigger
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    // in-page links (#how, #pricing ...) glide instead of jumping
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href^='#']") as HTMLAnchorElement | null;
      if (!a || a.getAttribute("href") === "#") return;
      const el = document.querySelector(a.getAttribute("href")!);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el as HTMLElement, { offset: -90 });
    };
    document.addEventListener("click", onClick);

    const ctx = gsap.context(() => {
      // headlines: split into words (kept intact for screen readers via aria-label)
      document.querySelectorAll<HTMLElement>("[data-split]").forEach((el, n) => {
        if (el.dataset.splitDone) return;
        el.dataset.splitDone = "1";
        el.setAttribute("aria-label", el.textContent ?? "");
        const wrap = (node: Node): Node[] => {
          if (node.nodeType === Node.TEXT_NODE) {
            return (node.textContent ?? "").split(/(\s+)/).filter(Boolean).map((w) => {
              if (/^\s+$/.test(w)) return document.createTextNode(w);
              const outer = document.createElement("span");
              outer.className = "inline-block overflow-hidden align-bottom pb-[0.08em] -mb-[0.08em]";
              outer.setAttribute("aria-hidden", "true");
              const inner = document.createElement("span");
              inner.className = "inline-block will-change-transform";
              inner.dataset.word = "";
              inner.textContent = w;
              outer.appendChild(inner);
              return outer;
            });
          }
          const clone = node.cloneNode(false) as HTMLElement;
          node.childNodes.forEach((c) => wrap(c).forEach((x) => clone.appendChild(x)));
          if (clone.nodeType === Node.ELEMENT_NODE) clone.setAttribute("aria-hidden", "true");
          return [clone];
        };
        const kids = [...el.childNodes];
        el.textContent = "";
        kids.forEach((c) => wrap(c).forEach((x) => el.appendChild(x)));
        const words = el.querySelectorAll("[data-word]");
        const hero = n === 0 && el.tagName === "H1";
        gsap.from(words, {
          yPercent: 110, duration: hero ? 1.1 : 0.9, ease: "expo.out", stagger: hero ? 0.06 : 0.035, delay: hero ? 0.15 : 0,
          ...(hero ? {} : { scrollTrigger: { trigger: el, start: "top 85%", once: true } }),
        });
      });

      // hero picture: opens up from a slightly smaller, rounder frame
      const heroMedia = document.querySelector<HTMLElement>("[data-hero-media]");
      if (heroMedia) {
        gsap.from(heroMedia, { clipPath: "inset(8% 8% 8% 8% round 48px)", scale: 1.06, duration: 1.4, ease: "expo.out", delay: 0.25 });
      }

      document.querySelectorAll<HTMLElement>("[data-stagger]").forEach((el) => {
        gsap.from(el.children, {
          y: 40, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.09,
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        });
      });

      document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
        const amt = Number(el.dataset.parallax) || 8;
        gsap.fromTo(el, { yPercent: amt / 2 }, { yPercent: -amt / 2, ease: "none", scrollTrigger: { trigger: el, scrub: true } });
      });

      // the photo-to-walkthrough film: pinned while the camera move plays with the scroll
      document.querySelectorAll<HTMLElement>("[data-scrub-film]").forEach((block) => {
        const video = block.querySelector("video");
        const steps = [...block.querySelectorAll<HTMLElement>("[data-step]")];
        const frame = block.querySelector<HTMLElement>("[data-film-frame]");
        const st = { t: 0 };
        // Safari (iPhone and Mac) won't jump around in a streamed video it hasn't played, so load the whole clip into
        // memory first; then every frame can be shown instantly as the visitor scrolls.
        if (video) {
          const src = video.currentSrc || video.getAttribute("src");
          if (src) {
            fetch(src)
              .then((r) => r.blob())
              .then((b) => {
                const url = URL.createObjectURL(b);
                video.src = url;
                video.load();
                video.addEventListener("loadeddata", () => { video.currentTime = st.t * (video.duration - 0.05); }, { once: true });
              })
              .catch(() => {});
          }
          // iPhones only decode frames after a play() call; start and stop at once so seeking works
          video.play().then(() => video.pause()).catch(() => {});
        }
        const setStep = (p: number) => {
          const i = Math.min(steps.length - 1, Math.floor(p * steps.length));
          steps.forEach((s, k) => s.classList.toggle("is-on", k === i));
        };
        setStep(0);
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: block, start: "top top", end: "+=220%", pin: true, scrub: 0.6,
            onUpdate: (self) => setStep(self.progress),
          },
        });
        if (frame) tl.fromTo(frame, { scale: 0.86, borderRadius: 40 }, { scale: 1, borderRadius: 24, ease: "none", duration: 0.25 }, 0);
        tl.to(st, {
          t: 1, ease: "none", duration: 1,
          onUpdate: () => { if (video && video.duration) video.currentTime = st.t * (video.duration - 0.05); },
        }, 0);
      });

      // platform logos: a slow, steady glide (no speed-ups)
      document.querySelectorAll<HTMLElement>("[data-marquee]").forEach((row) => {
        const track = row.firstElementChild as HTMLElement | null;
        if (track) gsap.to(track, { xPercent: -50, ease: "none", duration: 40, repeat: -1 });
      });
    });

    return () => {
      document.removeEventListener("click", onClick);
      ctx.revert();
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);
  return null;
}
