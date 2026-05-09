// ===== STATE =====
const options = {
  spaceToDot: false,
  spaceToUnderscore: false,
  aiRename: true, // default
};

const inputEl = document.getElementById('text-input');
const outputEl = document.getElementById('text-output');
const inputCount = document.getElementById('input-count');
const outputCount = document.getElementById('output-count');
const replaceCount = document.getElementById('replace-count');

// API key loaded from server .env
let apiKey = '';

(async () => {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    if (cfg.openrouterKey) apiKey = cfg.openrouterKey;
  } catch {}
})();

// ===== TRANSFORM =====
function transform(text) {
  let result = text;
  let replacements = 0;

  if (options.spaceToDot || options.spaceToUnderscore) {
    const replaceChar = options.spaceToDot ? '.' : '_';
    const before = result;
    result = result.replace(/ /g, replaceChar);
    for (let i = 0; i < before.length; i++) {
      if (before[i] === ' ') replacements++;
    }
  }

  return { result, replacements };
}

// ===== AI RENAME =====
const AI_SYSTEM_PROMPT = `You are a filename formatter. Convert scene descriptions into standardized filenames.

Rules:
- Format: Studio.YY.MM.DD.Performer.Firstname.Performer.Lastname.Scene.Title.Words
- Extract the studio/channel name (remove @ symbol if present)
- Reformat the date from YYYY-MM-DD to YY.MM.DD
- Extract performer name(s)
- Extract the scene title, remove possessive artifacts like "s" that should be "'s", clean it up
- Replace all spaces with dots
- Remove any special characters except dots
- Replace "&" with "and"
- Each word should be capitalized
- Do NOT include file extension
- If there are multiple lines, process each line separately and return each result on its own line

Network prefixes:
- If the studio belongs to the Dogfart network, prepend "Dogfart." before the studio name.
- Dogfart network sites: BlacksOnBlondes, CuckoldSessions, Gloryhole, DFXtraOriginals, DFXHomewreckers, CheatingWithMyEx, CougarSeductions, DFXHotwives, DFXBigBangz, InterracialPickups, DFXSolemates, BlackMeatWhiteFeet, BlacksOnCougars, Cumbang, GloryholeInitiations, InterracialBlowbang, WatchingMyDaughterGoBlack, WatchingMyMomGoBlack, WeFuckBlackGirls, ZebraGirls

Examples:
Input: Scarlett Alexis -- @BlacksOnBlondes -- Scarlett s Business Opportunity -- 2023-08-18
Output: Dogfart.BlacksOnBlondes.23.08.18.Scarlett.Alexis.Business.Opportunity

Input: Jenna Foxx -- @InterracialBlowbang -- Jenna s First Time -- 2024-01-15
Output: Dogfart.InterracialBlowbang.24.01.15.Jenna.Foxx.First.Time

Input: Luna Star -- @Brazzers -- Luna Gets Wild -- 2024-03-20
Output: Brazzers.24.03.20.Luna.Star.Gets.Wild

Return ONLY the formatted filename(s), nothing else. No explanation, no markdown.`;

async function aiRename(text) {
  if (!apiKey) {
    toast('No OpenRouter API key configured in .env', 'error');
    return text;
  }
  if (!text.trim()) return '';

  try {
    document.querySelector('.tool-panel').classList.add('ai-processing');
    outputEl.value = 'Processing with AI…';

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
        max_tokens: 2048,
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    const result = data?.choices?.[0]?.message?.content?.trim() || '';
    return result;
  } catch (e) {
    toast(`AI error: ${e.message}`, 'error');
    return text;
  } finally {
    document.querySelector('.tool-panel').classList.remove('ai-processing');
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
inputEl.addEventListener('input', update);

// Option toggles — all three are mutually exclusive
const allOptions = ['spaceToDot', 'spaceToUnderscore', 'aiRename'];

document.querySelectorAll('.option-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const key = chip.dataset.option;

    const wasActive = options[key];
    allOptions.forEach(k => {
      options[k] = false;
      const el = document.querySelector(`[data-option="${k}"]`);
      if (el) el.classList.remove('active');
    });
    if (!wasActive) {
      options[key] = true;
      chip.classList.add('active');
    }

    update();
  });
});

// Convert (AI Rename on click)
document.getElementById('btn-convert').addEventListener('click', async () => {
  const text = inputEl.value.trim();
  if (!text) {
    toast('Nothing to convert', 'error');
    return;
  }
  if (options.aiRename) {
    const result = await aiRename(text);
    outputEl.value = result;
    outputCount.textContent = `${result.length} chars`;
    replaceCount.textContent = '—';
  } else {
    // For non-AI modes, just run the transform
    update();
  }
});

// Copy
document.getElementById('btn-copy').addEventListener('click', async () => {
  const text = outputEl.value;
  if (!text) {
    toast('Nothing to copy', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard!', 'success');
  } catch {
    toast('Copy failed', 'error');
  }
});

// Clear
document.getElementById('btn-clear').addEventListener('click', () => {
  inputEl.value = '';
  outputEl.value = '';
  outputCount.textContent = '0 chars';
  replaceCount.textContent = '0';
  inputEl.focus();
});

// ===== TOAST =====
function toast(msg, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// Initial
update();
