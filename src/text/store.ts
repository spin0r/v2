import { create } from 'zustand';

export type TransformMode = 'aiRename' | 'spaceToDot' | 'spaceToUnderscore';

interface Store {
  input: string;
  output: string;
  mode: TransformMode | null;
  replacements: number;
  processing: boolean;
  // actions
  setInput: (v: string) => void;
  setOutput: (v: string) => void;
  setMode: (m: TransformMode | null) => void;
  setProcessing: (v: boolean) => void;
  clear: () => void;
  transform: () => void;
  convert: () => Promise<void>;
}

function applyTransform(text: string, mode: TransformMode | null) {
  if (!mode || mode === 'aiRename') return { result: text, replacements: 0 };

  const replaceChar = mode === 'spaceToDot' ? '.' : '_';
  let replacements = 0;
  const result = text.replace(/ /g, () => { replacements++; return replaceChar; });
  return { result, replacements };
}

export const useStore = create<Store>()((set, get) => ({
  input: '',
  output: '',
  mode: 'aiRename',
  replacements: 0,
  processing: false,

  setInput: (input) => {
    set({ input });
    const { mode } = get();
    if (mode && mode !== 'aiRename') {
      const { result, replacements } = applyTransform(input, mode);
      set({ output: result, replacements });
    }
  },

  setOutput: (output) => set({ output }),

  setMode: (mode) => {
    set({ mode });
    const { input } = get();
    if (mode && mode !== 'aiRename') {
      const { result, replacements } = applyTransform(input, mode);
      set({ output: result, replacements });
    }
  },

  setProcessing: (processing) => set({ processing }),

  clear: () => set({ input: '', output: '', replacements: 0 }),

  transform: () => {
    const { input, mode } = get();
    const { result, replacements } = applyTransform(input, mode);
    set({ output: result, replacements });
  },

  convert: async () => {
    const { input, mode } = get();
    if (!input.trim()) return;

    if (mode === 'aiRename') {
      set({ processing: true, output: '' });
      try {
        const res = await fetch('/api/ai-rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: input }),
        });

        if (!res.ok) {
          // Try to parse error response, fall back to status text
          let errMsg = `Server error (${res.status})`;
          try {
            const errData = await res.json();
            errMsg = errData.error || errMsg;
          } catch { /* empty response body */ }
          throw new Error(errMsg);
        }

        const text = await res.text();
        if (!text) throw new Error('Empty response from server');

        const data = JSON.parse(text);
        if (data.ok) {
          set({ output: data.result, replacements: 0 });
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch (e: any) {
        set({ output: `Error: ${e.message}` });
      } finally {
        set({ processing: false });
      }
    } else {
      const { result, replacements } = applyTransform(input, mode);
      set({ output: result, replacements });
    }
  },
}));
