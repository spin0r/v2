import { useEffect, useRef } from 'react';
import { useStore, activeFile } from './store';

const SHORTCUTS = [
  ['Ctrl+S', 'Save file'],
  ['Ctrl+N', 'New file'],
  ['Tab', 'Indent (2 spaces)'],
  ['Double-click', 'Rename file in sidebar'],
];

const CHEATSHEET = [
  ['# Heading', 'H1–H6 with #–######'],
  ['**bold**', 'Bold text'],
  ['*italic*', 'Italic text'],
  ['`code`', 'Inline code'],
  ['```lang', 'Code block'],
  ['> quote', 'Blockquote'],
  ['- item', 'Unordered list'],
  ['1. item', 'Ordered list'],
  ['[text](url)', 'Link'],
  ['![alt](url)', 'Image'],
  ['---', 'Horizontal rule'],
  ['| a | b |', 'Table'],
];

interface Props {
  anchor: HTMLButtonElement | null;
  onClose: () => void;
  onShowModal: (title: string, body: React.ReactNode) => void;
}

export default function Menu({ anchor, onClose, onShowModal }: Props) {
  const file = useStore(activeFile);
  const renameFile = useStore(s => s.renameFile);
  const deleteFile = useStore(s => s.deleteFile);
  const ref = useRef<HTMLDivElement>(null);

  // position below anchor
  const style = anchor
    ? { top: anchor.getBoundingClientRect().bottom + 4, right: window.innerWidth - anchor.getBoundingClientRect().right }
    : {};

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && e.target !== anchor) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchor, onClose]);

  const handleRename = () => {
    onClose();
    const name = prompt('Rename file:', file?.name);
    if (name?.trim()) renameFile(file!.id, name.trim().endsWith('.md') ? name.trim() : name.trim() + '.md');
  };

  const handleDelete = () => {
    onClose();
    if (confirm(`Delete "${file?.name}"?`)) deleteFile(file!.id);
  };

  const handleShortcuts = () => {
    onClose();
    onShowModal('Keyboard Shortcuts', (
      <table className="w-full text-[12px]">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k} className="border-b border-[rgba(237,236,228,0.06)]">
              <td className="py-2 pr-4 font-mono text-[#c08532]">{k}</td>
              <td className="py-2 text-[rgba(237,236,236,0.6)]">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ));
  };

  const handleCheatsheet = () => {
    onClose();
    onShowModal('Markdown Cheatsheet', (
      <table className="w-full text-[12px]">
        <tbody>
          {CHEATSHEET.map(([k, v]) => (
            <tr key={k} className="border-b border-[rgba(237,236,228,0.06)]">
              <td className="py-2 pr-4 font-mono text-[#c08532]">{k}</td>
              <td className="py-2 text-[rgba(237,236,236,0.6)]">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ));
  };

  return (
    <div
      ref={ref}
      style={{ ...style, position: 'fixed', zIndex: 50 }}
      className="w-48 bg-[#211e15] border border-[rgba(237,236,228,0.1)] rounded-xl shadow-2xl py-1 overflow-hidden"
    >
      {[
        { label: 'Rename', action: handleRename },
        { label: 'Delete', action: handleDelete, danger: true },
      ].map(({ label, action, danger }) => (
        <button
          key={label}
          onClick={action}
          className={`w-full text-left px-4 py-2 text-[13px] transition-colors hover:bg-[rgba(237,236,228,0.06)] ${danger ? 'text-[#f87171]' : 'text-[rgba(237,236,236,0.8)]'}`}
        >
          {label}
        </button>
      ))}
      <div className="my-1 border-t border-[rgba(237,236,228,0.08)]" />
      {[
        { label: 'Keyboard Shortcuts', action: handleShortcuts },
        { label: 'Markdown Cheatsheet', action: handleCheatsheet },
      ].map(({ label, action }) => (
        <button
          key={label}
          onClick={action}
          className="w-full text-left px-4 py-2 text-[13px] text-[rgba(237,236,236,0.8)] transition-colors hover:bg-[rgba(237,236,228,0.06)]"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
