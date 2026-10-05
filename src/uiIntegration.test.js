import { describe, it, expect, beforeEach } from 'vitest';
import {
  canRedo,
  canUndo,
  cloneSnapshot,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from './history';

/**
 * Simulates real user workflows against the same pure history module the
 * App uses: upload PDF -> draw redactions -> undo/redo -> draw more, etc.
 * Page images are intentionally absent here — snapshots must stay
 * lightweight (issue #3), so workflows operate on metadata only.
 */

const newPage = (pageNumber, stamp) => ({
  id: `page-${pageNumber}-${stamp}`,
  pageNumber,
  redactions: [],
});

const drawBox = (pages, pageIndex, box) => {
  const next = cloneSnapshot(pages);
  next[pageIndex].redactions.push({ id: `red-${Date.now()}-${Math.random()}`, ...box });
  return next;
};

describe('redaction workflow', () => {
  let history;
  let pages;
  const stamp = 12345;

  const commit = (nextPages) => {
    history = pushHistory(history, cloneSnapshot(nextPages));
    pages = cloneSnapshot(nextPages);
  };
  const undo = () => {
    history = undoHistory(history);
    pages = cloneSnapshot(history.entries[history.index]);
  };
  const redo = () => {
    history = redoHistory(history);
    pages = cloneSnapshot(history.entries[history.index]);
  };

  beforeEach(() => {
    // User uploads a 3-page PDF
    history = createHistory();
    pages = [newPage(1, stamp), newPage(2, stamp), newPage(3, stamp)];
    commit(pages);
  });

  it('upload creates a single empty history entry', () => {
    expect(history.entries).toHaveLength(1);
    expect(pages).toHaveLength(3);
    expect(pages.every((p) => p.redactions.length === 0)).toBe(true);
  });

  it('draw -> undo -> draw clears the redo branch', () => {
    commit(drawBox(pages, 0, { x: 10, y: 10, width: 20, height: 10 }));
    commit(drawBox(pages, 0, { x: 40, y: 40, width: 20, height: 10 }));
    expect(pages[0].redactions).toHaveLength(2);

    undo();
    expect(pages[0].redactions).toHaveLength(1);
    expect(canRedo(history)).toBe(true);

    commit(drawBox(pages, 1, { x: 5, y: 5, width: 10, height: 10 }));
    expect(pages[0].redactions).toHaveLength(1);
    expect(pages[1].redactions).toHaveLength(1);
    expect(canRedo(history)).toBe(false);
  });

  it('undo/redo cycles restore exact redaction sets', () => {
    commit(drawBox(pages, 0, { x: 10, y: 10, width: 20, height: 10 }));
    const afterFirst = cloneSnapshot(pages);
    commit(drawBox(pages, 2, { x: 1, y: 1, width: 5, height: 5 }));

    undo();
    expect(pages).toEqual(afterFirst);
    redo();
    expect(pages[2].redactions).toHaveLength(1);

    undo();
    undo();
    expect(canUndo(history)).toBe(false);
    expect(pages.every((p) => p.redactions.length === 0)).toBe(true);
  });

  it('removing a redaction is itself undoable', () => {
    commit(drawBox(pages, 0, { x: 10, y: 10, width: 20, height: 10 }));
    const withBox = cloneSnapshot(pages);
    const removed = cloneSnapshot(pages);
    removed[0].redactions = [];
    commit(removed);
    expect(pages[0].redactions).toHaveLength(0);
    undo();
    expect(pages).toEqual(withBox);
  });

  it('redaction coordinates stay within 0-100 percent bounds', () => {
    const boxes = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 12.5, y: 33.3, width: 44.4, height: 11.1 },
    ];
    boxes.forEach((b) => {
      commit(drawBox(pages, 0, b));
    });
    pages[0].redactions.forEach((r) => {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(100);
      expect(r.y + r.height).toBeLessThanOrEqual(100);
    });
  });

  it('history never accumulates image payloads across a long session (issue #3)', () => {
    for (let i = 0; i < 25; i += 1) {
      commit(drawBox(pages, i % 3, { x: i, y: i, width: 5, height: 5 }));
      if (i % 4 === 0) undo();
    }
    const serialized = JSON.stringify(history.entries);
    expect(serialized).not.toContain('data:image');
    expect(serialized).not.toContain('previewUrl');
    // Sanity: 25 edits of metadata should stay tiny (well under 1MB)
    expect(serialized.length).toBeLessThan(1_000_000);
  });
});
