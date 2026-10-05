import { describe, it, expect } from 'vitest';
import {
  canRedo,
  canUndo,
  cloneSnapshot,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from './history';

const redaction = (id, x = 10, y = 20, width = 15, height = 10) => ({
  id, x, y, width, height,
});

const pagesWith = (...redactions) => [
  { id: 'p1-1', pageNumber: 1, redactions },
];

describe('createHistory', () => {
  it('starts empty with index -1', () => {
    const h = createHistory();
    expect(h.entries).toEqual([]);
    expect(h.index).toBe(-1);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });
});

describe('pushHistory', () => {
  it('appends snapshots and advances the index', () => {
    let h = createHistory();
    h = pushHistory(h, pagesWith());
    expect(h.index).toBe(0);
    expect(h.entries).toHaveLength(1);
    h = pushHistory(h, pagesWith(redaction('r1')));
    expect(h.index).toBe(1);
    expect(h.entries).toHaveLength(2);
  });

  it('drops the redo branch when pushing after an undo', () => {
    let h = createHistory();
    h = pushHistory(h, pagesWith());
    h = pushHistory(h, pagesWith(redaction('r1')));
    h = pushHistory(h, pagesWith(redaction('r1'), redaction('r2')));
    h = undoHistory(h);
    expect(h.index).toBe(1);
    h = pushHistory(h, pagesWith(redaction('r1'), redaction('r3')));
    expect(h.entries).toHaveLength(3);
    expect(h.index).toBe(2);
    expect(h.entries[2][0].redactions.map((r) => r.id)).toEqual(['r1', 'r3']);
  });

  it('stores an isolated copy — later mutations do not leak into history', () => {
    let h = createHistory();
    const snap = pagesWith(redaction('r1'));
    h = pushHistory(h, snap);
    snap[0].redactions.push(redaction('r2'));
    expect(h.entries[0][0].redactions).toHaveLength(1);
  });
});

describe('undoHistory / redoHistory', () => {
  const threeDeep = () => {
    let h = createHistory();
    h = pushHistory(h, pagesWith());
    h = pushHistory(h, pagesWith(redaction('r1')));
    h = pushHistory(h, pagesWith(redaction('r1'), redaction('r2')));
    return h;
  };

  it('undo steps back through snapshots', () => {
    let h = threeDeep();
    h = undoHistory(h);
    expect(h.index).toBe(1);
    expect(h.entries[h.index][0].redactions).toHaveLength(1);
    h = undoHistory(h);
    expect(h.index).toBe(0);
    expect(h.entries[h.index][0].redactions).toHaveLength(0);
  });

  it('undo clamps at the first entry', () => {
    let h = threeDeep();
    h = undoHistory(undoHistory(undoHistory(undoHistory(h))));
    expect(h.index).toBe(0);
  });

  it('redo steps forward and clamps at the last entry', () => {
    let h = threeDeep();
    h = undoHistory(h);
    h = redoHistory(h);
    expect(h.index).toBe(2);
    h = redoHistory(redoHistory(h));
    expect(h.index).toBe(2);
  });

  it('undo on an empty history is a no-op', () => {
    const h = undoHistory(createHistory());
    expect(h.index).toBe(-1);
  });
});

describe('canUndo / canRedo', () => {
  it('reflects the cursor position', () => {
    let h = createHistory();
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    h = pushHistory(h, pagesWith());
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    h = pushHistory(h, pagesWith(redaction('r1')));
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
    h = undoHistory(h);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(true);
  });
});

describe('cloneSnapshot', () => {
  it('deep-copies nested redaction boxes', () => {
    const original = pagesWith(redaction('r1'));
    const copy = cloneSnapshot(original);
    copy[0].redactions[0].x = 999;
    expect(original[0].redactions[0].x).toBe(10);
  });

  it('snapshots stay lightweight — never embed image data URLs (issue #3)', () => {
    const snapshot = cloneSnapshot(pagesWith(redaction('r1')));
    expect(JSON.stringify(snapshot)).not.toContain('data:image');
    expect(JSON.stringify(snapshot)).not.toContain('previewUrl');
  });
});
