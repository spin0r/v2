import { useState } from 'react';
import { LuFilePlus, LuFileText } from 'react-icons/lu';
import { useStore } from './store';

export default function Sidebar() {
  const files = useStore(s => s.files);
  const activeId = useStore(s => s.activeId);
  const newFile = useStore(s => s.newFile);
  const setActive = useStore(s => s.setActive);
  const renameFile = useStore(s => s.renameFile);
  const deleteFile = useStore(s => s.deleteFile);
  const reorderFiles = useStore(s => s.reorderFiles);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const startRename = (id: string, name: string) => {
    setRenamingId(id);
    // Strip .md extension when editing, will be added back on commit
    setRenameVal(name.endsWith('.md') ? name.slice(0, -3) : name);
  };

  const commitRename = () => {
    if (renamingId && renameVal.trim()) {
      renameFile(renamingId, renameVal.trim().endsWith('.md') ? renameVal.trim() : renameVal.trim() + '.md');
    }
    setRenamingId(null);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    reorderFiles(draggedIndex, index);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <aside className="md-sidebar">
      <div className="md-sidebar-header">
        <span className="md-sidebar-title">Files</span>
        <button
          onClick={newFile}
          className="md-sidebar-add"
          title="New file (Ctrl+N)"
        >
          <LuFilePlus size={14} />
        </button>
      </div>
      <ul className="md-sidebar-list">
        {files.map((f, index) => (
          <li
            key={f.id}
            draggable={renamingId !== f.id}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            style={{ opacity: draggedIndex === index ? 0.5 : 1 }}
          >
            {renamingId === f.id ? (
              <input
                autoFocus
                className="md-sidebar-rename"
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
              />
            ) : (
              <button
                onClick={() => setActive(f.id)}
                onDoubleClick={() => startRename(f.id, f.name)}
                className={`md-sidebar-file ${activeId === f.id ? 'md-sidebar-file--active' : ''}`}
              >
                <LuFileText size={13} className="md-sidebar-file-icon" />
                <span className="md-sidebar-file-name">{f.name}</span>
                <span
                  onClick={e => { e.stopPropagation(); if (confirm(`Delete "${f.name}"?`)) deleteFile(f.id); }}
                  className="md-sidebar-file-del"
                  title="Delete"
                >✕</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
