import confetti from "canvas-confetti";

// ====== TOAST ======
export function toast(msg: string, type: "success" | "error" = "success"): void {
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
export function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function formatRssDate(isoStr: string): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  let rel: string;
  if (diffMins < 1) rel = "Just now";
  else if (diffMins < 60) rel = `${diffMins}m ago`;
  else if (diffHours < 24) rel = `${diffHours}h ago`;
  else if (diffDays < 7) rel = `${diffDays}d ago`;
  else rel = "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const ist = new Date(
    d.getTime() + (5.5 * 60 * 60 * 1000 + d.getTimezoneOffset() * 60000),
  );
  const date = `${pad(ist.getDate())}/${pad(ist.getMonth() + 1)}/${ist.getFullYear()} ${pad(ist.getHours())}:${pad(ist.getMinutes())} IST`;
  return rel ? `${rel} · ${date}` : date;
}

// ====== SVG ICONS ======
export function svgIcon(name: string): string {
  const icons: Record<string, string> = {
    search: `<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    arrow_right: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
    chevron_left: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
    chevron_right: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
    chevrons_left: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>`,
    chevrons_right: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>`,
    copy: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    copy_all: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    external: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
    download: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    filter: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
    viper: `<svg width="1em" height="1em" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_7_2)">
<path d="M512.001 325.499C512.001 332.623 512.001 339.739 511.96 346.863C511.925 352.862 511.857 358.861 511.692 364.853C511.336 377.921 510.568 391.098 508.244 404.022C505.885 417.131 502.039 429.328 495.978 441.244C490.02 452.947 482.232 463.663 472.949 472.953C463.659 482.244 452.949 490.025 441.239 495.983C429.33 502.044 417.126 505.89 404.017 508.249C391.094 510.573 377.916 511.341 364.848 511.697C358.849 511.862 352.857 511.93 346.858 511.965C339.735 512.013 332.618 512.006 325.494 512.006H186.494C179.37 512.006 172.254 512.006 165.13 511.965C159.131 511.93 153.132 511.862 147.14 511.697C134.072 511.341 120.895 510.573 107.971 508.249C94.862 505.89 82.665 502.044 70.7491 495.983C59.0457 490.025 48.3296 482.237 39.0396 472.953C29.7496 463.663 21.9679 452.954 16.01 441.244C9.94918 429.335 6.10291 417.131 3.74441 404.022C1.42019 391.098 0.652306 377.921 0.295789 364.853C0.131242 358.854 0.0626815 352.862 0.028401 346.863C0.000976562 339.739 0.000976563 332.623 0.000976563 325.499V186.499C0.000976563 179.375 0.000976562 172.259 0.0421132 165.135C0.0763937 159.136 0.144955 153.137 0.309501 147.145C0.666018 134.077 1.4339 120.9 3.75812 107.976C6.11662 94.8669 9.96289 82.6699 16.0237 70.754C21.9816 59.0506 29.7702 48.3345 39.0533 39.0445C48.3434 29.7545 59.0526 21.9728 70.7628 16.0149C82.6719 9.95408 94.8757 6.10781 107.985 3.74931C120.908 1.42509 134.086 0.657209 147.153 0.300692C153.153 0.136145 159.145 0.0675845 165.144 0.0333039C172.261 -0.000976562 179.377 -0.000976562 186.501 -0.000976562H325.501C332.625 -0.000976562 339.741 -0.000976562 346.865 0.04016C352.864 0.0744406 358.863 0.143002 364.855 0.307548C377.923 0.664065 391.1 1.43195 404.024 3.75617C417.133 6.11467 429.33 9.96094 441.246 16.0217C452.949 21.9797 463.665 29.7682 472.955 39.0514C482.245 48.3414 490.027 59.0506 495.985 70.7608C502.046 82.6699 505.892 94.8738 508.251 107.983C510.575 120.906 511.343 134.084 511.699 147.152C511.864 153.151 511.932 159.143 511.967 165.142C512.015 172.265 512.008 179.382 512.008 186.506V325.506L512.001 325.499Z" fill="#14120B"/>
<path d="M492.42 72.5742C486.653 61.2402 479.121 50.8739 470.128 41.8809L469.281 41.043C460.485 32.4243 450.406 25.1726 439.433 19.5859V19.5869C427.907 13.7248 416.09 9.99165 403.315 7.69337C390.689 5.42276 377.749 4.66042 364.746 4.30567H364.745C358.794 4.14226 352.827 4.07425 346.842 4.04005C339.732 3.99899 332.626 3.99903 325.501 3.99903H186.501C179.377 3.99903 172.27 3.99802 165.166 4.03224L165.167 4.03321C159.182 4.06742 153.221 4.13542 147.263 4.29884L144.825 4.3711C132.643 4.75539 120.529 5.55678 108.692 7.68556C95.9178 9.98394 84.0936 13.7186 72.5762 19.5801C61.2418 25.3469 50.8751 32.8798 41.8818 41.873C32.8952 50.8665 25.3544 61.2395 19.5879 72.5664L19.5889 72.5674C13.7269 84.0924 9.9936 95.9097 7.69531 108.684C5.42461 121.31 4.66237 134.251 4.30762 147.254V147.255C4.14421 153.206 4.07619 159.173 4.04199 165.158C4.00093 172.268 4.00098 179.374 4.00098 186.499V325.499C4.00098 332.621 4.00096 339.728 4.02832 346.84C4.06252 352.825 4.13053 358.786 4.29395 364.744C4.6487 377.747 5.41103 390.688 7.68164 403.313L7.90137 404.509C10.1408 416.43 13.6603 427.533 19.0312 438.349L19.5752 439.43L20.1211 440.49C25.8141 451.411 33.1554 461.412 41.8672 470.124L42.7139 470.962C51.5101 479.581 61.5885 486.831 72.5625 492.418C84.0876 498.28 95.9048 502.013 108.679 504.312C121.305 506.582 134.246 507.344 147.249 507.699H147.25C153.201 507.863 159.168 507.931 165.153 507.965C172.263 508.006 179.369 508.006 186.494 508.006H325.494C332.624 508.006 339.724 508.013 346.831 507.965H346.835C352.82 507.931 358.781 507.863 364.739 507.699L367.177 507.627C379.359 507.243 391.472 506.44 403.309 504.312C416.083 502.013 427.907 498.279 439.425 492.418C450.759 486.651 461.127 479.118 470.12 470.125C479.107 461.131 486.646 450.757 492.413 439.43L492.956 438.35C498.507 427.166 502.08 415.689 504.307 403.313C506.577 390.688 507.34 377.746 507.694 364.743C507.858 358.792 507.926 352.825 507.96 346.84C508.001 339.73 508.001 332.624 508.001 325.499V315.843L508.008 315.85V186.506C508.008 179.376 508.015 172.276 507.967 165.169V165.165C507.933 159.18 507.865 153.219 507.701 147.261L507.629 144.823C507.245 132.641 506.442 120.528 504.313 108.691L504.094 107.496C501.78 95.1776 498.098 83.7317 492.42 72.5742ZM492.42 72.5742L495.985 70.7607" stroke="#EDECEC" stroke-opacity="0.2" stroke-width="8"/>
<mask id="mask0_7_2" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="96" y="73" width="321" height="366">
<path d="M96 73H416.735V438.65H96V73Z" fill="white"/>
</mask>
<g mask="url(#mask0_7_2)">
<path d="M410.344 159.545L263.964 75.0339C259.264 72.3194 253.464 72.3194 248.764 75.0339L102.391 159.545C98.4395 161.827 96 166.046 96 170.616V341.034C96 345.603 98.4395 349.823 102.391 352.104L248.77 436.616C253.471 439.33 259.271 439.33 263.971 436.616L410.351 352.104C414.302 349.823 416.742 345.603 416.742 341.034V170.616C416.742 166.046 414.302 161.827 410.351 159.545H410.344ZM401.149 177.447L259.841 422.198C258.886 423.848 256.364 423.174 256.364 421.264V261.003C256.364 257.8 254.653 254.839 251.877 253.231L113.091 173.104C111.441 172.148 112.115 169.626 114.025 169.626H396.641C400.654 169.626 403.163 173.976 401.156 177.454H401.149V177.447Z" fill="#EDECEC"/>
</g>
</g>
<defs>
<clipPath id="clip0_7_2">
<rect width="512" height="512" fill="white"/>
</clipPath>
</defs>
</svg>`,
    favicon: `<svg width="1em" height="1em" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M399.994 254.294C399.994 259.859 399.994 265.419 399.962 270.984C399.935 275.67 399.882 280.357 399.753 285.038C399.475 295.247 398.875 305.542 397.059 315.639C395.217 325.88 392.212 335.409 387.477 344.718C382.822 353.861 376.738 362.233 369.485 369.491C362.227 376.748 353.861 382.828 344.712 387.482C335.409 392.217 325.875 395.222 315.633 397.065C305.537 398.88 295.242 399.48 285.033 399.759C280.346 399.887 275.665 399.941 270.978 399.968C265.413 400.005 259.853 400 254.288 400H145.695C140.13 400 134.571 400 129.005 399.968C124.319 399.941 119.632 399.887 114.951 399.759C104.742 399.48 94.447 398.88 84.35 397.065C74.109 395.222 64.58 392.217 55.271 387.482C46.128 382.828 37.756 376.743 30.499 369.491C23.241 362.233 17.161 353.866 12.507 344.718C7.77202 335.414 4.76699 325.88 2.92499 315.639C1.10899 305.542 0.50898 295.247 0.22998 285.038C0.10198 280.352 0.0479961 275.67 0.0209961 270.984C-3.90597e-06 265.419 0 259.859 0 254.294V145.701C0 140.136 -1.75796e-05 134.576 0.0319824 129.011C0.0589824 124.324 0.112028 119.637 0.241028 114.956C0.520028 104.747 1.119 94.452 2.935 84.356C4.778 74.115 7.78301 64.586 12.518 55.277C17.172 46.133 23.257 37.762 30.509 30.504C37.767 23.246 46.133 17.167 55.282 12.512C64.586 7.77699 74.12 4.77199 84.361 2.92999C94.458 1.11399 104.752 0.513992 114.961 0.235992C119.648 0.106992 124.329 0.0540081 129.016 0.0270081C134.576 8.05594e-06 140.136 0 145.701 0H254.294C259.859 0 265.419 1.29379e-05 270.984 0.0320129C275.67 0.0590129 280.357 0.111997 285.038 0.240997C295.247 0.519997 305.542 1.119 315.639 2.935C325.88 4.778 335.409 7.78301 344.718 12.518C353.861 17.172 362.233 23.257 369.491 30.509C376.748 37.767 382.828 46.133 387.482 55.282C392.217 64.586 395.222 74.12 397.065 84.361C398.88 94.458 399.48 104.752 399.759 114.961C399.887 119.648 399.941 124.329 399.968 129.016C400.01 134.581 400 140.141 400 145.706V254.299L399.994 254.294Z" fill="#F7F7F4"/>
<path d="M200.001 200L328.151 273.986C327.364 275.352 326.223 276.515 324.809 277.329L205.025 346.484C201.913 348.279 198.078 348.279 194.966 346.484L75.1821 277.329C73.7681 276.515 72.6271 275.347 71.8401 273.986L199.99 200H200.001Z" fill="#72716D"/>
<path d="M200 52.165V200L71.85 273.987C71.062 272.621 70.623 271.046 70.623 269.418V130.582C70.623 127.314 72.3641 124.304 75.1921 122.67L194.97 53.515C196.529 52.615 198.264 52.165 200 52.165Z" fill="#55544F"/>
<path d="M328.15 126.013C327.363 124.647 326.222 123.485 324.808 122.67L205.024 53.515C203.471 52.615 201.735 52.165 200 52.165V200L328.15 273.987C328.938 272.621 329.377 271.046 329.377 269.418V130.582C329.377 128.948 328.943 127.384 328.15 126.013Z" fill="#43413C"/>
<path d="M319.184 131.192C319.913 132.446 320.009 134.053 319.184 135.483L202.856 336.961C202.074 338.327 199.995 337.765 199.995 336.195V203.428C199.995 202.367 199.711 201.35 199.197 200.455L319.179 131.182H319.184V131.192Z" fill="#D6D5D2"/>
<path d="M319.184 131.192L199.202 200.466C198.694 199.577 197.949 198.827 197.028 198.291L82.054 131.91C80.688 131.128 81.251 129.05 82.82 129.05H315.467C317.117 129.05 318.461 129.944 319.179 131.198H319.184V131.192Z" fill="white"/>
</svg>`,
  };
  return icons[name] || "";
}

// ====== COPY TEXT ======
export function copyText(text: string): void {
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
export interface ResultWithCommands {
  ok?: boolean;
  sendCommand?: string;
  dlCommand?: string;
  sourceUrl?: string;
}

export function getCmdText(result: ResultWithCommands | undefined | null): string {
  if (!result || !result.ok) return "";
  const parts: string[] = [];
  if (result.sendCommand) {
    let cmd = result.sendCommand;
    if (result.sourceUrl) cmd += `\n\n<a href="${result.sourceUrl}">Source</a>`;
    parts.push(cmd);
  }
  if (result.dlCommand) parts.push(result.dlCommand);
  return parts.join("\n") + "\n";
}

// ====== CELEBRATION ======
interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function playSuccessSound(): void {
  try {
    const AudioCtx = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
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
  } catch {
    /* audio not supported */
  }
}

function fireConfetti(): void {
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

export function celebrate(): void {
  playSuccessSound();
  fireConfetti();
}

// ====== TIMER ======
let timerInterval: ReturnType<typeof setInterval> | null = null;

export function startTimerLoop(state: {
  searchStartTime: number | null;
  searchElapsed: number | string;
}): void {
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
      clearInterval(timerInterval!);
      timerInterval = null;
    }
  }, 100);
}

// ====== URL DETECTION ======
export function isThreadUrl(str: string): boolean {
  return (
    /^https?:\/\/(www\.)?(vipergirls\.to|viper\.to)\/(threads|showpost\.php)/i.test(
      str,
    ) || /^https?:\/\/(www\.)?adultphotosets\.com\/.+/i.test(str)
  );
}
