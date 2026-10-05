// Pure undo/redo history helpers (no React dependency, fully testable).
//
// Snapshots must stay lightweight: store redaction boxes and page metadata
// only — never page image data URLs. Images live in a separate ref in App.jsx
// (see issue #3).

export const cloneSnapshot = (value) => JSON.parse(JSON.stringify(value));

export const createHistory = () => ({ entries: [], index: -1 });

export const pushHistory = (history, snapshot) => {
  // Drop any redo branch: a new edit after undo starts a new timeline.
  const entries = history.entries.slice(0, history.index + 1);
  entries.push(cloneSnapshot(snapshot));
  return { entries, index: entries.length - 1 };
};

export const undoHistory = (history) => ({
  entries: history.entries,
  index: history.entries.length === 0 ? -1 : Math.max(0, history.index - 1),
});

export const redoHistory = (history) => ({
  entries: history.entries,
  index:
    history.entries.length === 0
      ? -1
      : Math.min(history.entries.length - 1, history.index + 1),
});

export const canUndo = (history) => history.index > 0;

export const canRedo = (history) => history.index < history.entries.length - 1;
