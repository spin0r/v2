import { useRef } from 'react';
import { LuPanelLeft, LuPanelLeftClose, LuEllipsisVertical } from 'react-icons/lu';
import { useStore, activeFile } from './store';

const VIEWS = ['split', 'editor', 'preview'] as const;

export default function Topbar({ onMenuToggle }: { onMenuToggle: (ref: HTMLButtonElement) => void }) {
  const file = useStore(activeFile);
  const view = useStore(s => s.view);
  const sidebarOpen = useStore(s => s.sidebarOpen);
  const setSidebar = useStore(s => s.setSidebar);
  const setView = useStore(s => s.setView);
  const menuRef = useRef<HTMLButtonElement>(null);

  return (
    <header className="md-topbar">
      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebar(!sidebarOpen)}
        className="md-topbar-btn"
        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        {sidebarOpen ? <LuPanelLeftClose size={15} /> : <LuPanelLeft size={15} />}
      </button>

      {/* Filename */}
      <span className="md-topbar-filename">{file?.name}</span>

      {/* View tabs */}
      <div className="md-view-tabs">
        {VIEWS.map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`md-view-tab ${view === v ? 'md-view-tab--active' : ''}`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Menu */}
      <button
        ref={menuRef}
        onClick={() => onMenuToggle(menuRef.current!)}
        className="md-topbar-btn"
        title="Menu"
      >
        <LuEllipsisVertical size={15} />
      </button>
    </header>
  );
}
