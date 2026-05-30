import { useStore, activeFile } from './store';

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function Statusbar({ cursor }: { cursor: { ln: number; col: number } }) {
  const file = useStore(activeFile);
  const content = file?.content ?? '';
  const words = countWords(content);
  const lines = content ? content.split('\n').length : 0;
  const bytes = new TextEncoder().encode(content).length;

  const sep = <span className="text-[rgba(237,236,236,0.2)]">·</span>;

  return (
    <footer className="flex items-center gap-2 h-6 px-4 border-t border-[rgba(237,236,228,0.08)] bg-[#1a1710] flex-shrink-0 font-mono text-[10px] text-[rgba(237,236,236,0.35)]">
      <span>Markdown</span>
      {sep}
      <span>{bytes.toLocaleString()} bytes</span>
      {sep}
      <span>{words.toLocaleString()} words</span>
      {sep}
      <span>{lines.toLocaleString()} lines</span>
      {sep}
      <span>Ln {cursor.ln}, Col {cursor.col}</span>
    </footer>
  );
}
