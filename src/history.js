export const createHistorySnapshot = (pages) => pages.map(({ id, pageNumber, redactions }) => ({
  id,
  pageNumber,
  redactions: redactions.map((redaction) => ({ ...redaction })),
}));

export const createHistoryState = (pages) => ({
  entries: [createHistorySnapshot(pages)],
  index: 0,
});

export const appendHistory = (history, pages) => {
  const entries = history.entries.slice(0, history.index + 1);
  entries.push(createHistorySnapshot(pages));
  return { entries, index: entries.length - 1 };
};

export const restoreHistorySnapshot = (snapshot, pageAssets) => snapshot.map((page) => ({
  ...page,
  ...pageAssets.get(page.id),
  redactions: page.redactions.map((redaction) => ({ ...redaction })),
}));

export const moveHistory = (history, direction, pageAssets) => {
  const index = Math.min(
    history.entries.length - 1,
    Math.max(0, history.index + Math.sign(direction)),
  );
  if (index === history.index) return null;

  const nextHistory = { ...history, index };
  return {
    history: nextHistory,
    pages: restoreHistorySnapshot(history.entries[index], pageAssets),
  };
};
