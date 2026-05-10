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

// API key and prompt loaded from server
let apiKey = '';
let promptUrl = '';
let AI_SYSTEM_PROMPT = '';

(async () => {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    if (cfg.openrouterKey) apiKey = cfg.openrouterKey;
    if (cfg.promptUrl) {
      promptUrl = cfg.promptUrl;
      // Fetch the prompt from plainraw
      const promptRes = await fetch(promptUrl);
      if (promptRes.ok) {
        AI_SYSTEM_PROMPT = await promptRes.text();
        console.log('[AI] Prompt loaded from', promptUrl);
      } else {
        console.error('[AI] Failed to fetch prompt:', promptRes.status);
      }
    }
  } catch (e) {
    console.error('[AI] Config/prompt load error:', e.message);
  }
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
async function aiRename(text) {
  if (!apiKey) {
    toast('No OpenRouter API key configured in .env', 'error');
    return text;
  }
  if (!AI_SYSTEM_PROMPT) {
    toast('AI prompt not loaded yet — try again in a moment', 'error');
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
