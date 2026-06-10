import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { nanoid } from 'nanoid';

let persistTimer: ReturnType<typeof setTimeout>;
const debouncedStorage: StateStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => localStorage.setItem(key, value), 500);
  },
  removeItem: (key) => localStorage.removeItem(key),
};

export interface MdFile {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
}

export interface Snippet {
  id: string;
  keyword: string;
  content: string;
}

const WELCOME = `# Welcome to Markdown

A minimal markdown editor that lives in your browser.

## Features

- **Split pane** — edit and preview side by side
- **Local storage** — files persist across sessions
- **Keyboard shortcuts** — \`Ctrl+S\` save, \`Ctrl+N\` new file

## Formatting

**Bold**, *italic*, ~~strikethrough~~, \`inline code\`

\`\`\`js
// code blocks with syntax hints
const greet = (name) => \`Hello, \${name}!\`;
\`\`\`

> Blockquotes look great too.

| Column A | Column B |
|----------|----------|
| Cell 1   | Cell 2   |

## Links

Check out [GitHub](https://github.com) or [MDN Web Docs](https://developer.mozilla.org).

Bare URLs are highlighted too: https://example.com

![Example Image](https://picsum.photos/600/200)

---

Start editing to see the preview update live.
`;


interface Store {
  files: MdFile[];
  activeId: string;
  sidebarOpen: boolean;
  view: 'split' | 'editor' | 'preview';
  snippets: Snippet[];
  // actions
  newFile: () => void;
  setActive: (id: string) => void;
  updateContent: (content: string) => void;
  renameFile: (id: string, name: string) => void;
  deleteFile: (id: string) => void;
  reorderFiles: (fromIndex: number, toIndex: number) => void;
  importFile: (file: MdFile) => void;
  setSidebar: (open: boolean) => void;
  setView: (v: Store['view']) => void;
  addSnippet: (keyword: string, content: string) => void;
  updateSnippet: (id: string, keyword: string, content: string) => void;
  deleteSnippet: (id: string) => void;
}

const defaultFile: MdFile = { id: 'welcome', name: 'welcome.md', content: WELCOME, updatedAt: Date.now() };

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      files: [defaultFile],
      activeId: 'welcome',
      sidebarOpen: true,
      view: 'split',
      snippets: [],

      newFile: () => {
        const id = nanoid(8);
        const file: MdFile = { id, name: `untitled-${get().files.length + 1}.md`, content: '', updatedAt: Date.now() };
        set(s => ({ files: [...s.files, file], activeId: id }));
      },

      setActive: (id) => set({ activeId: id }),

      updateContent: (content) =>
        set(s => ({
          files: s.files.map(f => f.id === s.activeId ? { ...f, content, updatedAt: Date.now() } : f),
        })),

      renameFile: (id, name) =>
        set(s => ({ files: s.files.map(f => f.id === id ? { ...f, name } : f) })),

      deleteFile: (id) =>
        set(s => {
          const files = s.files.filter(f => f.id !== id);
          if (files.length === 0) {
            const fresh: MdFile = { id: nanoid(8), name: 'untitled.md', content: '', updatedAt: Date.now() };
            return { files: [fresh], activeId: fresh.id };
          }
          const activeId = s.activeId === id ? files[files.length - 1].id : s.activeId;
          return { files, activeId };
        }),

      reorderFiles: (fromIndex, toIndex) =>
        set(s => {
          const files = [...s.files];
          const [removed] = files.splice(fromIndex, 1);
          files.splice(toIndex, 0, removed);
          return { files };
        }),

      importFile: (file) =>
        set(s => ({ files: [...s.files, file], activeId: file.id })),

      setSidebar: (open) => set({ sidebarOpen: open }),
      setView: (view) => set({ view }),

      addSnippet: (keyword, content) => {
        const id = nanoid(8);
        set(s => ({ snippets: [...s.snippets, { id, keyword, content }] }));
      },
      updateSnippet: (id, keyword, content) =>
        set(s => ({ snippets: s.snippets.map(sn => sn.id === id ? { ...sn, keyword, content } : sn) })),
      deleteSnippet: (id) =>
        set(s => ({ snippets: s.snippets.filter(sn => sn.id !== id) })),
    }),
    { name: 'edtr-md-store', storage: createJSONStorage(() => debouncedStorage) }
  )
);

export const activeFile = (s: Store) => s.files.find(f => f.id === s.activeId) ?? s.files[0];
