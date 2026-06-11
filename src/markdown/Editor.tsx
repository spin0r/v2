import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { marked } from 'marked';
import { useStore, activeFile } from './store';
import { useEditorShortcuts } from './useEditorShortcuts';
import { getCaretCoordinates } from './getCaretCoordinates';

marked.setOptions({ breaks: true, gfm: true } as object);

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
    /(href=&quot;|src=&quot;)(https?:\/\/[^\s<>&"]+)(&quot;)/g,
    '$1<span class="hl-html-url">$2</span>$3'
  );
  out = out.replace(
    /(?<!<span class="hl-url">)(?<!<span class="hl-link">)(?<!<span class="hl-html-url">)(?<!\()(https?:\/\/[^\s<>&)]+)/g,
    '<span class="hl-bare-url">$1</span>'
  );
  out = out.replace(
    /(^|\s)(#[a-zA-Z0-9_-]+)/g,
    '$1<span class="hl-hashtag">$2</span>'
  );
  if (out.endsWith('\n') || out === '') out += ' ';
  return out;
}

const HASHTAG_RE = /(^|\s)(#[a-zA-Z0-9_-]+)/g;

export default function Editor() {
  const file = useStore(activeFile);
  const files = useStore(s => s.files);
  const view = useStore(s => s.view);
  const updateContent = useStore(s => s.updateContent);
  const snippets = useStore(s => s.snippets);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropClipRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(() => marked.parse(file?.content ?? '') as string);
  const [highlighted, setHighlighted] = useState(() => highlightSource(file?.content ?? ''));
  const htmlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cursorPos, setCursorPos] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState<string[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [popupCoords, setPopupCoords] = useState({ top: 0, left: 0 });

  // Pre-built hashtag index across all files — only recomputed when files change
  const allHashtags = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      for (const m of f.content.matchAll(HASHTAG_RE)) set.add(m[2]);
    }
    return set;
  }, [files]);

  const fileId = file?.id;
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || !file) return;
    ta.value = file.content;
    ta.scrollTop = 0;
    if (backdropClipRef.current) backdropClipRef.current.scrollTop = 0;
    setHighlighted(highlightSource(file.content));
    setHtml(marked.parse(file.content) as string);
    setShowAutocomplete(false);
    const pos = ta.selectionStart;
    setCursorPos(pos);
    checkAutocomplete(ta, pos, file.content);
  }, [fileId]);

  // rAF loop — only syncs scrollTop, skips if already in sync
  useEffect(() => {
    const ta = textareaRef.current;
    const clip = backdropClipRef.current;
    if (ta && clip) {
      const sw = ta.offsetWidth - ta.clientWidth;
      const bd = clip.firstElementChild as HTMLElement | null;
      if (bd) bd.style.paddingRight = `calc(24px + ${sw}px)`;
    }
    let rafId: number;
    let lastScroll = -1;
    const loop = () => {
      const ta = textareaRef.current;
      const clip = backdropClipRef.current;
      if (ta && clip && ta.scrollTop !== lastScroll) {
        clip.scrollTop = lastScroll = ta.scrollTop;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const showEditor = view === 'split' || view === 'editor';
  const showPreview = view === 'split' || view === 'preview';

  const checkAutocomplete = useCallback((ta: HTMLTextAreaElement, pos: number, text: string) => {
    const textBeforeCursor = text.slice(0, pos);
    const match = textBeforeCursor.match(/(^|\s)(#[a-zA-Z0-9_-]*)$/);
    if (match) {
      const activePrefix = match[2];
      // Use pre-built index; also include current file's live text
      const liveSet = new Set(allHashtags);
      for (const m of text.matchAll(HASHTAG_RE)) liveSet.add(m[2]);
      const suggestions = Array.from(liveSet).filter(
        h => h.toLowerCase().startsWith(activePrefix.toLowerCase()) && h !== activePrefix
      );
      if (suggestions.length > 0) {
        const coords = getCaretCoordinates(ta, pos);
        const taRect = ta.getBoundingClientRect();
        const caretTop = taRect.top + coords.top - ta.scrollTop;
        const caretLeft = taRect.left + coords.left - ta.scrollLeft;
        caretHeightRef.current = coords.height || 20;
        setPopupCoords({ top: caretTop + caretHeightRef.current + 4, left: caretLeft });
        setAutocompleteOptions(suggestions);
        setShowAutocomplete(true);
        setAutocompleteIndex(prev => Math.max(0, Math.min(prev, suggestions.length - 1)));
      } else {
        setShowAutocomplete(false);
      }
    } else {
      setShowAutocomplete(false);
    }
  }, [allHashtags]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    updateContent(val);
    setHighlighted(highlightSource(val));
    // Debounce preview render — not needed for typing feel
    if (htmlTimerRef.current) clearTimeout(htmlTimerRef.current);
    htmlTimerRef.current = setTimeout(() => setHtml(marked.parse(val) as string), 150);
    const pos = e.target.selectionStart;
    setCursorPos(pos);
    checkAutocomplete(e.target, pos, val);
  }, [updateContent, checkAutocomplete]);

  const handleCursorMove = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const pos = ta.selectionStart;
    setCursorPos(pos);
    const key = (e.nativeEvent as KeyboardEvent).key;
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Escape' || key === 'Enter' || key === 'Tab') return;
    checkAutocomplete(ta, pos, ta.value);
  }, [checkAutocomplete]);

  const popupRef = useRef<HTMLUListElement>(null);
  const caretHeightRef = useRef(20);

  // After popup renders, flip above caret if it overflows viewport bottom
  useEffect(() => {
    const el = popupRef.current;
    if (!el || !showAutocomplete) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) {
      setPopupCoords(c => ({ ...c, top: c.top - rect.height - caretHeightRef.current - 8 }));
    }
  }, [showAutocomplete, autocompleteOptions]);

  const baseHandleKeyDown = useEditorShortcuts(updateContent, snippets);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocompleteIndex(i => (i + 1) % autocompleteOptions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocompleteIndex(i => (i - 1 + autocompleteOptions.length) % autocompleteOptions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const option = autocompleteOptions[autocompleteIndex];
        const text = textareaRef.current?.value ?? '';
        const match = text.slice(0, cursorPos).match(/(^|\s)(#[a-zA-Z0-9_-]*)$/);
        if (match) {
          const prefixLength = match[2].length;
          const start = cursorPos - prefixLength;
          const newVal = text.slice(0, start) + option + text.slice(cursorPos);
          updateContent(newVal);
          setHighlighted(highlightSource(newVal));
          setHtml(marked.parse(newVal) as string);
          setShowAutocomplete(false);
          const ta = textareaRef.current;
          if (ta) {
            ta.value = newVal;
            const newPos = start + option.length;
            ta.setSelectionRange(newPos, newPos);
            ta.focus();
            setCursorPos(newPos);
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowAutocomplete(false);
        return;
      }
    }
    baseHandleKeyDown(e);
  }, [showAutocomplete, autocompleteOptions, autocompleteIndex, cursorPos, updateContent, baseHandleKeyDown]);

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
            onClick={handleCursorMove}
            onKeyUp={handleCursorMove}
            onScroll={() => {
              const ta = textareaRef.current;
              if (ta && showAutocomplete) checkAutocomplete(ta, cursorPos, ta.value);
            }}
            spellCheck={false}
            placeholder="Start writing…"
          />
          {showAutocomplete && (
            <ul
              ref={popupRef}
              className="fixed bg-[#1a1710] border border-[rgba(237,236,228,0.15)] shadow-2xl rounded-md z-50 py-1"
              style={{
                top: popupCoords.top,
                left: popupCoords.left,
                maxHeight: '200px',
                overflowY: 'auto',
                minWidth: '160px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
              }}
            >
              {autocompleteOptions.map((opt, i) => (
                <li
                  key={opt}
                  className={`px-3 py-1.5 text-sm cursor-pointer transition-colors ${i === autocompleteIndex ? 'bg-[#d4a04a] text-[#14120b] font-medium' : 'text-[#edecec] hover:bg-[rgba(237,236,228,0.08)]'}`}
                  onClick={() => {
                    const text = textareaRef.current?.value ?? '';
                    const match = text.slice(0, cursorPos).match(/(^|\s)(#[a-zA-Z0-9_-]*)$/);
                    if (match) {
                      const prefixLength = match[2].length;
                      const start = cursorPos - prefixLength;
                      const before = text.slice(0, start);
                      const after = text.slice(cursorPos);
                      const newVal = before + opt + after;
                      
                      updateContent(newVal);
                      setHighlighted(highlightSource(newVal));
                      setHtml(marked.parse(newVal) as string);
                      setShowAutocomplete(false);
                      const ta = textareaRef.current;
                      if (ta) {
                        ta.value = newVal;
                        const newPos = start + opt.length;
                        ta.setSelectionRange(newPos, newPos);
                        ta.focus();
                        setCursorPos(newPos);
                      }
                    }
                  }}
                  onMouseEnter={() => setAutocompleteIndex(i)}
                >
                  {opt}
                </li>
              ))}
            </ul>
          )}
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
