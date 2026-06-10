import { useEffect, useRef, useState } from 'react';
import { useStore, activeFile, MdFile, Snippet } from './store';
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
  const snippets = useStore(s => s.snippets);
  const addSnippet = useStore(s => s.addSnippet);
  const updateSnippet = useStore(s => s.updateSnippet);
  const deleteSnippet = useStore(s => s.deleteSnippet);
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

  const handleSnippets = () => {
    onClose();

    const SnippetsManager = () => {
      const snippets = useStore(s => s.snippets);
      const addSnippet = useStore(s => s.addSnippet);
      const updateSnippet = useStore(s => s.updateSnippet);
      const deleteSnippet = useStore(s => s.deleteSnippet);
      const [newKeyword, setNewKeyword] = useState('');
      const [newContent, setNewContent] = useState('');
      const [editId, setEditId] = useState<string | null>(null);
      const [editKeyword, setEditKeyword] = useState('');
      const [editContent, setEditContent] = useState('');

      const handleAdd = () => {
        if (!newKeyword.trim() || !newContent.trim()) return;
        addSnippet(newKeyword.trim(), newContent);
        setNewKeyword('');
        setNewContent('');
      };

      const startEdit = (sn: Snippet) => {
        setEditId(sn.id);
        setEditKeyword(sn.keyword);
        setEditContent(sn.content);
      };

      const saveEdit = () => {
        if (!editId || !editKeyword.trim()) return;
        updateSnippet(editId, editKeyword.trim(), editContent);
        setEditId(null);
      };

      const inputStyle: React.CSSProperties = {
        background: 'rgba(237,236,228,0.04)',
        border: '1px solid rgba(237,236,228,0.12)',
        borderRadius: '8px',
        padding: '8px 12px',
        color: '#edecec',
        fontSize: '13px',
        fontFamily: 'JetBrains Mono, monospace',
        outline: 'none',
        width: '100%',
      };

      const textareaStyle: React.CSSProperties = {
        ...inputStyle,
        minHeight: '80px',
        resize: 'vertical' as const,
      };

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Existing snippets */}
          {snippets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {snippets.map(sn => (
                <div key={sn.id} style={{
                  background: 'rgba(237,236,228,0.03)',
                  border: '1px solid rgba(237,236,228,0.08)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                }}>
                  {editId === sn.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '10px', color: 'rgba(237,236,236,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Keyword</label>
                        <input
                          style={inputStyle}
                          value={editKeyword}
                          onChange={e => setEditKeyword(e.target.value)}
                          placeholder="keyword"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '10px', color: 'rgba(237,236,236,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Content</label>
                        <textarea
                          style={textareaStyle}
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          placeholder="snippet content"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setEditId(null)}
                          style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '6px', background: 'rgba(237,236,228,0.05)', color: 'rgba(237,236,236,0.6)', border: 'none', cursor: 'pointer' }}
                        >Cancel</button>
                        <button
                          onClick={saveEdit}
                          style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '6px', background: '#c08532', color: '#14120b', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        >Save</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{
                            background: 'rgba(192,133,50,0.15)',
                            color: '#c08532',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontWeight: 600,
                          }}>{sn.keyword}</span>
                          <span style={{ fontSize: '11px', color: 'rgba(237,236,236,0.3)' }}>+ Enter</span>
                        </div>
                        <pre style={{
                          margin: 0,
                          fontSize: '11px',
                          color: 'rgba(237,236,236,0.5)',
                          fontFamily: 'JetBrains Mono, monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          maxHeight: '80px',
                          overflow: 'hidden',
                        }}>{sn.content}</pre>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          onClick={() => startEdit(sn)}
                          style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', background: 'rgba(237,236,228,0.06)', color: 'rgba(237,236,236,0.6)', border: 'none', cursor: 'pointer' }}
                          title="Edit"
                        >✎</button>
                        <button
                          onClick={() => deleteSnippet(sn.id)}
                          style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', background: 'rgba(248,113,113,0.1)', color: '#f87171', border: 'none', cursor: 'pointer' }}
                          title="Delete"
                        >✕</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {snippets.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(237,236,236,0.3)', fontSize: '13px' }}>
              No snippets yet. Add one below.
            </div>
          )}

          {/* Add new snippet form */}
          <div style={{
            background: 'rgba(237,236,228,0.02)',
            border: '1px solid rgba(237,236,228,0.1)',
            borderRadius: '10px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <div style={{ fontSize: '12px', color: 'rgba(237,236,236,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Add New Snippet</div>
            <div>
              <label style={{ fontSize: '10px', color: 'rgba(237,236,236,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Keyword (trigger)</label>
              <input
                style={inputStyle}
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                placeholder="e.g. sa"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); } }}
              />
            </div>
            <div>
              <label style={{ fontSize: '10px', color: 'rgba(237,236,236,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Content (expanded text)</label>
              <textarea
                style={textareaStyle}
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder={'/s \n\n<a href="">Source</a>\n/d'}
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={!newKeyword.trim() || !newContent.trim()}
              style={{
                padding: '8px 16px',
                fontSize: '12px',
                borderRadius: '8px',
                background: newKeyword.trim() && newContent.trim() ? '#c08532' : 'rgba(237,236,228,0.05)',
                color: newKeyword.trim() && newContent.trim() ? '#14120b' : 'rgba(237,236,236,0.3)',
                border: 'none',
                cursor: newKeyword.trim() && newContent.trim() ? 'pointer' : 'default',
                fontWeight: 600,
                alignSelf: 'flex-end',
                transition: 'all 0.15s ease',
              }}
            >Add Snippet</button>
          </div>
        </div>
      );
    };

    onShowModal('Custom Snippets', <SnippetsManager />);
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
        { label: 'Custom Snippets', action: handleSnippets },
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
