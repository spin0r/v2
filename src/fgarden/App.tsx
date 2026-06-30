import { useState, useRef, useCallback, useEffect } from 'react';
import './styles/fgarden.css';

/* ===== Types ===== */
interface UploadResult {
  ok: boolean;
  url?: string;
  item?: { name: string; path: string };
  error?: string;
}


type UploadMode = 'file' | 'url';
type Status = 'idle' | 'loading' | 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
  fadeOut?: boolean;
}

/* ===== SVG Icons (inline, no deps) ===== */
const Icons = {
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  cloud: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  externalLink: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  chevronRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
};

/* ===== Main App ===== */
export default function FgardenApp() {
  const [mode, setMode] = useState<UploadMode>('file');
  const [urlInput, setUrlInput] = useState('');
  const [dirInput, setDirInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastId = useRef(0);

  /* Toast system */
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, fadeOut: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 300);
    }, 3000);
  }, []);

  /* Upload handler */
  const upload = async () => {
    if (mode === 'url' && !urlInput.trim()) return;
    if (mode === 'file' && !file) return;

    setStatus('loading');
    setResult(null);

    try {
      let res: Response;
      if (mode === 'url') {
        res = await fetch('/api/fgarden/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlInput.trim(), dir: dirInput.trim() || undefined }),
        });
      } else {
        const fd = new FormData();
        fd.append('file', file!);
        if (dirInput.trim()) fd.append('dir', dirInput.trim());
        res = await fetch('/api/fgarden/upload', { method: 'POST', body: fd });
      }
      const data: UploadResult = await res.json();
      setResult(data);
      setStatus(data.ok ? 'success' : 'error');
      if (data.ok) {
        showToast('File uploaded successfully', 'success');
      } else {
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
      setStatus('error');
      showToast((e as Error).message, 'error');
    }
  };



  /* Drag & drop */
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setMode('file'); }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  /* Copy to clipboard with feedback */
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    showToast('URL copied to clipboard', 'success');
    setTimeout(() => setCopiedUrl(false), 2000);
  }, [showToast]);

  /* Reset copied state when result changes */
  useEffect(() => {
    setCopiedUrl(false);
  }, [result]);

  const canSubmit = mode === 'url' ? !!urlInput.trim() : !!file;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fg-app">
      {/* Ambient glow orbs */}
      <div className="fg-glow-orb fg-glow-1" />
      <div className="fg-glow-orb fg-glow-2" />

      {/* Navigation */}
      <nav className="fg-nav">
        <div className="fg-nav-brand">
          <span className="fg-nav-title">FileGarden</span>
          <span className="fg-nav-badge">v2</span>
        </div>
        <div className="fg-nav-links">
          <a href="/">Viper</a>
          <a href="/imx">IMX</a>
          <a href="/plain">Plain</a>
          <a href="/fgarden" className="active">FGarden</a>
        </div>
      </nav>

      {/* Hero header */}
      <header className="fg-hero">
        <div className="fg-eyebrow">Cloud Storage</div>
        <h1 className="fg-hero-title">
          Upload to <span>FileGarden</span>
        </h1>
        <p className="fg-hero-sub">
          Upload local files or remote URLs directly to your FileGarden cloud storage.
        </p>
      </header>

      {/* Main content */}
      <main className="fg-main">
        {/* Conditional Rendering: Success State vs Upload Form */}
        {result && result.ok ? (
          <div className="fg-result success">
            <div className="fg-result-header">
              <div className="fg-result-icon">
                {Icons.check}
              </div>
              <span className="fg-result-title">Uploaded successfully</span>
            </div>
            <div className="fg-result-url-row">
              <code className="fg-result-url">{result.url}</code>
              <button
                className={`fg-btn${copiedUrl ? ' copied' : ''}`}
                onClick={() => copy(result.url!)}
              >
                {Icons.copy}
                {copiedUrl ? 'Copied' : 'Copy'}
              </button>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="fg-btn primary"
              >
                Open
                {Icons.externalLink}
              </a>
            </div>
            
            <button 
              className="fg-submit enabled" 
              style={{ marginTop: '24px' }}
              onClick={() => { 
                setResult(null); 
                setFile(null); 
                setUrlInput(''); 
                setStatus('idle'); 
              }}
            >
              {Icons.upload}
              Upload Another File
            </button>
          </div>
        ) : (
          <>
            {/* Mode tabs */}
            <div className="fg-tabs">
              <button
                className={`fg-tab${mode === 'file' ? ' active' : ''}`}
                onClick={() => { setMode('file'); setResult(null); setStatus('idle'); }}
              >
                {Icons.upload}
                File upload
              </button>
              <button
                className={`fg-tab${mode === 'url' ? ' active' : ''}`}
                onClick={() => { setMode('url'); setResult(null); setStatus('idle'); }}
              >
                {Icons.link}
                URL upload
              </button>
            </div>

            {/* Upload form card */}
            <div className="fg-card">
              {mode === 'file' ? (
                <div
                  className={`fg-dropzone${isDragging ? ' dragging' : ''}`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="fg-dropzone-icon">
                    {Icons.cloud}
                  </div>
                  {file ? (
                    <div className="fg-file-info">
                      <div className="fg-file-name">{file.name}</div>
                      <div className="fg-file-meta">
                        {formatFileSize(file.size)} · click to change
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="fg-dropzone-title">Drop file here or click to browse</div>
                      <div className="fg-dropzone-sub">Any file type supported</div>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
                  />
                </div>
              ) : (
                <div className="fg-field" style={{ marginBottom: '20px' }}>
                  <label className="fg-label">Remote URL</label>
                  <input
                    type="url"
                    className="fg-input mono"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && upload()}
                    placeholder="https://example.com/file.jpg"
                  />
                </div>
              )}

              <div className="fg-field">
                <label className="fg-label">
                  Directory <span className="fg-label-hint">(optional)</span>
                </label>
                <input
                  type="text"
                  className="fg-input"
                  value={dirInput}
                  onChange={e => setDirInput(e.target.value)}
                  placeholder="e.g. photos"
                />
              </div>
            </div>

            {/* Submit button */}
            <div className="fg-submit-wrap">
              <button
                className={`fg-submit ${canSubmit && status !== 'loading' ? 'enabled' : 'disabled'}`}
                onClick={upload}
                disabled={!canSubmit || status === 'loading'}
              >
                {status === 'loading' ? (
                  <>
                    <span className="fg-spinner" />
                    Uploading…
                  </>
                ) : (
                  <>
                    {Icons.upload}
                    Upload
                  </>
                )}
              </button>
            </div>
          </>
        )}


      </main>

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fg-toast-container">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`fg-toast ${toast.type}${toast.fadeOut ? ' fade-out' : ''}`}
            >
              <span style={{ flexShrink: 0 }}>
                {toast.type === 'success' ? Icons.check : Icons.x}
              </span>
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
