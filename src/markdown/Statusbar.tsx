import { useStore, activeFile } from './store';

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function Statusbar({
  cursor,
  selection,
}: {
  cursor: { ln: number; col: number };
  selection: string;
}) {
  const file = useStore(activeFile);
  const content = file?.content ?? '';
  const words = countWords(content);
  const lines = content ? content.split('\n').length : 0;
  const bytes = new TextEncoder().encode(content).length;

  const hasSelection = selection.length > 0;
  const selChars = selection.length;
  const selWords = countWords(selection);
  const selLines = hasSelection ? selection.split('\n').length : 0;

  const sep = <span className="text-[rgba(237,236,236,0.2)]">·</span>;

  return (
    <footer style={{ paddingLeft: '20px', paddingRight: '16px' }} className="flex items-center gap-2 h-6 border-t border-[rgba(237,236,228,0.08)] bg-[#1a1710] flex-shrink-0 font-mono text-[10px] text-[rgba(237,236,236,0.35)]">
      <span>Markdown</span>
      {sep}
      <span>{bytes.toLocaleString()} bytes</span>
      {sep}
      <span>{words.toLocaleString()} words</span>
      {sep}
      <span>{lines.toLocaleString()} lines</span>
      {sep}

      {hasSelection ? (
        <span
          className="transition-all"
          style={{ color: '#d4a04a', opacity: 1 }}
        >
          {selChars.toLocaleString()} char{selChars !== 1 ? 's' : ''}
          {selWords > 0 && <>, {selWords.toLocaleString()} word{selWords !== 1 ? 's' : ''}</>}
          {selLines > 1 && <>, {selLines} lines</>}
          {' '}selected
        </span>
      ) : (
        <span>Ln {cursor.ln}, Col {cursor.col}</span>
      )}
    </footer>
  );
}
