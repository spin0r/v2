// ====== TOAST ======
export function toast(msg, type = "success") {
  const container =
    document.querySelector(".toast-container") ||
    (() => {
      const c = document.createElement("div");
      c.className = "toast-container";
      document.body.appendChild(c);
      return c;
    })();
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === "success" ? "✓" : "×"}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ====== DATE FORMATTING ======
export function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function formatRssDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (isNaN(d)) return isoStr;
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  let rel;
  if (diffMins < 1) rel = "Just now";
  else if (diffMins < 60) rel = `${diffMins}m ago`;
  else if (diffHours < 24) rel = `${diffHours}h ago`;
  else if (diffDays < 7) rel = `${diffDays}d ago`;
  else rel = "";
  const pad = (n) => String(n).padStart(2, "0");
  const ist = new Date(
    d.getTime() + (5.5 * 60 * 60 * 1000 + d.getTimezoneOffset() * 60000),
  );
  const date = `${pad(ist.getDate())}/${pad(ist.getMonth() + 1)}/${ist.getFullYear()} ${pad(ist.getHours())}:${pad(ist.getMinutes())} IST`;
  return rel ? `${rel} · ${date}` : date;
}

// ====== SVG ICONS ======
export function svgIcon(name) {
  const icons = {
    search: `<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    arrow_right: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
    chevron_left: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
    chevron_right: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
    copy: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    copy_all: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    external: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
    download: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    viper: `<img src="/web.svg" style="width: 1em; height: 1em;" alt="Viper">`,
  };
  return icons[name] || "";
}

// ====== COPY TEXT ======
export function copyText(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      toast("Copied!", "success");
    })
    .catch(() => {
      toast("Copy failed", "error");
    });
}

// ====== CMD TEXT HELPER ======
export function getCmdText(result) {
  if (!result || !result.ok) return "";
  return (
    [result.sendCommand, result.dlCommand].filter(Boolean).join("\n") + "\n"
  );
}

// ====== CELEBRATION ======
function playSuccessSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.05);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 300);
  } catch (e) {
    /* audio not supported */
  }
}

function fireConfetti() {
  if (typeof confetti !== "function") return;
  const end = Date.now() + 600;
  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors: ["#c08532", "#e6a84d", "#f0c674", "#4ade80"],
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: ["#c08532", "#e6a84d", "#f0c674", "#4ade80"],
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

export function celebrate() {
  playSuccessSound();
  fireConfetti();
}

// ====== TIMER ======
let timerInterval = null;

export function startTimerLoop(state) {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    let needsUpdate = false;
    // Search timer
    if (state.searchStartTime) {
      state.searchElapsed = (
        (Date.now() - state.searchStartTime) /
        1000
      ).toFixed(1);
      const el = document.querySelector("#search-timer");
      if (el) el.textContent = `${state.searchElapsed}s`;
      needsUpdate = true;
    }
    if (!needsUpdate) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }, 100);
}

// ====== URL DETECTION ======
export function isThreadUrl(str) {
  return (
    /^https?:\/\/(www\.)?(vipergirls\.to|viper\.to)\/(threads|showpost\.php)/i.test(
      str,
    ) || /^https?:\/\/(www\.)?adultphotosets\.com\/.+/i.test(str)
  );
}
