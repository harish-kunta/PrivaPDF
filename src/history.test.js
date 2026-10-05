import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendHistory,
  createHistoryState,
  createHistorySnapshot,
  moveHistory,
  restoreHistorySnapshot,
} from './history.js';

const page = (redactions = []) => ({
  id: 'page-1',
  pageNumber: 1,
  previewUrl: 'data:image/png;base64,large-page-image',
  width: 1200,
  height: 1600,
  redactions,
});

test('history snapshots keep redactions and omit rendered page assets', () => {
  const original = page([{ id: 'redaction-1', x: 10, y: 20, width: 30, height: 15 }]);
  const snapshot = createHistorySnapshot([original]);

  assert.deepEqual(snapshot, [{
    id: 'page-1',
    pageNumber: 1,
    redactions: [{ id: 'redaction-1', x: 10, y: 20, width: 30, height: 15 }],
  }]);
  assert.equal('previewUrl' in snapshot[0], false);
  assert.notStrictEqual(snapshot[0].redactions[0], original.redactions[0]);
});

test('restoring a snapshot reattaches page assets without sharing redaction objects', () => {
  const snapshot = createHistorySnapshot([page([{ id: 'redaction-1', x: 5, y: 6, width: 7, height: 8 }])]);
  const assets = new Map([['page-1', {
    previewUrl: 'data:image/png;base64,restored',
    width: 1200,
    height: 1600,
  }]]);
  const [restored] = restoreHistorySnapshot(snapshot, assets);

  assert.equal(restored.previewUrl, 'data:image/png;base64,restored');
  assert.equal(restored.width, 1200);
  assert.deepEqual(restored.redactions, snapshot[0].redactions);
  assert.notStrictEqual(restored.redactions[0], snapshot[0].redactions[0]);
});

test('undo and redo move through snapshots and stop at history boundaries', () => {
  const assets = new Map([['page-1', {
    previewUrl: 'data:image/png;base64,page',
    width: 1200,
    height: 1600,
  }]]);
  const initial = [page()];
  const withRedaction = [page([{ id: 'redaction-1', x: 10, y: 10, width: 20, height: 20 }])];
  let history = createHistoryState(initial);

  assert.equal(moveHistory(history, -1, assets), null);
  history = appendHistory(history, withRedaction);

  const undone = moveHistory(history, -1, assets);
  assert.equal(undone.history.index, 0);
  assert.deepEqual(undone.pages[0].redactions, []);

  const redone = moveHistory(undone.history, 1, assets);
  assert.equal(redone.history.index, 1);
  assert.deepEqual(redone.pages[0].redactions, withRedaction[0].redactions);
  assert.equal(moveHistory(redone.history, 1, assets), null);
});

test('a new edit after undo discards the redo branch', () => {
  const assets = new Map([['page-1', {
    previewUrl: 'data:image/png;base64,page',
    width: 1200,
    height: 1600,
  }]]);
  const firstEdit = [page([{ id: 'redaction-1', x: 10, y: 10, width: 20, height: 20 }])];
  const secondEdit = [page([{ id: 'redaction-1', x: 10, y: 10, width: 20, height: 20 }, {
    id: 'redaction-2', x: 40, y: 40, width: 10, height: 10,
  }])];
  const replacementEdit = [page([{ id: 'redaction-3', x: 60, y: 60, width: 15, height: 15 }])];

  let history = appendHistory(createHistoryState([page()]), firstEdit);
  history = appendHistory(history, secondEdit);
  history = moveHistory(history, -1, assets).history;
  history = appendHistory(history, replacementEdit);

  assert.equal(history.entries.length, 3);
  assert.equal(history.index, 2);
  assert.deepEqual(moveHistory(history, 1, assets), null);
  assert.deepEqual(moveHistory(history, -1, assets).pages[0].redactions, firstEdit[0].redactions);
});
