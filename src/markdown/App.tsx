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

  // Track cursor position via event delegation
  useEffect(() => {
    const handler = (e: Event) => {
      const ta = e.target as HTMLTextAreaElement;
      if (ta.tagName !== 'TEXTAREA') return;
      const text = ta.value.substring(0, ta.selectionStart);
      const lines = text.split('\n');
      setCursor({ ln: lines.length, col: lines[lines.length - 1].length + 1 });
    };
    document.addEventListener('selectionchange', handler);
    document.addEventListener('keyup', handler);
    document.addEventListener('click', handler);
    return () => {
      document.removeEventListener('selectionchange', handler);
      document.removeEventListener('keyup', handler);
      document.removeEventListener('click', handler);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#14120b] text-[#edecec] font-sans">
      {sidebarOpen && <Sidebar />}

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar onMenuToggle={handleMenuToggle} />
        <Editor />
        <Statusbar cursor={cursor} />
      </div>

      {menuAnchor && (
        <Menu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          onShowModal={(title, body) => setModal({ title, body })}
        />
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="bg-[#1a1710] border border-[rgba(237,236,228,0.1)] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-[15px] mb-4">{modal.title}</h2>
            <div>{modal.body}</div>
            <button
              onClick={() => setModal(null)}
              className="mt-5 w-full py-2 rounded-lg bg-[rgba(237,236,228,0.06)] hover:bg-[rgba(237,236,228,0.1)] text-[13px] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
