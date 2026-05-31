import { useState, useEffect, useRef } from 'react';

const PlainLogo = () => (
  <svg width="32" height="32" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clipPath="url(#pi2)">
      <path d="M400.001 254.296C400.001 259.861 400.001 265.421 399.969 270.987C399.942 275.673 399.888 280.36 399.76 285.041C399.481 295.251 398.881 305.545 397.066 315.642C395.223 325.883 392.218 335.412 387.483 344.722C382.828 353.865 376.744 362.237 369.492 369.494C362.234 376.753 353.867 382.832 344.718 387.487C335.414 392.222 325.88 395.226 315.638 397.069C305.542 398.885 295.247 399.485 285.038 399.763C280.351 399.892 275.67 399.945 270.983 399.972C265.418 400.01 259.858 400.004 254.292 400.004H145.699C140.133 400.004 134.574 400.004 129.008 399.972C124.321 399.945 119.635 399.892 114.953 399.763C104.744 399.485 94.4494 398.885 84.3526 397.069C74.1112 395.226 64.5822 392.222 55.2729 387.487C46.1297 382.832 37.7577 376.747 30.4999 369.494C23.2421 362.237 17.1626 353.87 12.508 344.722C7.77301 335.418 4.76811 325.883 2.92553 315.642C1.10974 305.545 0.509828 295.251 0.231299 285.041C0.102746 280.354 0.0491835 275.673 0.0224019 270.987C0.000976562 265.421 0.000976563 259.861 0.000976563 254.296V145.702C0.000976563 140.136 0.000976562 134.577 0.0331146 129.012C0.0598962 124.325 0.11346 119.638 0.242011 114.957C0.52054 104.747 1.12045 94.4529 2.93624 84.356C4.77882 74.1146 7.78372 64.5856 12.5187 55.2763C17.1733 46.1331 23.2582 37.7611 30.5106 30.5033C37.7685 23.2455 46.1351 17.166 55.2837 12.5114C64.5876 7.77641 74.1219 4.77151 84.3635 2.92893C94.4596 1.11314 104.755 0.513231 114.963 0.234702C119.651 0.10615 124.332 0.0525868 129.019 0.025805C134.579 -0.000976562 140.139 -0.000976562 145.704 -0.000976562H254.298C259.864 -0.000976562 265.423 -0.000976562 270.988 0.0311614C275.675 0.0579431 280.362 0.111507 285.043 0.240058C295.253 0.518587 305.547 1.1185 315.644 2.93429C325.885 4.77687 335.414 7.78177 344.724 12.5167C353.867 17.1714 362.238 23.2562 369.496 30.5087C376.754 37.7665 382.834 46.1331 387.488 55.2817C392.224 64.5856 395.228 74.1199 397.071 84.3615C398.887 94.4576 399.487 104.753 399.765 114.962C399.894 119.649 399.947 124.33 399.974 129.017C400.012 134.582 400.006 140.142 400.006 145.708V254.301L400.001 254.296Z" fill="#14120B"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M318.796 112.934L287.26 81.637C278.783 73.1916 265.508 72.7513 257.628 80.6305L114.183 224.281C114.183 224.281 77.8182 307.948 75.3488 314.711C73.3827 320.058 80.1617 326.836 84.8489 324.54C92.3986 320.813 175.131 284.908 175.131 284.908L318.922 140.66C326.818 132.765 327.274 121.379 318.796 112.934ZM95.969 291.749L123.038 234.708L129.545 245.591L138.452 245.591L213.352 171.344L288.251 97.0966L308.054 116.535L163.602 257.528L160.032 269.354L167.676 276.998L107.734 303.041L95.969 291.749Z" fill="white"/>
    </g>
    <defs><clipPath id="pi2"><rect width="400" height="400" fill="white"/></clipPath></defs>
  </svg>
);

type State = 'loading' | 'error' | 'ready';

function Toast({ msg, err }: { msg: string; err: boolean }) {
  return (
    <div className={`toast show`} style={{
      borderColor: err ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)',
      color: err ? '#f87171' : '#4ade80',
    }}>
      {msg}
    </div>
  );
}

export default function Edit() {
  const parts = location.pathname.split('/').filter(Boolean);
  const id = parts[2];
  const editKey = parts[3];

  const [state, setState] = useState<State>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [text, setText] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawUrl = `${location.origin}/plain/raw/${id}`;
  const editUrl = location.href;

  const showToast = (msg: string, err = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, err });
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  useEffect(() => {
    if (!id || !editKey) {
      setState('error');
      setErrorMsg('Invalid edit URL.');
      return;
    }
    fetch(`/plain/api/snippet/${id}/${editKey}`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok) { setState('error'); setErrorMsg(data.error || 'Not found.'); return; }
        setText(data.text);
        if (data.createdAt) setCreatedAt(new Date(data.createdAt).toLocaleString());
        if (data.expiresAt) setExpiresAt(data.expiresAt);
        setState('ready');
      })
      .catch(() => { setState('error'); setErrorMsg('Failed to load snippet.'); });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.ctrlKey && state === 'ready') save();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [text, state]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/plain/api/edit/${id}/${editKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      showToast('Saved ✓');
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : String(e)), true);
    }
    setSaving(false);
  };

  const lpCopy = (url: string, btn: HTMLButtonElement) => {
    navigator.clipboard.writeText(url).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    });
  };

  const deleteSnippet = async () => {
    if (!confirm('Delete this snippet permanently?')) return;
    try {
      const res = await fetch(`/plain/api/delete/${id}/${editKey}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      window.location.href = '/plain';
    } catch (e: unknown) {
      showToast('Error: ' + (e instanceof Error ? e.message : String(e)), true);
    }
  };

  const formatExpiry = (iso: string) => {
    const d = new Date(iso);
    const now = Date.now();
    const diff = d.getTime() - now;
    if (diff <= 0) return 'Expired';

    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    let relative = '';
    if (days > 0) relative = `${days}d ${hours % 24}h`;
    else if (hours > 0) relative = `${hours}h ${mins % 60}m`;
    else relative = `${mins}m`;

    return `${d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} (${relative} left)`;
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
        {state === 'loading' && <div className="loading-state">Loading snippet…</div>}
        {state === 'error' && <div className="error-state">{errorMsg}</div>}
        {state === 'ready' && (
          <>
            <div className="hero-eyebrow">Edit Snippet</div>
            <h1><span id="snippet-id">{id}</span></h1>
            {createdAt && <p className="hero-sub meta">Created {createdAt}</p>}
            {expiresAt && (
              <div className={`edit-expiry-badge active`}>
                ⏱ Expires {formatExpiry(expiresAt)}
              </div>
            )}
            {!expiresAt && (
              <div className="edit-expiry-badge never">
                ∞ Never expires
              </div>
            )}

            <div className="editor-wrap" style={{ marginTop: 24 }}>
              <div className="editor-titlebar">
                <div className="dot-r" /><div className="dot-y" /><div className="dot-g" />
                <span className="editor-filename">{id}.txt</span>
              </div>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Type your text here…"
              />
              <div className="editor-footer">
                <span className="char-count">{text.length.toLocaleString()} chars</span>
                <div className="actions">
                  <a className="raw-btn" href={rawUrl} target="_blank" rel="noopener">View Raw ↗</a>
                  <button className="save-btn" onClick={save} disabled={saving}>
                    {saving ? <div className="spinner" /> : null}
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>

            <div className="link-panel">
              <div className="link-panel-section">
                <div className="lp-label">Edit Link</div>
                <div className="lp-sublabel">Private</div>
                <div className="lp-url">{editUrl}</div>
                <div className="lp-actions">
                  <button className="lp-btn" onClick={e => lpCopy(editUrl, e.currentTarget)}>Copy</button>
                  <a className="lp-btn" href={editUrl}>Bookmark this page ↗</a>
                </div>
              </div>
              <div className="link-panel-section">
                <div className="lp-label">Raw Link</div>
                <div className="lp-sublabel">Public</div>
                <div className="lp-url">{rawUrl}</div>
                <div className="lp-actions">
                  <button className="lp-btn" onClick={e => lpCopy(rawUrl, e.currentTarget)}>Copy</button>
                  <a className="lp-btn" href={rawUrl} target="_blank" rel="noopener">Open raw text ↗</a>
                </div>
              </div>
            </div>

            <div className="danger-zone">
              <div>
                <div className="danger-label">Danger Zone</div>
                <div className="danger-desc">Permanently delete this snippet. This cannot be undone.</div>
              </div>
              <button className="delete-btn" onClick={deleteSnippet}>Delete Snippet</button>
            </div>
          </>
        )}
      </div>

      {toast && <Toast msg={toast.msg} err={toast.err} />}
    </>
  );
}
