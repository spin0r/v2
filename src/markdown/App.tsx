import { useState, useCallback, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Editor from './Editor';
import Statusbar from './Statusbar';
import Menu from './Menu';
import { useStore } from './store';

export default function App() {
  const sidebarOpen = useStore(s => s.sidebarOpen);
  const newFile = useStore(s => s.newFile);

  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const [modal, setModal] = useState<{ title: string; body: React.ReactNode } | null>(null);
  const [cursor, setCursor] = useState({ ln: 1, col: 1 });
  const [selection, setSelection] = useState<string>('');

  const handleMenuToggle = useCallback((btn: HTMLButtonElement) => {
    setMenuAnchor(a => (a ? null : btn));
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); newFile(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); /* already persisted via zustand */ }
      if (e.key === 'Escape') { setMenuAnchor(null); setModal(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [newFile]);

  // Track cursor position + live selection via event delegation
  useEffect(() => {
    const handler = (e: Event) => {
      const ta = e.target as HTMLTextAreaElement;
      if (ta.tagName !== 'TEXTAREA') return;
      const text = ta.value.substring(0, ta.selectionStart);
      const lines = text.split('\n');
      setCursor({ ln: lines.length, col: lines[lines.length - 1].length + 1 });
      // live selection
      const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
      setSelection(sel);
    };
    document.addEventListener('selectionchange', handler);
    document.addEventListener('keyup', handler);
    document.addEventListener('mouseup', handler);
    return () => {
      document.removeEventListener('selectionchange', handler);
      document.removeEventListener('keyup', handler);
      document.removeEventListener('mouseup', handler);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#14120b] text-[#edecec] font-sans">
      {sidebarOpen && <Sidebar />}

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar onMenuToggle={handleMenuToggle} />
        <Editor />
        <Statusbar cursor={cursor} selection={selection} />
      </div>

      {menuAnchor && (
        <Menu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          onShowModal={(title, body) => setModal({ title, body })}
        />
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div
            className="bg-[#1a1710] rounded-2xl w-full shadow-2xl"
            style={{ maxWidth: '560px', margin: '0 16px', border: '1px solid rgba(237,236,228,0.15)', boxShadow: '0 0 0 1px rgba(237,236,228,0.06), 0 24px 64px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[rgba(237,236,228,0.1)]" style={{ padding: '20px 24px 16px' }}>
              <h2 className="font-semibold text-[15px] text-[rgba(237,236,236,0.9)] tracking-tight">{modal.title}</h2>
              <button
                onClick={() => setModal(null)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-[rgba(237,236,236,0.4)] hover:text-[rgba(237,236,236,0.9)] hover:bg-[rgba(237,236,228,0.08)] transition-colors text-[14px] leading-none flex-shrink-0"
                style={{ marginLeft: '16px' }}
              >✕</button>
            </div>
            {/* Body */}
            <div className="overflow-y-auto" style={{ padding: '20px 24px', maxHeight: 'calc(100vh - 200px)' }}>{modal.body}</div>
            {/* Footer */}
            <div className="border-t border-[rgba(237,236,228,0.06)]" style={{ padding: '12px 24px 20px' }}>
              <button
                onClick={() => setModal(null)}
                className="w-full rounded-lg bg-[rgba(237,236,228,0.05)] hover:bg-[rgba(237,236,228,0.09)] text-[12px] text-[rgba(237,236,236,0.5)] hover:text-[rgba(237,236,236,0.8)] transition-colors font-mono tracking-wider uppercase"
                style={{ padding: '10px 0' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
