// ===== STATE =====
const options = {
  spaceToDot: false,
  spaceToUnderscore: false,
  aiRename: true, // default
};

const inputEl = document.getElementById("text-input");
const outputEl = document.getElementById("text-output");
const inputCount = document.getElementById("input-count");
const outputCount = document.getElementById("output-count");
const replaceCount = document.getElementById("replace-count");

// AI rename now uses server-side /api/ai-rename endpoint

// ===== TRANSFORM =====
function transform(text) {
  let result = text;
  let replacements = 0;

  if (options.spaceToDot || options.spaceToUnderscore) {
    const replaceChar = options.spaceToDot ? "." : "_";
    const before = result;
    result = result.replace(/ /g, replaceChar);
    for (let i = 0; i < before.length; i++) {
      if (before[i] === " ") replacements++;
    }
  }

  return { result, replacements };
}

// ===== AI RENAME =====
async function aiRename(text) {
  if (!text.trim()) return "";

  try {
    document.querySelector(".tool-panel").classList.add("ai-processing");
    outputEl.value = "Processing with AI…";

    const res = await fetch("/api/ai-rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const data = await res.json();
    if (data.ok) {
      return data.result;
    } else {
      throw new Error(data.error || "Unknown error");
    }
  } catch (e) {
    toast(`AI error: ${e.message}`, "error");
    return text;
  } finally {
    document.querySelector(".tool-panel").classList.remove("ai-processing");
  }
}

// ===== UPDATE =====
function update() {
  const text = inputEl.value;
  inputCount.textContent = `${text.length} chars`;

  if (options.aiRename) {
    // In AI mode, don't auto-convert — just update char count
    return;
  }

  const { result, replacements } = transform(text);
  outputEl.value = result;
  outputCount.textContent = `${result.length} chars`;
  replaceCount.textContent = replacements;
}

// ===== EVENTS =====
inputEl.addEventListener("input", update);

// Option toggles — all three are mutually exclusive
const allOptions = ["spaceToDot", "spaceToUnderscore", "aiRename"];

document.querySelectorAll(".option-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const key = chip.dataset.option;

    const wasActive = options[key];
    allOptions.forEach((k) => {
      options[k] = false;
      const el = document.querySelector(`[data-option="${k}"]`);
      if (el) el.classList.remove("active");
    });
    if (!wasActive) {
      options[key] = true;
      chip.classList.add("active");
    }

    update();
  });
});

// Convert (AI Rename on click)
document.getElementById("btn-convert").addEventListener("click", async () => {
  const text = inputEl.value.trim();
  if (!text) {
    toast("Nothing to convert", "error");
    return;
  }
  if (options.aiRename) {
    const result = await aiRename(text);
    outputEl.value = result;
    outputCount.textContent = `${result.length} chars`;
    replaceCount.textContent = "—";
  } else {
    // For non-AI modes, just run the transform
    update();
  }
});

// Copy
document.getElementById("btn-copy").addEventListener("click", async () => {
  const text = outputEl.value;
  if (!text) {
    toast("Nothing to copy", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard!", "success");
  } catch {
    toast("Copy failed", "error");
  }
});

// Clear
document.getElementById("btn-clear").addEventListener("click", () => {
  inputEl.value = "";
  outputEl.value = "";
  outputCount.textContent = "0 chars";
  replaceCount.textContent = "0";
  inputEl.focus();
});

// ===== TOAST =====
function toast(msg, type = "success") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === "success" ? "✓" : "✕"}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// Initial
update();
