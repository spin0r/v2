import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { marked } from 'marked';
import { useStore, activeFile } from './store';
import { useEditorShortcuts } from './useEditorShortcuts';
import { getCaretCoordinates } from './getCaretCoordinates';

marked.setOptions({ breaks: true, gfm: true } as object);

const LINE_H = 24; // must match line-height in CSS

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
  const gutterRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(() => marked.parse(file?.content ?? '') as string);
  const [highlighted, setHighlighted] = useState(() => highlightSource(file?.content ?? ''));
  const htmlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gutterState, setGutterState] = useState(() => {
    const lines = (file?.content ?? '').split('\n');
    return { rowHeights: lines.map(() => 1), totalRows: lines.length };
  });

  const [cursorPos, setCursorPos] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState<string[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [popupCoords, setPopupCoords] = useState({ top: 0, left: 0 });

  const allHashtags = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      for (const m of f.content.matchAll(HASHTAG_RE)) set.add(m[2]);
    }
    return set;
  }, [files]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const measureRowHeights = useCallback((text: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const contentWidth = ta.clientWidth - 48;
    if (contentWidth <= 0) return;

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const ctx = canvasRef.current.getContext('2d')!;
    const computed = window.getComputedStyle(ta);
    ctx.font = `${computed.fontSize} ${computed.fontFamily}`;

    const lines = text.split('\n');
    const rowHeights = lines.map(line =>
      line ? Math.ceil(ctx.measureText(line).width / contentWidth) || 1 : 1
    );

    // Use actual scrollHeight to get true total visual rows (accounts for word-boundary wrapping)
    const trueTotal = Math.round((ta.scrollHeight - 48) / LINE_H);
    const canvasTotal = rowHeights.reduce((a, b) => a + b, 0);
    const diff = trueTotal - canvasTotal;

    // Distribute extra rows to longest lines (most likely to have been undercounted)
    if (diff > 0) {
      const widths = lines.map(line => ctx.measureText(line).width);
      const order = widths.map((_, i) => i).sort((a, b) => widths[b] - widths[a]);
      for (let i = 0; i < diff && i < order.length; i++) rowHeights[order[i]]++;
    }

    const totalRows = rowHeights.reduce((a, b) => a + b, 0);
    setGutterState({ rowHeights, totalRows });
  }, []);

  const fileId = file?.id;
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || !file) return;
    ta.value = file.content;
    ta.scrollTop = 0;
    if (backdropClipRef.current) backdropClipRef.current.scrollTop = 0;
    if (gutterRef.current) gutterRef.current.scrollTop = 0;
    setHighlighted(highlightSource(file.content));
    setHtml(marked.parse(file.content) as string);
    setShowAutocomplete(false);
    const pos = ta.selectionStart;
    setCursorPos(pos);
    checkAutocomplete(ta, pos, file.content);
    // measure after paint so clientWidth is valid
    requestAnimationFrame(() => measureRowHeights(file.content));
  }, [fileId]);

  // rAF loop — syncs scrollTop only (no horizontal scroll needed with word-wrap)
  useEffect(() => {
    let rafId: number;
    let lastScrollTop = -1;
    const loop = () => {
      const ta = textareaRef.current;
      const clip = backdropClipRef.current;
      const gutter = gutterRef.current;
      if (ta && ta.scrollTop !== lastScrollTop) {
        lastScrollTop = ta.scrollTop;
        if (clip) clip.scrollTop = lastScrollTop;
        if (gutter) gutter.scrollTop = lastScrollTop;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Remeasure on resize (e.g. split-pane drag, window resize)
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const ro = new ResizeObserver(() => {
      if (ta.value) measureRowHeights(ta.value);
    });
    ro.observe(ta);
    return () => ro.disconnect();
  }, [measureRowHeights]);

  const showEditor = view === 'split' || view === 'editor';
  const showPreview = view === 'split' || view === 'preview';

  const checkAutocomplete = useCallback((ta: HTMLTextAreaElement, pos: number, text: string) => {
    const textBeforeCursor = text.slice(0, pos);
    const match = textBeforeCursor.match(/(^|\s)(#[a-zA-Z0-9_-]*)$/);
    if (match) {
      const activePrefix = match[2];
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
    measureRowHeights(val);
    if (htmlTimerRef.current) clearTimeout(htmlTimerRef.current);
    htmlTimerRef.current = setTimeout(() => setHtml(marked.parse(val) as string), 150);
    const pos = e.target.selectionStart;
    setCursorPos(pos);
    checkAutocomplete(e.target, pos, val);
  }, [updateContent, checkAutocomplete, measureRowHeights]);

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

  const lineNumbers = useMemo(() => {
    const { rowHeights, totalRows } = gutterState;
    const nums: number[] = [];
    let visual = 1;
    rowHeights.forEach(rows => {
      for (let r = 0; r < rows; r++) nums.push(visual++);
    });
    if (nums.length === 0) return Array.from({ length: totalRows }, (_, i) => i + 1);
    return nums;
  }, [gutterState]);

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {showEditor && (
        <div className={`editor-pane ${view === 'split' ? 'editor-pane--split' : 'editor-pane--full'}`}>
          <div ref={gutterRef} className="editor-gutter" aria-hidden="true">
            <div className="editor-gutter-inner">
              {lineNumbers.map((n, i) => (
                <div key={i} className="editor-gutter-line">
                  {n}
                </div>
              ))}
            </div>
          </div>
          <div ref={backdropClipRef} className="editor-backdrop-clip" aria-hidden="true">
            <div className="editor-backdrop" dangerouslySetInnerHTML={{ __html: highlighted }} />
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
              if (!ta) return;
              if (backdropClipRef.current) backdropClipRef.current.scrollTop = ta.scrollTop;
              if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
              if (showAutocomplete) checkAutocomplete(ta, cursorPos, ta.value);
            }}
            spellCheck={false}
            wrap="soft"
            placeholder="Start writing…"
          />
          {showAutocomplete && (
            <ul
              ref={popupRef}
              className="fixed bg-[#1a1710] border border-[rgba(237,236,228,0.15)] shadow-2xl rounded-md z-50 py-1"
              style={{ top: popupCoords.top, left: popupCoords.left, maxHeight: '200px', overflowY: 'auto', minWidth: '160px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
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
                      const newVal = text.slice(0, start) + opt + text.slice(cursorPos);
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
