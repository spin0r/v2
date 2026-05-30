import { useEffect, useRef, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import { useStore, activeFile } from './store';

marked.setOptions({ breaks: true, gfm: true } as object);

/* ── Regex patterns for markdown link/URL detection ── */
const LINK_RE    = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;      // [text](url)
const IMG_RE     = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;      // ![alt](url)
const AUTOLINK_RE = /(?<!\]\()(?<!\()(?<!")(https?:\/\/[^\s<>)]+)/g; // bare URLs

/**
 * Build highlighted HTML from raw markdown text.
 * Links and images get coloured spans; everything else stays plain.
 */
function highlightSource(raw: string): string {
  // Escape HTML first
  const esc = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Phase 1: mark image links  ![alt](url)
  let out = esc.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
    '<span class="hl-img">![$1](<span class="hl-url">$2</span>)</span>'
  );

  // Phase 2: mark markdown links  [text](url)  — only ones not already wrapped
  out = out.replace(
    /(?<!!)(\[([^\]]*)\]\((https?:\/\/[^\s)]+)\))/g,
    '<span class="hl-link">[$2](<span class="hl-url">$3</span>)</span>'
  );

  // Phase 3: bare auto-links (not already inside a span)
  out = out.replace(
    /(?<!<span class="hl-url">)(?<!<span class="hl-link">)(?<!\()(https?:\/\/[^\s<>&)]+)/g,
    '<span class="hl-bare-url">$1</span>'
  );

  // Preserve trailing newline so the backdrop always matches the textarea height
  if (out.endsWith('\n') || out === '') out += ' ';
  return out;
}

export default function Editor() {
  const file = useStore(activeFile);
  const view = useStore(s => s.view);
  const updateContent = useStore(s => s.updateContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const content = file?.content ?? '';
  const html = marked.parse(content) as string;
  const highlighted = useMemo(() => highlightSource(content), [content]);

  const showEditor = view === 'split' || view === 'editor';
  const showPreview = view === 'split' || view === 'preview';

  /* ── Sync scroll between textarea and backdrop ── */
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const bd = backdropRef.current;
    if (ta && bd) {
      bd.scrollTop = ta.scrollTop;
      bd.scrollLeft = ta.scrollLeft;
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
      updateContent(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }, [updateContent]);

  // focus editor when switching to editor view
  useEffect(() => {
    if (view === 'editor') textareaRef.current?.focus();
  }, [view, file?.id]);

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {showEditor && (
        <div className={`editor-pane ${view === 'split' ? 'editor-pane--split' : 'editor-pane--full'}`}>
          {/* Highlight backdrop — sits behind the transparent textarea */}
          <div
            ref={backdropRef}
            className="editor-backdrop"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
          {/* Real textarea — fully transparent text, captures all input */}
          <textarea
            ref={textareaRef}
            className="editor-textarea"
            value={content}
            onChange={e => updateContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={syncScroll}
            spellCheck={false}
            placeholder="Start writing…"
          />
        </div>
      )}
      {showPreview && (
        <div className={`preview-pane ${view === 'split' ? '' : 'preview-pane--full'}`}>
          <div
            className="prose-md"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
    </div>
  );
}
