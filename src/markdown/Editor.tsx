import { useEffect, useRef, useCallback, useState } from 'react';
import { marked } from 'marked';
import { useStore, activeFile } from './store';
import { useEditorShortcuts } from './useEditorShortcuts';

marked.setOptions({ breaks: true, gfm: true } as object);

const LINK_RE     = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
const IMG_RE      = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
const AUTOLINK_RE = /(?<!\]\()(?<!\()(?<!")(https?:\/\/[^\s<>)]+)/g;

function highlightSource(raw: string): string {
  const esc = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = esc.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
    '<span class="hl-img">![$1](<span class="hl-url">$2</span>)</span>'
  );
  out = out.replace(
    /(?<!!)(\[([^\]]*)\]\((https?:\/\/[^\s)]+)\))/g,
    '<span class="hl-link">[$2](<span class="hl-url">$3</span>)</span>'
  );
  out = out.replace(
    /(?<!<span class="hl-url">)(?<!<span class="hl-link">)(?<!\()(https?:\/\/[^\s<>&)]+)/g,
    '<span class="hl-bare-url">$1</span>'
  );
  if (out.endsWith('\n') || out === '') out += ' ';
  return out;
}

export default function Editor() {
  const file = useStore(activeFile);
  const view = useStore(s => s.view);
  const updateContent = useStore(s => s.updateContent);
  const snippets = useStore(s => s.snippets);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropClipRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(() => marked.parse(file?.content ?? '') as string);
  const [highlighted, setHighlighted] = useState(() => highlightSource(file?.content ?? ''));

  const fileId = file?.id;
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || !file) return;
    ta.value = file.content;
    ta.scrollTop = 0;
    if (backdropClipRef.current) backdropClipRef.current.scrollTop = 0;
    setHtml(marked.parse(file.content) as string);
    setHighlighted(highlightSource(file.content));
  }, [fileId]);

  // rAF loop: always in sync regardless of scroll cause (selection, Ctrl+F, typing, etc.)
  useEffect(() => {
    // Measure actual scrollbar width and apply to backdrop so text wraps identically
    const ta = textareaRef.current;
    const clip = backdropClipRef.current;
    if (ta && clip) {
      const sw = ta.offsetWidth - ta.clientWidth;
      const bd = clip.firstElementChild as HTMLElement | null;
      if (bd) bd.style.paddingRight = `calc(24px + ${sw}px)`;
    }

    let rafId: number;
    const loop = () => {
      const ta = textareaRef.current;
      const clip = backdropClipRef.current;
      if (ta && clip) clip.scrollTop = ta.scrollTop;
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const showEditor = view === 'split' || view === 'editor';
  const showPreview = view === 'split' || view === 'preview';

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    updateContent(val);
    setHighlighted(highlightSource(val));
    setHtml(marked.parse(val) as string);
  }, [updateContent]);

  const handleKeyDown = useEditorShortcuts(updateContent, snippets);

  useEffect(() => {
    if (view === 'editor') textareaRef.current?.focus();
  }, [view, fileId]);

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {showEditor && (
        <div className={`editor-pane ${view === 'split' ? 'editor-pane--split' : 'editor-pane--full'}`}>
          {/* Backdrop: clip scrolls in sync with textarea via rAF */}
          <div ref={backdropClipRef} className="editor-backdrop-clip" aria-hidden="true">
            <div
              className="editor-backdrop"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          </div>
          <textarea
            ref={textareaRef}
            className="editor-textarea"
            defaultValue={file?.content ?? ''}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            placeholder="Start writing…"
          />
        </div>
      )}
      {showPreview && (
        <div className={`preview-pane ${view === 'split' ? '' : 'preview-pane--full'}`}>
          <div className="prose-md" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );
}
