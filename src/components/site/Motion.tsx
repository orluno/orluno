"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/*
 * All site motion in one place (recorded from the UI reference in referensi/recon-ui/MOTION.txt):
 *   - smooth wheel scrolling (Lenis), off with reduced motion;
 *   - [data-reveal] blocks fade up, [data-raster] headings print as dots then fill, [data-cells] squares pop in one by one,
 *     [data-draw] lines draw from the left — each once, when it enters the viewport;
 *   - [data-scramble] mono labels decode from noise glyphs on first view;
 *   - the right-edge scroll rail: one square per [data-sec] section, the current one filled, a bar for the viewport;
 *   - [data-railnum] sticky numerals turn to the number of the section in view.
 * html.motion is set before paint by MOTION_BOOT only without reduced motion; if this module never runs, the boot script
 * removes it after 4 s, so nothing can stay hidden. Hidden tabs: IntersectionObserver still reveals on the first frame back.
 */

const NOISE = "/:·=\\_.-:/";

function scramble(el: HTMLElement) {
  const final = el.dataset.final ?? el.textContent ?? "";
  el.dataset.final = final;
  const start = performance.now();
  const dur = 520 + Math.min(600, final.length * 18);
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / dur);
    const shown = Math.floor(final.length * k);
    let out = final.slice(0, shown);
    for (let i = shown; i < final.length; i++) out += final[i] === " " ? " " : NOISE[(i * 7 + Math.floor(now / 50)) % NOISE.length];
    el.textContent = out;
    if (k < 1) requestAnimationFrame(step);
    else el.textContent = final;
  };
  requestAnimationFrame(step);
}

export function Motion() {
  const path = usePathname();

  useEffect(() => {
    (window as unknown as { __olMotion?: boolean }).__olMotion = true;
    const on = document.documentElement.classList.contains("motion");
    const targets = [...document.querySelectorAll<HTMLElement>("[data-reveal],[data-raster],[data-cells],[data-draw],[data-scramble]")];
    if (!on) {
      targets.forEach((t) => t.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.classList.add("in");
          el.querySelectorAll<HTMLElement | SVGElement>(":scope > [data-draw]").forEach((d) => d.classList.add("in"));
          if (el.hasAttribute("data-scramble")) scramble(el);
          if (el.hasAttribute("data-cells")) el.querySelectorAll<HTMLElement>("i").forEach((c, i) => c.style.setProperty("--i", String(i % 40)));
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    // A [data-draw] element starts fully clipped (zero visible area), which an observer never reports: watch its parent.
    const watch = (t: HTMLElement) => io.observe(t.hasAttribute("data-draw") && t.parentElement ? t.parentElement : t);
    targets.forEach(watch);
    // Client-rendered parts (the report) mount later: watch them as they appear.
    const SEL = "[data-reveal],[data-raster],[data-cells],[data-draw],[data-scramble]";
    const mo = new MutationObserver((list) => {
      for (const m of list)
        m.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (n.matches(SEL)) watch(n as HTMLElement);
          n.querySelectorAll<HTMLElement>(SEL).forEach((x) => !x.classList.contains("in") && watch(x));
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [path]);

  // Smooth scrolling.
  useEffect(() => {
    if (!document.documentElement.classList.contains("motion")) return;
    let stop = () => {};
    let alive = true;
    import("lenis").then(({ default: Lenis }) => {
      if (!alive) return;
      const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
      let raf = 0;
      const loop = (t: number) => {
        lenis.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      stop = () => {
        cancelAnimationFrame(raf);
        lenis.destroy();
      };
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  // Scroll rail + section numerals.
  useEffect(() => {
    const rail = document.querySelector<HTMLElement>(".ol-rail");
    const secs = [...document.querySelectorAll<HTMLElement>("[data-sec]")];
    const nums = [...document.querySelectorAll<HTMLElement>("[data-railnum] span")];
    if (!rail) return;
    rail.innerHTML = "";
    if (!secs.length) return;
    const marks = secs.map(() => {
      const m = document.createElement("i");
      m.className = "mark";
      rail.appendChild(m);
      return m;
    });
    const bar = document.createElement("i");
    bar.className = "bar";
    rail.appendChild(bar);
    let current = -1;
    const update = () => {
      const H = document.documentElement.scrollHeight;
      const h = rail.clientHeight;
      secs.forEach((s, i) => {
        const top = s.getBoundingClientRect().top + scrollY;
        marks[i].style.top = `${(top / H) * h}px`;
      });
      bar.style.top = `${(scrollY / H) * h}px`;
      bar.style.height = `${Math.max(16, (innerHeight / H) * h)}px`;
      let idx = 0;
      secs.forEach((s, i) => {
        if (s.getBoundingClientRect().top < innerHeight * 0.45) idx = i;
      });
      if (idx !== current) {
        current = idx;
        marks.forEach((m, i) => m.classList.toggle("on", i === idx));
        const label = secs[idx].dataset.sec ?? "";
        for (const n of /^[1-9]$/.test(label) ? nums : []) {
          if (n.textContent === label) continue;
          n.textContent = label;
          n.classList.remove("turn");
          void n.offsetWidth;
          n.classList.add("turn");
        }
      }
    };
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    return () => {
      removeEventListener("scroll", update);
      removeEventListener("resize", update);
    };
  }, [path]);

  return null;
}
