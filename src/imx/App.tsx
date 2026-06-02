import { useState } from 'react';
import { svgIcon } from '../utils';

export default function ImxApp() {
  const [mode, setMode] = useState<'upload' | 'extract' | 'single'>('upload');
  const [singleUploadMode, setSingleUploadMode] = useState<'file' | 'url'>('url');
  const [pasteUrl, setPasteUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [singleUrl, setSingleUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [galleryName, setGalleryName] = useState('');
  const [extractInput, setExtractInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  const handleUpload = async () => {
    if (!pasteUrl.trim()) return;
    
    setLoading(true);
    setResult(null);
    setProgress(null);

    const eventSource = new EventSource(
      `/api/imx/upload?url=${encodeURIComponent(pasteUrl)}&galleryName=${encodeURIComponent(galleryName)}&stream=true`
    );

    eventSource.addEventListener('phase', (e: any) => {
      const data = JSON.parse(e.data);
      setProgress({ phase: data.phase, done: 0, total: data.total || 0, success: 0, fail: 0 });
    });

    eventSource.addEventListener('progress', (e: any) => {
      const data = JSON.parse(e.data);
      setProgress((prev: any) => ({ ...prev, ...data }));
    });

    eventSource.addEventListener('done', (e: any) => {
      const data = JSON.parse(e.data);
      setResult(data);
      setLoading(false);
      eventSource.close();
    });

    eventSource.addEventListener('error', (e: any) => {
      setLoading(false);
      eventSource.close();
    });
  };

  const handleExtract = async () => {
    if (!extractInput.trim()) return;
    
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/imx/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractInput }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleSingleUpload = async () => {
    if (!selectedFile && !singleUrl.trim()) return;
    setLoading(true);
    setResult(null);

    const doFetch = async (base64?: string) => {
      try {
        const res = await fetch('/api/imx/upload-single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file: base64,
            url: !base64 ? singleUrl : undefined,
            filename: selectedFile?.name,
            galleryName
          }),
        });
        const data = await res.json();
        setResult(data);
      } catch (err) {
        setResult({ ok: false, error: (err as Error).message });
      } finally {
        setLoading(false);
      }
    };

    if (selectedFile) {
      try {
        const reader = new FileReader();
        reader.onload = (e) => doFetch(e.target?.result as string);
        reader.readAsDataURL(selectedFile);
      } catch (err) {
        setResult({ ok: false, error: (err as Error).message });
        setLoading(false);
      }
    } else {
      doFetch();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
      setSingleUrl('');
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="imx-app">
      <nav className="imx-nav">
        <a href="/" className="nav-logo imx-nav-logo" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span>IMX</span>
          <span className="imx-nav-badge">Tools</span>
        </a>
        <a href="/" className="imx-nav-link">← Back to Search</a>
      </nav>

      <div className="imx-hero">
        <div className="imx-hero-eyebrow">
          <div className="imx-hero-dot"></div>
          IMX Tools
        </div>
        <h1 className="imx-hero-title">
          IMX <span>Toolkit</span>
        </h1>
        <p className="imx-hero-sub">
          Extract direct URLs from imx.to viewer links, or upload images to IMX from a paste URL.
        </p>

        <div className="tabs">
          <button className={`tab-btn ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')}>
            Upload
          </button>
          <button className={`tab-btn ${mode === 'extract' ? 'active' : ''}`} onClick={() => setMode('extract')}>
            Extract
          </button>
          <button className={`tab-btn ${mode === 'single' ? 'active' : ''}`} onClick={() => setMode('single')}>
            Single File
          </button>
        </div>
      </div>

      <main className="imx-main">
        {mode === 'upload' ? (
          <div className="imx-form fade-in">
            <label className="imx-label">Paste URL (pb.dotrhelvetican.workers.dev)</label>
            <input
              className="imx-url-input"
              type="text"
              placeholder="https://pb.dotrhelvetican.workers.dev/XXXX"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
            />
            <label className="imx-label">Gallery name</label>
            <input
              className="imx-url-input"
              type="text"
              placeholder="My Gallery"
              value={galleryName}
              onChange={(e) => setGalleryName(e.target.value)}
            />
            <div className="imx-btn-row" style={{ justifyContent: 'flex-end', marginTop: '12px', display: 'flex' }}>
              {loading ? (
                <div className="inline-progress">
                  <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }}></div>
                  <span className="progress-label">{progress?.phase || "Initializing..."}</span>
                  {progress && progress.total > 0 && (
                    <span className="progress-counter">{progress.done}/{progress.total}</span>
                  )}
                  {progress && (progress.success > 0 || progress.fail > 0) && (
                    <div style={{ display: 'flex', gap: '6px', marginLeft: '8px', borderLeft: '1px solid rgba(192,133,50,0.2)', paddingLeft: '8px' }}>
                      {progress.success > 0 && <span style={{ color: '#6ee7b7', fontSize: '11px', fontFamily: 'var(--mono)', fontWeight: 500 }}>{progress.success} ok</span>}
                      {progress.fail > 0 && <span style={{ color: '#f87171', fontSize: '11px', fontFamily: 'var(--mono)', fontWeight: 500 }}>{progress.fail} fail</span>}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  className="search-btn"
                  onClick={handleUpload}
                >
                  <span dangerouslySetInnerHTML={{ __html: `${svgIcon('arrow_right')} Upload to IMX` }} />
                </button>
              )}
            </div>
          </div>
        ) : mode === 'single' ? (
          <div className="imx-form fade-in">
            <div className="tabs" style={{ marginBottom: '20px', display: 'flex', width: 'fit-content', margin: '0 auto 20px' }}>
              <button 
                className={`tab-btn ${singleUploadMode === 'url' ? 'active' : ''}`} 
                onClick={() => { setSingleUploadMode('url'); setSelectedFile(null); }}
              >
                Direct URL
              </button>
              <button 
                className={`tab-btn ${singleUploadMode === 'file' ? 'active' : ''}`} 
                onClick={() => { setSingleUploadMode('file'); setSingleUrl(''); }}
              >
                Local File
              </button>
            </div>

            {singleUploadMode === 'url' ? (
              <div className="fade-in">
                <label className="imx-label">Paste Direct Image URL</label>
                <input
                  className="imx-url-input"
                  type="text"
                  placeholder="https://example.com/image.jpg"
                  value={singleUrl}
                  onChange={(e) => {
                    setSingleUrl(e.target.value);
                    if (e.target.value) setSelectedFile(null);
                  }}
                />
              </div>
            ) : (
              <div 
                className={`dropzone fade-in ${isDragging ? 'active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setSelectedFile(e.target.files[0]);
                      setSingleUrl('');
                    }
                  }}
                />
                <div className="dropzone-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <div className="dropzone-text">
                  {selectedFile ? (
                    <span className="file-name">{selectedFile.name}</span>
                  ) : (
                    <>
                      <strong>Click to upload</strong> or drag and drop<br />
                      <span className="dropzone-sub">PNG, JPG, GIF, WEBP</span>
                    </>
                  )}
                </div>
              </div>
            )}

            <label className="imx-label" style={{ marginTop: '16px' }}>Gallery name (optional)</label>
            <input
              className="imx-url-input"
              type="text"
              placeholder="My Gallery"
              value={galleryName}
              onChange={(e) => setGalleryName(e.target.value)}
            />
            <div className="imx-btn-row" style={{ justifyContent: 'flex-end', marginTop: '16px', display: 'flex' }}>
              <button
                className="search-btn"
                onClick={handleSingleUpload}
                disabled={loading || (singleUploadMode === 'file' ? !selectedFile : !singleUrl.trim())}
              >
                {loading ? (
                  <>
                    <div className="spinner"></div> Uploading…
                  </>
                ) : (
                  <span dangerouslySetInnerHTML={{ __html: `${svgIcon('arrow_right')} Upload Image` }} />
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="imx-form fade-in">
            <label className="imx-label">Paste imx.to viewer links</label>
            <textarea
              className="imx-textarea"
              rows={8}
              placeholder="Paste imx.to/i/XXXX links here (one per line or mixed text)…"
              value={extractInput}
              onChange={(e) => setExtractInput(e.target.value)}
            />
            <button
              className="search-btn"
              style={{ marginTop: '12px', alignSelf: 'flex-end' }}
              onClick={handleExtract}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="spinner"></div> Extracting…
                </>
              ) : (
                <span dangerouslySetInnerHTML={{ __html: `${svgIcon('arrow_right')} Extract URLs` }} />
              )}
            </button>
          </div>
        )}

        {result && (
          <div className="imx-result fade-in">
            {result.ok ? (
              <>
                <div className="result-info-grid">
                  <div className="info-row">
                    <span className="info-key">Total</span>
                    <span className="info-val">{result.total}</span>
                  </div>
                  {result.extracted !== undefined && (
                    <div className="info-row">
                      <span className="info-key">Extracted</span>
                      <span className="info-val accent">{result.extracted}</span>
                    </div>
                  )}
                  {result.uploaded !== undefined && (
                    <div className="info-row">
                      <span className="info-key">Uploaded</span>
                      <span className="info-val accent">{result.uploaded}</span>
                    </div>
                  )}
                  {result.galleryUrl && (
                    <div className="info-row">
                      <span className="info-key">Gallery</span>
                      <span className="info-val">
                        <a className="paste-link" href={result.galleryUrl} target="_blank" rel="noopener">
                          {result.galleryUrl}
                        </a>
                      </span>
                    </div>
                  )}
                  {result.pasteUrl && (
                    <div className="info-row">
                      <span className="info-key">Paste</span>
                      <span className="info-val">
                        <a className="paste-link" href={result.pasteUrl} target="_blank" rel="noopener">
                          {result.pasteUrl}
                        </a>
                      </span>
                    </div>
                  )}
                </div>
                {result.previewUrls && result.previewUrls.length > 0 && (
                  <div className="preview-block" style={{ marginTop: '16px' }}>
                    {result.previewUrls.map((url: string, i: number) => (
                      <div key={i} className="preview-url" title={url}>
                        {url}
                      </div>
                    ))}
                  </div>
                )}
                {result.directUrls && result.directUrls.length > 0 && (
                  <div className="preview-block" style={{ marginTop: '16px' }}>
                    {result.directUrls.map((url: string, i: number) => (
                      <div key={i} className="preview-url" title={url}>
                        {url}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="error-msg">{result.error}</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
