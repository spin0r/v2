import { useEffect, useRef } from 'react';
import { useStore, activeFile, MdFile } from './store';
import { nanoid } from 'nanoid';

const SHORTCUTS = [
  ['Ctrl+S', 'Save file'],
  ['Ctrl+N', 'New file'],
  ['Tab / Shift+Tab', 'Indent / Outdent'],
  ['Ctrl+] / Ctrl+[', 'Indent / Outdent line'],
  ['Ctrl+/', 'Toggle line comment'],
  ['Ctrl+L', 'Select line'],
  ['Ctrl+D', 'Select next occurrence'],
  ['Ctrl+Shift+K', 'Delete line'],
  ['Alt+↑ / Alt+↓', 'Move line up / down'],
  ['Shift+Alt+↑ / ↓', 'Copy line up / down'],
  ['Ctrl+Enter', 'Insert line below'],
  ['Ctrl+Shift+Enter', 'Insert line above'],
  ['Enter', 'Auto-indent / continue list'],
  ['Home', 'Smart home (toggle indent)'],
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
  const files = useStore(s => s.files);
  const renameFile = useStore(s => s.renameFile);
  const deleteFile = useStore(s => s.deleteFile);
  const importFile = useStore(s => s.importFile);
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
    const currentName = file?.name.endsWith('.md') ? file.name.slice(0, -3) : file?.name;
    const name = prompt('Rename file:', currentName);
    if (name?.trim()) renameFile(file!.id, name.trim().endsWith('.md') ? name.trim() : name.trim() + '.md');
  };

  const handleDelete = () => {
    onClose();
    if (confirm(`Delete "${file?.name}"?`)) deleteFile(file!.id);
  };

  const handleExport = () => {
    onClose();
    if (!file) return;
    
    const blob = new Blob([file.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    onClose();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,text/markdown';
    input.multiple = true;
    input.onchange = async (e) => {
      const fileList = (e.target as HTMLInputElement).files;
      if (!fileList) return;
      
      for (let i = 0; i < fileList.length; i++) {
        const uploadedFile = fileList[i];
        const content = await uploadedFile.text();
        const fileName = uploadedFile.name;
        
        // Check if file with same name exists, auto-rename if needed
        let finalName = fileName.endsWith('.md') ? fileName : fileName + '.md';
        let counter = 1;
        while (files.some(f => f.name === finalName)) {
          const baseName = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
          finalName = `${baseName} (${counter}).md`;
          counter++;
        }
        
        const newFile: MdFile = { 
          id: nanoid(8), 
          name: finalName, 
          content, 
          updatedAt: Date.now() 
        };
        
        importFile(newFile);
      }
    };
    input.click();
  };

  const handleExportAll = async () => {
    onClose();
    if (files.length === 0) return;

    // Dynamic import for JSZip
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    
    // Add all files to zip
    files.forEach(f => {
      zip.file(f.name, f.content);
    });
    
    // Generate zip and download
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'markdown-files.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShortcuts = () => {
    onClose();
    onShowModal('Keyboard Shortcuts', (
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(237,236,228,0.08)' }}>
        <table className="w-full text-[13px]" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '42%' }} />
            <col style={{ width: '58%' }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(237,236,228,0.08)', background: 'rgba(237,236,228,0.025)' }}>
              <th className="py-3 px-6 text-left font-mono text-[10px] text-[rgba(237,236,236,0.35)] uppercase tracking-widest font-medium">Shortcut</th>
              <th className="py-3 px-6 text-left font-mono text-[10px] text-[rgba(237,236,236,0.35)] uppercase tracking-widest font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid rgba(237,236,228,0.05)' }} className="last:border-0 hover:bg-[rgba(237,236,228,0.015)] transition-colors">
                <td className="py-3.5 px-6 font-mono text-[#c08532] text-[12px] font-medium">{k}</td>
                <td className="py-3.5 px-6 text-[rgba(237,236,236,0.7)]">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ));
  };

  const handleCheatsheet = () => {
    onClose();
    onShowModal('Markdown Cheatsheet', (
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(237,236,228,0.08)' }}>
        <table className="w-full text-[13px]" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '38%' }} />
            <col style={{ width: '62%' }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(237,236,228,0.08)', background: 'rgba(237,236,228,0.025)' }}>
              <th className="py-3 px-6 text-left font-mono text-[10px] text-[rgba(237,236,236,0.35)] uppercase tracking-widest font-medium">Syntax</th>
              <th className="py-3 px-6 text-left font-mono text-[10px] text-[rgba(237,236,236,0.35)] uppercase tracking-widest font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {CHEATSHEET.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid rgba(237,236,228,0.05)' }} className="last:border-0 hover:bg-[rgba(237,236,228,0.015)] transition-colors">
                <td className="py-3.5 px-6 font-mono text-[#c08532] text-[12px] break-all font-medium">{k}</td>
                <td className="py-3.5 px-6 text-[rgba(237,236,236,0.7)]">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ));
  };

  return (
      <div
        ref={ref}
        style={{ ...style, position: 'fixed', zIndex: 50, padding: '6px 0' }}
        className="w-56 bg-[#211e15] border border-[rgba(237,236,228,0.12)] rounded-xl shadow-2xl overflow-hidden"
      >
      {[
        { label: 'Rename', action: handleRename },
        { label: 'Delete', action: handleDelete, danger: true },
      ].map(({ label, action, danger }) => (
        <button
          key={label}
          onClick={action}
          className={`w-full text-left text-[13px] transition-colors hover:bg-[rgba(237,236,228,0.06)] ${danger ? 'text-[#f87171]' : 'text-[rgba(237,236,236,0.8)]'}`}
          style={{ padding: '8px 16px' }}
        >
          {label}
        </button>
      ))}
      <div className="border-t border-[rgba(237,236,228,0.08)]" style={{ margin: '4px 0' }} />
      {[
        { label: 'Export', action: handleExport },
        { label: 'Import', action: handleImport },
        { label: 'Export All', action: handleExportAll },
      ].map(({ label, action }) => (
        <button
          key={label}
          onClick={action}
          className="w-full text-left text-[13px] text-[rgba(237,236,236,0.8)] transition-colors hover:bg-[rgba(237,236,228,0.06)]"
          style={{ padding: '8px 16px' }}
        >
          {label}
        </button>
      ))}
      <div className="border-t border-[rgba(237,236,228,0.08)]" style={{ margin: '4px 0' }} />
      {[
        { label: 'Keyboard Shortcuts', action: handleShortcuts },
        { label: 'Markdown Cheatsheet', action: handleCheatsheet },
      ].map(({ label, action }) => (
        <button
          key={label}
          onClick={action}
          className="w-full text-left text-[13px] text-[rgba(237,236,236,0.8)] transition-colors hover:bg-[rgba(237,236,228,0.06)]"
          style={{ padding: '8px 16px' }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
