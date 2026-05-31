import { useState, useRef, useEffect } from 'react';
import { getRecent, addRecent, removeRecent, RecentItem } from './store';

const MAX = 100000;

const EXPIRY_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: '10m', label: '10 min' },
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

const PlainLogo = () => (
  <svg width="32" height="32" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clipPath="url(#pi)">
      <path d="M400.001 254.296C400.001 259.861 400.001 265.421 399.969 270.987C399.942 275.673 399.888 280.36 399.76 285.041C399.481 295.251 398.881 305.545 397.066 315.642C395.223 325.883 392.218 335.412 387.483 344.722C382.828 353.865 376.744 362.237 369.492 369.494C362.234 376.753 353.867 382.832 344.718 387.487C335.414 392.222 325.88 395.226 315.638 397.069C305.542 398.885 295.247 399.485 285.038 399.763C280.351 399.892 275.67 399.945 270.983 399.972C265.418 400.01 259.858 400.004 254.292 400.004H145.699C140.133 400.004 134.574 400.004 129.008 399.972C124.321 399.945 119.635 399.892 114.953 399.763C104.744 399.485 94.4494 398.885 84.3526 397.069C74.1112 395.226 64.5822 392.222 55.2729 387.487C46.1297 382.832 37.7577 376.747 30.4999 369.494C23.2421 362.237 17.1626 353.87 12.508 344.722C7.77301 335.418 4.76811 325.883 2.92553 315.642C1.10974 305.545 0.509828 295.251 0.231299 285.041C0.102746 280.354 0.0491835 275.673 0.0224019 270.987C0.000976562 265.421 0.000976563 259.861 0.000976563 254.296V145.702C0.000976563 140.136 0.000976562 134.577 0.0331146 129.012C0.0598962 124.325 0.11346 119.638 0.242011 114.957C0.52054 104.747 1.12045 94.4529 2.93624 84.356C4.77882 74.1146 7.78372 64.5856 12.5187 55.2763C17.1733 46.1331 23.2582 37.7611 30.5106 30.5033C37.7685 23.2455 46.1351 17.166 55.2837 12.5114C64.5876 7.77641 74.1219 4.77151 84.3635 2.92893C94.4596 1.11314 104.755 0.513231 114.963 0.234702C119.651 0.10615 124.332 0.0525868 129.019 0.025805C134.579 -0.000976562 140.139 -0.000976562 145.704 -0.000976562H254.298C259.864 -0.000976562 265.423 -0.000976562 270.988 0.0311614C275.675 0.0579431 280.362 0.111507 285.043 0.240058C295.253 0.518587 305.547 1.1185 315.644 2.93429C325.885 4.77687 335.414 7.78177 344.724 12.5167C353.867 17.1714 362.238 23.2562 369.496 30.5087C376.754 37.7665 382.834 46.1331 387.488 55.2817C392.224 64.5856 395.228 74.1199 397.071 84.3615C398.887 94.4576 399.487 104.753 399.765 114.962C399.894 119.649 399.947 124.33 399.974 129.017C400.012 134.582 400.006 140.142 400.006 145.708V254.301L400.001 254.296Z" fill="#14120B"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M318.796 112.934L287.26 81.637C278.783 73.1916 265.508 72.7513 257.628 80.6305L114.183 224.281C114.183 224.281 77.8182 307.948 75.3488 314.711C73.3827 320.058 80.1617 326.836 84.8489 324.54C92.3986 320.813 175.131 284.908 175.131 284.908L318.922 140.66C326.818 132.765 327.274 121.379 318.796 112.934ZM95.969 291.749L123.038 234.708L129.545 245.591L138.452 245.591L213.352 171.344L288.251 97.0966L308.054 116.535L163.602 257.528L160.032 269.354L167.676 276.998L107.734 303.041L95.969 291.749Z" fill="white"/>
    </g>
    <defs><clipPath id="pi"><rect width="400" height="400" fill="white"/></clipPath></defs>
  </svg>
);

function Popover({ item, pos, onClose }: { item: RecentItem; pos: { x: number; y: number }; onClose: () => void }) {
  const copy = (text: string, btn: HTMLButtonElement) => {
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    });
  };

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div className="popover" style={{ left: Math.min(pos.x, window.innerWidth - 340), top: Math.min(pos.y + 8, window.innerHeight - 260) }}>
        <div className="popover-section">
          <div className="popover-label">Edit Link</div>
          <div className="popover-sublabel">Private</div>
          <div className="popover-link">{item.editUrl}</div>
          <div className="popover-actions">
            <button className="popover-btn" onClick={e => copy(item.editUrl, e.currentTarget)}>Copy</button>
            <a className="popover-btn" href={item.editUrl}>Open Edit ↗</a>
            <a className="popover-btn" href={item.editUrl} target="_blank" rel="noopener">Bookmark ↗</a>
          </div>
        </div>
        <hr className="popover-divider" />
        <div className="popover-section">
          <div className="popover-label">Raw Link</div>
          <div className="popover-sublabel">Public</div>
          <div className="popover-link">{item.rawUrl}</div>
          <div className="popover-actions">
            <button className="popover-btn" onClick={e => copy(item.rawUrl, e.currentTarget)}>Copy</button>
            <a className="popover-btn" href={item.rawUrl} target="_blank" rel="noopener">Open raw text ↗</a>
          </div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [text, setText] = useState('');
  const [expiresIn, setExpiresIn] = useState('never');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ rawUrl: string; editUrl: string; expiresAt: string | null } | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>(() => getRecent());
  const [popover, setPopover] = useState<{ item: RecentItem; pos: { x: number; y: number } } | null>(null);
  const rawLinkRef = useRef<HTMLDivElement>(null);
  const editLinkRef = useRef<HTMLDivElement>(null);

  const n = text.length;
  const pct = Math.min((n / MAX) * 100, 100);
  const overLimit = n > MAX;

  const create = async () => {
    setLoading(true);
    try {
      const res = await fetch('/plain/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, expiresIn }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      const base = window.location.origin;
      const rawUrl = base + data.rawUrl;
      const editUrl = base + data.editUrl;
      setResult({ rawUrl, editUrl, expiresAt: data.expiresAt || null });
      addRecent({ id: data.id, editUrl, rawUrl, preview: text.slice(0, 60) });
      setRecent(getRecent());
    } catch (e: unknown) {
      alert('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
    setLoading(false);
  };

  const copyLink = (ref: React.RefObject<HTMLDivElement | null>, btn: HTMLButtonElement) => {
    const url = ref.current?.textContent ?? '';
    navigator.clipboard.writeText(url).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    });
  };

  const handleRemove = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    removeRecent(i);
    setRecent(getRecent());
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.ctrlKey && text.trim() && !overLimit && !loading) create();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [text, overLimit, loading]);

  const formatExpiry = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <>
      <nav>
        <a className="nav-logo" href="/plain">
          <PlainLogo />
          <span>Plain</span>
        </a>
      </nav>

      <div className="container">
        <div className="hero-eyebrow">Plain Text Sharing</div>
        <h1><span>Plain</span></h1>
        <p className="hero-sub">
          Share raw text. No HTML, no formatting. Get a{' '}
          <code style={{ color: 'var(--accent-2)', fontFamily: 'var(--mono)', fontSize: 13 }}>text/plain</code>{' '}
          link and a private edit link.
        </p>

        <div className="editor-wrap">
          <div className="editor-titlebar">
            <div className="dot-r" /><div className="dot-y" /><div className="dot-g" />
            <span className="editor-filename">snippet.txt</span>
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'// Paste or type your text here...\n// Ctrl+Enter to create'}
          />
          <div className="editor-footer">
            <div className="char-bar-wrap">
              <div className="char-bar">
                <div className="char-bar-fill" style={{ width: `${pct}%`, background: overLimit ? 'var(--red)' : 'var(--accent)' }} />
              </div>
              <span className="char-count">{n.toLocaleString()} / {MAX.toLocaleString()}</span>
            </div>
            <div className="expiry-wrap">
              <span className="expiry-label">Expires</span>
              <select
                className="expiry-select"
                value={expiresIn}
                onChange={e => setExpiresIn(e.target.value)}
              >
                {EXPIRY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <button className="create-btn" onClick={create} disabled={!text.trim() || overLimit || loading}>
              {loading ? <div className="spinner" /> : null}
              {loading ? 'Creating…' : (
                <>
                  Create Snippet
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>

        {result && (
          <div className="result">
            <div className="result-title">Snippet created</div>
            <div className="link-row">
              <span className="link-label">Raw</span>
              <div className="link-box" ref={rawLinkRef} onClick={e => copyLink(rawLinkRef, e.currentTarget.nextElementSibling as HTMLButtonElement)}>{result.rawUrl}</div>
              <button className="copy-btn" onClick={e => copyLink(rawLinkRef, e.currentTarget)}>Copy</button>
            </div>
            <div className="link-row">
              <span className="link-label">Edit</span>
              <div className="link-box" ref={editLinkRef} onClick={e => copyLink(editLinkRef, e.currentTarget.nextElementSibling as HTMLButtonElement)}>{result.editUrl}</div>
              <button className="copy-btn" onClick={e => copyLink(editLinkRef, e.currentTarget)}>Copy</button>
            </div>
            {result.expiresAt && (
              <div className="expiry-note">
                ⏱ Expires <span className="expiry-badge">{formatExpiry(result.expiresAt)}</span>
              </div>
            )}
            <div className="warn-note">
              <strong>⚠ Save your edit link.</strong> It's the only way to update this snippet. There's no recovery if you lose it.
            </div>
          </div>
        )}

        <div className="recent">
          <div className="section-title">Recent Snippets</div>
          {recent.length === 0 ? (
            <div className="empty-recent">No snippets yet.</div>
          ) : (
            recent.map((r, i) => (
              <div key={r.id} className="recent-item" onClick={() => { window.location.href = r.editUrl; }}>
                <span className="recent-arrow">→</span>
                <span className="recent-text">{r.preview}</span>
                <button className="recent-remove" onClick={e => handleRemove(i, e)}>remove</button>
              </div>
            ))
          )}
        </div>
      </div>

      {popover && (
        <Popover item={popover.item} pos={popover.pos} onClose={() => setPopover(null)} />
      )}
    </>
  );
}
