import { useEffect, useMemo, useRef, useState } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const defaultPageSize = { width: 0, height: 0 };

function App() {
  const fileInputRef = useRef(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [pages, setPages] = useState([]);
  const [pageDimensions, setPageDimensions] = useState({});
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [removingPageIndex, setRemovingPageIndex] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [lastRedaction, setLastRedaction] = useState(null);

  useEffect(() => {
    return () => {
      if (pdfFile && pdfFile.url) {
        URL.revokeObjectURL(pdfFile.url);
      }
    };
  }, [pdfFile]);

  const renderPdf = async (file) => {
    setError('');
    setProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageData = [];
      const dims = {};

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.2 });
        const pageMeta = {
          id: `${pageNumber}-${Date.now()}`,
          pageNumber,
          width: viewport.width,
          height: viewport.height,
          redactions: [],
          previewUrl: null,
        };

        dims[pageNumber] = { width: viewport.width, height: viewport.height };
        pageData.push(pageMeta);
      }

      const loadedPages = await Promise.all(
        pageData.map(async (pageMeta) => {
          const page = await pdf.getPage(pageMeta.pageNumber);
          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: context, viewport }).promise;
          const previewUrl = canvas.toDataURL('image/png');

          return {
            ...pageMeta,
            previewUrl,
          };
        }),
      );

      setPages(loadedPages);
      setPageDimensions(dims);
      setPdfFile({ file, url: URL.createObjectURL(file) });
      setPdfName(file.name);
    } catch (loadError) {
      console.error(loadError);
      setError('Could not render that PDF. Please try another file.');
    } finally {
      setProcessing(false);
    }
  };

  const handleFileInput = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a valid PDF file.');
      return;
    }
    await renderPdf(file);
    event.target.value = '';
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDraggingOver(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files can be redacted.');
      return;
    }
    await renderPdf(file);
  };

  const startRedaction = (pageIndex, startPoint, mousePoint) => {
    const page = pages[pageIndex];
    if (!page) return;

    const canvasRect = document
      .querySelectorAll('.page-canvas')[pageIndex]
      ?.getBoundingClientRect();

    if (!canvasRect) return;

    const width = Math.abs(mousePoint.x - startPoint.x);
    const height = Math.abs(mousePoint.y - startPoint.y);
    const left = Math.min(startPoint.x, mousePoint.x) - canvasRect.left;
    const top = Math.min(startPoint.y, mousePoint.y) - canvasRect.top;

    const relativeX = (left / canvasRect.width) * page.width;
    const relativeY = (top / canvasRect.height) * page.height;
    const relativeW = (width / canvasRect.width) * page.width;
    const relativeH = (height / canvasRect.height) * page.height;

    setPages((prev) =>
      prev.map((item, idx) => {
        if (idx !== pageIndex) return item;
        return {
          ...item,
          redactions: [...item.redactions, { x: relativeX, y: relativeY, width: relativeW, height: relativeH }],
        };
      }),
    );
  };

  const handlePointerDown = (event, pageIndex) => {
    event.preventDefault();
    event.stopPropagation();

    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const startPoint = { x: event.clientX, y: event.clientY };
    const key = `${pageIndex}-${Date.now()}`;

    const onMove = (moveEvent) => {
      const nextPoint = { x: moveEvent.clientX, y: moveEvent.clientY };
      const x = Math.min(startPoint.x, nextPoint.x) - rect.left;
      const y = Math.min(startPoint.y, nextPoint.y) - rect.top;
      const w = Math.abs(nextPoint.x - startPoint.x);
      const h = Math.abs(nextPoint.y - startPoint.y);

      setPages((prev) =>
        prev.map((page, idx) => {
          if (idx !== pageIndex) return page;
          const draftBoxes = [...page.redactions];
          const previewIndex = draftBoxes.findIndex((box) => box.id === key);
          const nextBox = {
            id: key,
            x: (x / rect.width) * page.width,
            y: (y / rect.height) * page.height,
            width: (w / rect.width) * page.width,
            height: (h / rect.height) * page.height,
          };

          if (previewIndex >= 0) {
            draftBoxes[previewIndex] = nextBox;
          } else {
            draftBoxes.push(nextBox);
          }

          return { ...page, redactions: draftBoxes };
        }),
      );
    };

    const onUp = () => {
      setPages((prev) => {
        const nextPages = prev.map((page, idx) => {
          if (idx !== pageIndex) return page;

          const finalDraft = page.redactions.filter((box) => box.id === key && box.width > 2 && box.height > 2);
          const filtered = page.redactions.filter((box) => box.id !== key);
          return { ...page, redactions: [...filtered, ...finalDraft] };
        });

        const latest = nextPages[pageIndex]?.redactions.find((box) => box.id === key);
        if (latest) {
          setLastRedaction({ pageIndex, boxId: key });
        }

        return nextPages;
      });

      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const removePage = (pageIndex) => {
    setRemovingPageIndex(pageIndex);
    setTimeout(() => {
      setPages((prev) => prev.filter((_, idx) => idx !== pageIndex));
      setRemovingPageIndex(null);
    }, 120);
  };

  const removeRedaction = (pageIndex, boxId) => {
    setPages((prev) =>
      prev.map((page, idx) => {
        if (idx !== pageIndex) return page;
        return {
          ...page,
          redactions: page.redactions.filter((box) => box.id !== boxId),
        };
      }),
    );

    setLastRedaction((current) => {
      if (current && current.pageIndex === pageIndex && current.boxId === boxId) {
        return null;
      }
      return current;
    });
  };

  const undoLastRedaction = () => {
    if (!lastRedaction) return;

    setPages((prev) =>
      prev.map((page, idx) => {
        if (idx !== lastRedaction.pageIndex) return page;
        return {
          ...page,
          redactions: page.redactions.filter((box) => box.id !== lastRedaction.boxId),
        };
      }),
    );

    setLastRedaction(null);
  };

  const totalRedactions = useMemo(
    () => pages.reduce((sum, page) => sum + page.redactions.length, 0),
    [pages],
  );

  const saveCleanPdf = async () => {
    if (!pdfFile?.file || pages.length === 0) {
      setError('Upload a PDF first to begin redacting.');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const inputBytes = await pdfFile.file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(inputBytes);
      const pageCount = pdfDoc.getPageCount();

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        const page = pdfDoc.getPage(pageIndex);
        const size = page.getSize();
        const mapped = pages[pageIndex];

        if (!mapped) continue;

        const pageRedactions = mapped.redactions || [];
        const scaleX = size.width / mapped.width;
        const scaleY = size.height / mapped.height;

        pageRedactions.forEach((box) => {
          const x = box.x * scaleX;
          const width = box.width * scaleX;
          const height = box.height * scaleY;
          const y = size.height - (box.y * scaleY) - height;

          page.drawRectangle({
            x,
            y,
            width,
            height,
            color: rgb(0, 0, 0),
          });
        });
      }

      pdfDoc.setTitle('');
      pdfDoc.setAuthor('');
      pdfDoc.setSubject('');
      pdfDoc.setKeywords([]);
      pdfDoc.setCreator('');
      pdfDoc.setProducer('');

      const cleanedPdfBytes = await pdfDoc.save();
      const blob = new Blob([cleanedPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = pdfName ? `${pdfName.replace(/\.pdf$/i, '')}-redacted.pdf` : 'redacted.pdf';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (saveError) {
      console.error(saveError);
      setError('The export failed. Please try again with a different PDF.');
    } finally {
      setProcessing(false);
    }
  };

  const resetWorkspace = () => {
    setPdfFile(null);
    setPdfName('');
    setPages([]);
    setPageDimensions({});
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div className="brand-text">PrivaPDF</div>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-btn" onClick={() => fileInputRef.current?.click()}>
            Upload PDF
          </button>
          {pages.length > 0 && (
            <button type="button" className="secondary-btn" onClick={undoLastRedaction} disabled={!lastRedaction}>
              Undo last redaction
            </button>
          )}
          {pages.length > 0 && (
            <button type="button" className="action-btn" onClick={saveCleanPdf} disabled={processing}>
              {processing ? 'Processing…' : 'Export Clean PDF'}
            </button>
          )}
          {pages.length > 0 && (
            <button type="button" className="warning-btn" onClick={resetWorkspace}>
              Reset
            </button>
          )}
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar-copy">
          <div className="toolbar-title">Private local redaction</div>
          <div className="toolbar-subtitle">Everything stays in your browser. No uploads, no accounts, no cloud risk.</div>
        </div>
        <div className="docs-tag">100% client-side</div>
      </div>

      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept="application/pdf"
        onChange={handleFileInput}
      />

      <div
        className={`dropzone ${isDraggingOver ? 'drag-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
      >
        {pages.length === 0 ? (
          <div className="upload-panel">
            <div className="upload-icon">📄</div>
            <div className="upload-copy">
              <h2>Drop a PDF to redact</h2>
              <p>Draw black boxes over private details, remove pages, and export cleaned copy securely.</p>
            </div>
            <button type="button" className="action-btn" onClick={() => fileInputRef.current?.click()}>
              Choose PDF
            </button>
          </div>
        ) : (
          <div className="pdf-panel" style={{ width: '100%' }}>
            <div className="status-bar">
              <div className="status-text">{pdfName || 'Loaded document'} · {pages.length} pages</div>
              <div className="docs-tag">{totalRedactions} redactions</div>
            </div>

            <div className="page-grid">
              {pages.map((page, pageIndex) => (
                <div
                  key={page.id || page.pageNumber}
                  className="pdf-page"
                  style={{ opacity: removingPageIndex === pageIndex ? 0.45 : 1, transition: 'opacity 120ms ease' }}
                >
                  <div className="page-header">
                    <span>Page {page.pageNumber}</span>
                    <span className="chip">{page.redactions.length} boxes</span>
                  </div>

                  <div className="page-canvas-wrap">
                    <img
                      src={page.previewUrl}
                      className="page-canvas"
                      alt={`PDF page ${page.pageNumber}`}
                      draggable={false}
                      onDragStart={(event) => event.preventDefault()}
                      onPointerDown={(event) => handlePointerDown(event, pageIndex)}
                    />
                    <div className="redaction-layer">
                      {page.redactions.map((box) => (
                        <div
                          key={box.id || `${page.pageNumber}-${box.x}-${box.y}`}
                          className="redaction-box preview removable"
                          title="Click to remove this redaction"
                          onClick={() => removeRedaction(pageIndex, box.id)}
                          style={{
                            left: `${(box.x / page.width) * 100}%`,
                            top: `${(box.y / page.height) * 100}%`,
                            width: `${(box.width / page.width) * 100}%`,
                            height: `${(box.height / page.height) * 100}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="page-footer">
                    <div className="redaction-summary">
                      {page.redactions.length > 0 ? `${page.redactions.length} redactions applied` : 'No redactions yet'}
                    </div>
                    <button type="button" className="inline-delete" onClick={() => removePage(pageIndex)}>
                      Remove page
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <div style={{ color: '#fecaca', marginTop: 12, padding: '10px 12px', background: 'rgba(127,29,29,0.18)', borderRadius: 10 }}>{error}</div>}
    </div>
  );
}

export default App;
