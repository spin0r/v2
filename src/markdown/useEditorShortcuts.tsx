import { useCallback } from 'react';

/**
 * VSCode-like keyboard shortcuts for a <textarea> markdown editor.
 *
 * Uses `document.execCommand` (with `inputEvent` fallback) to mutate the
 * textarea value so the browser's native Undo/Redo stack is preserved.
 */
export function useEditorShortcuts(updateContent: (v: string) => void) {
  return useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const val = ta.value;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    // ── Helpers ──────────────────────────────────────────────────────

    /** Return [lineStart, lineEnd] for the line containing `pos`. */
    const lineRange = (pos: number): [number, number] => {
      const ls = val.lastIndexOf('\n', pos - 1) + 1;
      const le = val.indexOf('\n', pos);
      return [ls, le === -1 ? val.length : le];
    };

    /** Return [firstLineStart, lastLineEnd] spanning a whole selection. */
    const selectedLines = (): [number, number] => {
      const ls = val.lastIndexOf('\n', start - 1) + 1;
      // For the end, if the cursor is at the very start of a line we don't
      // include that line (matches VSCode).
      const effectiveEnd = end > start && val[end - 1] === '\n' ? end - 1 : end;
      const le = val.indexOf('\n', effectiveEnd);
      return [ls, le === -1 ? val.length : le];
    };

    /**
     * Replace a range `[from, to)` in the textarea value with `text`,
     * then set the selection to `[selStart, selEnd]`.
     *
     * This preserves the native undo stack by using `execCommand`.
     */
    const replaceRange = (
      from: number,
      to: number,
      text: string,
      selStart: number,
      selEnd: number = selStart,
    ) => {
      ta.focus();
      ta.setSelectionRange(from, to);

      // execCommand('insertText') preserves undo history in most browsers
      const ok = document.execCommand('insertText', false, text);
      if (!ok) {
        // Fallback: manually splice + dispatch input event
        const before = ta.value.slice(0, from);
        const after = ta.value.slice(to);
        ta.value = before + text + after;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }

      ta.setSelectionRange(selStart, selEnd);
      updateContent(ta.value);
    };


    // ── Tab / Shift+Tab — indent / outdent ───────────────────────────

    if (e.key === 'Tab') {
      e.preventDefault();
      const [ls, le] = selectedLines();
      const block = val.slice(ls, le);

      if (e.shiftKey) {
        // Outdent: remove up to 2 leading spaces per line
        const dedented = block.replace(/^( {1,2})/gm, '');
        const firstLineTrim = block.match(/^( {1,2})/)?.[1]?.length ?? 0;
        const diff = block.length - dedented.length;
        replaceRange(
          ls, le, dedented,
          Math.max(ls, start - firstLineTrim),
          Math.max(ls, end - diff),
        );
      } else if (start !== end) {
        // Multi-line indent: prepend 2 spaces to every line
        const indented = block.replace(/^/gm, '  ');
        const lineCount = block.split('\n').length;
        replaceRange(ls, le, indented, start + 2, end + lineCount * 2);
      } else {
        // Single cursor: insert 2 spaces
        replaceRange(start, end, '  ', start + 2);
      }
      return;
    }

    // ── Enter — auto-indent + list continuation ──────────────────────

    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      const [ls] = lineRange(start);
      const line = val.slice(ls, start);

      // Detect leading whitespace
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';

      // Detect list markers:  - , * , + , 1. , 2) , - [ ] , - [x]
      const listMatch = line.match(/^(\s*)([-*+]|\d+[.)]) (\[[ x]\] )?/);

      if (listMatch) {
        const prefix = listMatch[1]; // leading whitespace
        const marker = listMatch[2]; // the marker itself
        const checkbox = listMatch[3] ?? ''; // optional checkbox

        // If the current line is an empty list item, clear it instead of continuing
        const fullMatch = listMatch[0];
        if (line.trim() === fullMatch.trim()) {
          e.preventDefault();
          replaceRange(ls, start, '', ls);
          return;
        }

        e.preventDefault();
        // Increment numbered lists
        let nextMarker = marker;
        const numMatch = marker.match(/^(\d+)([.)])/);
        if (numMatch) {
          nextMarker = `${parseInt(numMatch[1]) + 1}${numMatch[2]}`;
        }
        const continuation = `\n${prefix}${nextMarker} ${checkbox ? '[ ] ' : ''}`;
        replaceRange(start, end, continuation, start + continuation.length);
        return;
      }

      if (indent) {
        e.preventDefault();
        const insertion = '\n' + indent;
        replaceRange(start, end, insertion, start + insertion.length);
        return;
      }
      // Otherwise let the browser handle plain Enter
      return;
    }

    // ── Ctrl+Enter — insert line below ───────────────────────────────

    if (e.ctrlKey && !e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      const [, le] = lineRange(start);
      replaceRange(le, le, '\n', le + 1);
      return;
    }

    // ── Ctrl+Shift+Enter — insert line above ─────────────────────────

    if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      const [ls] = lineRange(start);
      replaceRange(ls, ls, '\n', ls);
      return;
    }

    // ── Ctrl+/ — toggle line comment ─────────────────────────────────

    if (e.ctrlKey && e.key === '/') {
      e.preventDefault();
      const [ls, le] = selectedLines();
      const block = val.slice(ls, le);
      const lines = block.split('\n');

      // Check if ALL lines are commented
      const allCommented = lines.every(
        l => l.trimStart().startsWith('<!-- ') && l.trimEnd().endsWith(' -->'),
      );

      let result: string;
      let newStart: number;
      let newEnd: number;

      if (allCommented) {
        // Uncomment all lines
        result = lines
          .map(l => {
            const idx = l.indexOf('<!-- ');
            const prefix = l.slice(0, idx);
            const rest = l.slice(idx + 5); // skip '<!-- '
            return prefix + rest.slice(0, rest.length - 4); // remove ' -->'
          })
          .join('\n');
        const firstDelta = lines[0].indexOf('<!-- ') >= 0 ? -5 : 0;
        newStart = Math.max(ls, start + firstDelta);
        newEnd = Math.max(newStart, end - (block.length - result.length));
      } else {
        // Comment all lines
        result = lines.map(l => `<!-- ${l} -->`).join('\n');
        newStart = start + 5; // '<!-- ' added before first char
        newEnd = end + (result.length - block.length);
      }

      replaceRange(ls, le, result, newStart, newEnd);
      return;
    }

    // ── Ctrl+L — select line ─────────────────────────────────────────

    if (e.ctrlKey && !e.shiftKey && e.key === 'l') {
      e.preventDefault();
      const [ls, le] = lineRange(start);
      ta.setSelectionRange(ls, le === val.length ? le : le + 1);
      return;
    }

    // ── Ctrl+Shift+K — delete line ───────────────────────────────────

    if (e.ctrlKey && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
      e.preventDefault();
      const [ls, le] = selectedLines();
      // Include the trailing newline if there is one
      const delEnd = le < val.length ? le + 1 : ls > 0 ? ls - 1 : le;
      const delStart = le < val.length ? ls : (ls > 0 ? ls - 1 : ls);
      replaceRange(delStart, delEnd, '', Math.max(0, delStart), Math.max(0, delStart));
      return;
    }

    // ── Ctrl+D — select next occurrence (add selection) ──────────────
    // In VSCode this is "Add Selection to Next Find Match".
    // In a textarea we can only approximate: select the next occurrence of
    // the current word or selection.
    if (e.ctrlKey && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      if (start === end) {
        // No selection — select the current word
        const wordBefore = val.slice(0, start).match(/\w+$/)?.[0] ?? '';
        const wordAfter = val.slice(start).match(/^\w+/)?.[0] ?? '';
        const wordStart = start - wordBefore.length;
        const wordEnd = start + wordAfter.length;
        if (wordStart !== wordEnd) {
          ta.setSelectionRange(wordStart, wordEnd);
        }
      } else {
        // Has selection — find and select next occurrence
        const selected = val.slice(start, end);
        const searchFrom = end;
        let nextIdx = val.indexOf(selected, searchFrom);
        if (nextIdx === -1) {
          // Wrap around
          nextIdx = val.indexOf(selected);
        }
        if (nextIdx !== -1 && nextIdx !== start) {
          ta.setSelectionRange(nextIdx, nextIdx + selected.length);
        }
      }
      return;
    }

    // ── Shift+Alt+↓ — copy line down (duplicate down) ────────────────

    if (e.altKey && e.shiftKey && e.key === 'ArrowDown') {
      e.preventDefault();
      const [ls, le] = selectedLines();
      const block = val.slice(ls, le);
      const insertion = '\n' + block;
      const blockLen = le - ls;
      replaceRange(le, le, insertion, start + blockLen + 1, end + blockLen + 1);
      return;
    }

    // ── Shift+Alt+↑ — copy line up (duplicate up) ────────────────────

    if (e.altKey && e.shiftKey && e.key === 'ArrowUp') {
      e.preventDefault();
      const [ls, le] = selectedLines();
      const block = val.slice(ls, le);
      const insertion = block + '\n';
      replaceRange(ls, ls, insertion, start, end);
      return;
    }

    // ── Alt+↓ — move line down ───────────────────────────────────────

    if (e.altKey && !e.shiftKey && e.key === 'ArrowDown') {
      e.preventDefault();
      const [ls, le] = selectedLines();
      if (le >= val.length) return; // already at bottom
      const [, nle] = lineRange(le + 1);
      const curBlock = val.slice(ls, le);
      const nextLine = val.slice(le + 1, nle);
      const result = nextLine + '\n' + curBlock;
      const delta = nextLine.length + 1;
      replaceRange(ls, nle, result, start + delta, end + delta);
      return;
    }

    // ── Alt+↑ — move line up ─────────────────────────────────────────

    if (e.altKey && !e.shiftKey && e.key === 'ArrowUp') {
      e.preventDefault();
      const [ls, le] = selectedLines();
      if (ls === 0) return; // already at top
      const [pls] = lineRange(ls - 1);
      const curBlock = val.slice(ls, le);
      const prevLine = val.slice(pls, ls - 1); // exclude the \n
      const result = curBlock + '\n' + prevLine;
      const delta = prevLine.length + 1;
      replaceRange(pls, le, result, start - delta, end - delta);
      return;
    }

    // ── Ctrl+] — indent line(s) ──────────────────────────────────────

    if (e.ctrlKey && e.key === ']') {
      e.preventDefault();
      const [ls, le] = selectedLines();
      const block = val.slice(ls, le);
      const indented = block.replace(/^/gm, '  ');
      const lineCount = block.split('\n').length;
      replaceRange(ls, le, indented, start + 2, end + lineCount * 2);
      return;
    }

    // ── Ctrl+[ — outdent line(s) ─────────────────────────────────────

    if (e.ctrlKey && e.key === '[') {
      e.preventDefault();
      const [ls, le] = selectedLines();
      const block = val.slice(ls, le);
      const dedented = block.replace(/^( {1,2})/gm, '');
      const firstLineTrim = block.match(/^( {1,2})/)?.[1]?.length ?? 0;
      const diff = block.length - dedented.length;
      replaceRange(
        ls, le, dedented,
        Math.max(ls, start - firstLineTrim),
        Math.max(ls, end - diff),
      );
      return;
    }

    // ── Home — smart home (toggle between first non-whitespace and column 0) ─

    if (e.key === 'Home' && !e.ctrlKey) {
      e.preventDefault();
      const [ls] = lineRange(start);
      const lineText = val.slice(ls);
      const firstNonWs = ls + (lineText.match(/^\s*/)![0].length);
      const newPos = start === firstNonWs ? ls : firstNonWs;
      if (e.shiftKey) {
        ta.setSelectionRange(newPos, end);
      } else {
        ta.setSelectionRange(newPos, newPos);
      }
      return;
    }

    // ── End — smart end ──────────────────────────────────────────────

    if (e.key === 'End' && !e.ctrlKey) {
      e.preventDefault();
      const [, le] = lineRange(start);
      if (e.shiftKey) {
        ta.setSelectionRange(start, le);
      } else {
        ta.setSelectionRange(le, le);
      }
      return;
    }
  }, [updateContent]);
}
