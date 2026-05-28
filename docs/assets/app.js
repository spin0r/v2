function switchTab(e, id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  document.getElementById(id).classList.add('active');
}

function copyCode(btn) {
  const block = btn.parentElement;
  const text = block.textContent.replace('Copy', '').trim();
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}

async function tryRename() {
  const input = document.getElementById('try-input').value.trim();
  if (!input) return;
  const btn = document.getElementById('try-btn');
  const output = document.getElementById('try-output');
  const result = document.getElementById('try-result');

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Processing…';
  output.style.display = 'block';
  result.className = 'try-result empty';
  result.textContent = 'Waiting for AI…';

  try {
    const res = await fetch('/api/ai-rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input })
    });
    const data = await res.json();
    if (data.ok) {
      result.className = 'try-result';
      result.textContent = data.result;
    } else {
      result.className = 'try-result error';
      result.textContent = data.error || 'Unknown error';
    }
  } catch (e) {
    result.className = 'try-result error';
    result.textContent = 'Request failed: ' + e.message;
  }

  btn.disabled = false;
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Rename';
}

// Enter key shortcut
document.getElementById('try-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) tryRename();
});

// Auto-detect server URL and inject into examples
(function() {
  const base = window.location.origin;
  const full = base + '/api/ai-rename';
  const ep = document.getElementById('endpoint-url');
  if (ep) ep.textContent = full;
  document.querySelectorAll('.api-url').forEach(el => el.textContent = base);
  document.querySelectorAll('.api-url-py').forEach(el => el.textContent = '"' + full + '"');
  document.querySelectorAll('.api-url-ps').forEach(el => el.textContent = '"' + full + '"');
})();
