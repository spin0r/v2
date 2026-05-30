import { useState, useCallback } from 'react';
import { LuSparkles, LuCopy, LuX, LuArrowRight } from 'react-icons/lu';
import { useStore, TransformMode } from './store';

const MODES: { key: TransformMode; label: string; ai?: boolean }[] = [
  { key: 'aiRename', label: 'AI Rename', ai: true },
  { key: 'spaceToDot', label: 'Space → .' },
  { key: 'spaceToUnderscore', label: 'Space → _' },
];

function Toast({ msg, type, onDone }: { msg: string; type: 'success' | 'error'; onDone: () => void }) {
  return (
    <div className={`tt-toast tt-toast--${type}`} onAnimationEnd={() => setTimeout(onDone, 2500)}>
      <span>{type === 'success' ? '✓' : '✕'}</span>
      <span>{msg}</span>
    </div>
  );
}

export default function App() {
  const input = useStore(s => s.input);
  const output = useStore(s => s.output);
  const mode = useStore(s => s.mode);
  const replacements = useStore(s => s.replacements);
  const processing = useStore(s => s.processing);
  const setInput = useStore(s => s.setInput);
  const setMode = useStore(s => s.setMode);
  const clear = useStore(s => s.clear);
  const convert = useStore(s => s.convert);

  const [toasts, setToasts] = useState<{ id: number; msg: string; type: 'success' | 'error' }[]>([]);
  let toastId = 0;

  const toast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
  }, []);

  const handleCopy = async () => {
    if (!output) { toast('Nothing to copy', 'error'); return; }
    try {
      await navigator.clipboard.writeText(output);
      toast('Copied to clipboard!');
    } catch {
      toast('Copy failed', 'error');
    }
  };

  const handleConvert = async () => {
    if (!input.trim()) { toast('Nothing to convert', 'error'); return; }
    await convert();
  };

  const handleModeToggle = (key: TransformMode) => {
    setMode(mode === key ? null : key);
  };

  return (
    <div className="tt-app">
      {/* ── Ambient glow ── */}
      <div className="tt-glow" />

      {/* ── Nav ── */}
      <nav className="tt-nav">
        <a className="tt-nav-logo nav-logo" href="/">
          <span>Text</span>
          <span className="tt-nav-badge">v2</span>
        </a>
        <div className="tt-nav-links">
          <a className="tt-nav-link tt-nav-link--active" href="/text">Format</a>
          <a className="tt-nav-link" href="/" >Viper</a>
          <a className="tt-nav-link" href="/plain" target="_blank" rel="noopener">Plain</a>
          <a className="tt-nav-link" href="/docs" target="_blank" rel="noopener">Docs</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="tt-hero">
        <div className="tt-hero-eyebrow">
          <span className="tt-hero-dot" />
          Text tools
        </div>
        <h1 className="tt-hero-title">
          Format text, <span>instantly.</span>
        </h1>
        <p className="tt-hero-sub">
          Paste your text, toggle formatting options, and copy the result. Real-time transformations with zero friction.
        </p>
      </header>

      {/* ── Main ── */}
      <main className="tt-main">
        {/* Options bar */}
        <div className="tt-options">
          <span className="tt-options-label">Styles</span>
          {MODES.map(m => (
            <button
              key={m.key}
              onClick={() => handleModeToggle(m.key)}
              className={`tt-chip ${mode === m.key ? 'tt-chip--active' : ''} ${m.ai ? 'tt-chip--ai' : ''}`}
            >
              {m.ai && <LuSparkles size={13} className="tt-chip-sparkle" />}
              {m.label}
            </button>
          ))}
        </div>

        {/* Text grid */}
        <div className="tt-grid">
          <div className="tt-col">
            <div className="tt-col-header">
              <span className="tt-col-label">Input</span>
              <span className="tt-col-count">{input.length} chars</span>
            </div>
            <textarea
              className="tt-textarea"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Paste or type your text here…"
              spellCheck={false}
            />
          </div>
          <div className="tt-col">
            <div className="tt-col-header">
              <span className="tt-col-label">Output</span>
              <span className="tt-col-count">{output.length} chars</span>
            </div>
            <textarea
              className={`tt-textarea tt-textarea--output ${processing ? 'tt-textarea--processing' : ''}`}
              value={processing ? 'Processing with AI…' : output}
              readOnly
              placeholder="Formatted text will appear here…"
            />
          </div>
        </div>

        {/* Action bar */}
        <div className="tt-actions">
          <div className="tt-actions-left">
            <div className="tt-stat">
              <span>Replacements</span>
              <span className="tt-stat-val">{mode === 'aiRename' && output ? '—' : replacements}</span>
            </div>
          </div>
          <div className="tt-actions-right">
            <button className="tt-btn" onClick={clear}>
              <LuX size={14} />
              Clear
            </button>
            <button className="tt-btn tt-btn--primary" onClick={handleConvert} disabled={processing}>
              {processing ? (
                <span className="tt-spinner" />
              ) : (
                <LuArrowRight size={14} />
              )}
              Convert
            </button>
            <button className="tt-btn tt-btn--primary" onClick={handleCopy}>
              <LuCopy size={14} />
              Copy
            </button>
          </div>
        </div>
      </main>

      {/* ── Toasts ── */}
      {toasts.length > 0 && (
        <div className="tt-toast-container">
          {toasts.map(t => (
            <Toast
              key={t.id}
              msg={t.msg}
              type={t.type}
              onDone={() => setToasts(ts => ts.filter(x => x.id !== t.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
