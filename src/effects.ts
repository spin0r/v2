// ====== SCRAMBLE EFFECT ======
const CHARS = "0123456789!@#$%^&*ABCDEFabcdef";

interface ScrambleElement extends HTMLElement {
  _scrambleRaf?: number;
}

export function scramble(el: ScrambleElement): void {
  const original = el.dataset.originalText || el.textContent || "";
  el.dataset.originalText = original;
  const len = original.length;
  let raf: number;
  let start: number | null = null;
  const rand = () => CHARS[Math.floor(Math.random() * CHARS.length)];
  const tick = (ts: number) => {
    if (!start) start = ts;
    const t = ts - start - 150;
    const p = Math.max(0, Math.min(1, t / 500));
    let out = "";
    for (let i = 0; i < len; i++) {
      out += p >= i / Math.max(1, len - 1) ? original[i] : rand();
    }
    el.textContent = out;
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  if (el._scrambleRaf) cancelAnimationFrame(el._scrambleRaf);
  raf = requestAnimationFrame(tick);
  el._scrambleRaf = raf;
}

export function unscramble(el: ScrambleElement): void {
  if (el._scrambleRaf) cancelAnimationFrame(el._scrambleRaf);
  el.textContent = el.dataset.originalText || el.textContent;
}

export function initScramble(root: Document | HTMLElement = document): void {
  root.querySelectorAll<ScrambleElement>('.glitch, [data-effect="scramble"]').forEach((el) => {
    el.addEventListener("mouseenter", () => scramble(el));
    el.addEventListener("mouseleave", () => unscramble(el));
  });
}

// ====== FADE IN ON SCROLL ======
export function initFadeIn(root: Document | HTMLElement = document): void {
  const els = root.querySelectorAll<HTMLElement>(".fade-in");
  if (!els.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).style.opacity = "1";
          (e.target as HTMLElement).style.transform = "none";
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.1 },
  );
  els.forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(20px)";
    el.style.transition = "opacity 0.5s ease, transform 0.5s ease";
    io.observe(el);
  });
}

// ====== ANIMATE LINE (underline hover) ======
export function initAnimateLine(root: Document | HTMLElement = document): void {
  root.querySelectorAll<HTMLElement>(".animate-line").forEach((el) => {
    if (!el.querySelector(".animate-line__text")) {
      const span = document.createElement("span");
      span.className = "animate-line__text";
      while (el.firstChild) span.appendChild(el.firstChild);
      el.appendChild(span);
    }
  });
}
