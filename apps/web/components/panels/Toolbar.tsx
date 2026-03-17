'use client';

import {
  MousePointer,
  Move,
  Plus,
  Link,
  X,
  Scissors,
  Undo2,
  Redo2,
} from 'lucide-react';
import { useGraphStore } from '@/stores/graphStore';
import { useCommandManager } from '@/stores/commandManager';
import type { EditingMode } from '@/lib/graph/types';

const MODES: {
  mode: EditingMode;
  label: string;
  icon: React.ReactNode;
  shortcut: string;
}[] = [
  { mode: 'select', label: 'Select', icon: <MousePointer className="h-4 w-4" />, shortcut: 'V' },
  { mode: 'move', label: 'Move', icon: <Move className="h-4 w-4" />, shortcut: 'M' },
  { mode: 'add-node', label: 'Add Node', icon: <Plus className="h-4 w-4" />, shortcut: 'A' },
  { mode: 'add-edge', label: 'Add Edge', icon: <Link className="h-4 w-4" />, shortcut: 'E' },
  { mode: 'delete', label: 'Delete', icon: <X className="h-4 w-4" />, shortcut: 'D' },
  { mode: 'split-edge', label: 'Split Edge', icon: <Scissors className="h-4 w-4" />, shortcut: 'S' },
];

/**
 * Floating toolbar for the graph editor.
 * Shows editing mode buttons + undo/redo.
 */
export default function Toolbar() {
  const editingMode = useGraphStore((s) => s.editingMode);
  const setMode = useGraphStore((s) => s.setMode);
  const canUndo = useCommandManager((s) => s.canUndo);
  const canRedo = useCommandManager((s) => s.canRedo);
  const undo = useCommandManager((s) => s.undo);
  const redo = useCommandManager((s) => s.redo);

  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-white/95 p-1.5 shadow-lg backdrop-blur-sm dark:bg-zinc-900/95">
      {MODES.map(({ mode, label, icon, shortcut }) => (
        <button
          key={mode}
          onClick={() => setMode(mode)}
          title={`${label} (${shortcut})`}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
            editingMode === mode
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'
          }`}
        >
          {icon}
        </button>
      ))}

      <div className="my-1 h-px w-6 bg-zinc-200 dark:bg-zinc-700" />

      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
      >
        <Redo2 className="h-4 w-4" />
      </button>
    </div>
  );
}
