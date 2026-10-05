import { useEffect, useRef, useState, useCallback } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

function App() {
  const fileInputRef = useRef(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [pages, setPages] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    return () => {
      if (pdfFile?.url) {
        URL.revokeObjectURL(pdfFile.url);
      }
    };
  }, [pdfFile]);

  const addToHistory = useCallback((newPages) => {
    setHistory((prev) => {
      const updatedHistory = prev.slice(0, historyIndex + 1);
      updatedHistory.push(JSON.parse(JSON.stringify(newPages)));
      return updatedHistory;
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const renderPdf = async (file) => {
    setError('');
    setProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageData = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        pageData.push({
          id: `${pageNumber}-${Date.now()}`,
          pageNumber,
          redactions: [],
        });
      }

      const loadedPages = await Promise.all(
        pageData.map(async (pageMeta) => {
          const page = await pdf.getPage(pageMeta.pageNumber);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: context, viewport }).promise;
          const previewUrl = canvas.toDataURL('image/png');

          return {
            ...pageMeta,
            previewUrl,
            width: viewport.width,
            height: viewport.height,
          };
        }),
      );

      setPages(loadedPages);
      setPdfFile({ file, url: URL.createObjectURL(file) });
      setPdfName(file.name);
      setCurrentPageIndex(0);
      setHistory([JSON.parse(JSON.stringify(loadedPages))]);
      setHistoryIndex(0);
    } catch (loadError) {
      console.error(loadError);
      setError('Could not load this PDF. Please try another file.');
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

  const handleCanvasMouseDown = (event) => {
    if (!pages.length) return;
    const img = event.currentTarget;
    const rect = img.getBoundingClientRect();
    const startX = (event.clientX - rect.left) / (rect.width / 100);
    const startY = (event.clientY - rect.top) / (rect.height / 100);

    const onMouseMove = (moveEvent) => {
      const currentX = (moveEvent.clientX - rect.left) / (rect.width / 100);
      const currentY = (moveEvent.clientY - rect.top) / (rect.height / 100);

      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      if (width > 0.5 && height > 0.5) {
        setPages((prevPages) => {
          const newPages = [...prevPages];
          const currentPage = newPages[currentPageIndex];
          const redactionBox = {
            id: `temp-${Date.now()}`,
            x,
            y,
            width,
            height,
            isPreview: true,
          };

          const existingPreviewIndex = currentPage.redactions.findIndex((r) => r.isPreview);
          if (existingPreviewIndex >= 0) {
            newPages[currentPageIndex].redactions[existingPreviewIndex] = redactionBox;
          } else {
            newPages[currentPageIndex].redactions.push(redactionBox);
          }
          return newPages;
        });
      }
    };

    const onMouseUp = () => {
      setPages((prevPages) => {
        const newPages = JSON.parse(JSON.stringify(prevPages));
        const currentPage = newPages[currentPageIndex];
        const previewIndex = currentPage.redactions.findIndex((r) => r.isPreview);

        if (previewIndex >= 0) {
          const previewBox = currentPage.redactions[previewIndex];
          if (previewBox.width > 0.5 && previewBox.height > 0.5) {
            delete previewBox.isPreview;
            previewBox.id = `redaction-${Date.now()}`;
            addToHistory(newPages);
          } else {
            currentPage.redactions.splice(previewIndex, 1);
          }
        }
        return newPages;
      });

      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const removeRedaction = (redactionId) => {
    setPages((prevPages) => {
      const newPages = JSON.parse(JSON.stringify(prevPages));
      newPages[currentPageIndex].redactions = newPages[currentPageIndex].redactions.filter(
        (r) => r.id !== redactionId,
      );
      addToHistory(newPages);
      return newPages;
    });
  };

  const removePage = (pageIndex) => {
    setPages((prevPages) => {
      const newPages = prevPages.filter((_, idx) => idx !== pageIndex);
      addToHistory(newPages);
      if (currentPageIndex >= newPages.length) {
        setCurrentPageIndex(Math.max(0, newPages.length - 1));
      }
      return newPages;
    });
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setPages(JSON.parse(JSON.stringify(history[newIndex])));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setPages(JSON.parse(JSON.stringify(history[newIndex])));
    }
  };

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

      pages.forEach((pageData, idx) => {
        if (idx >= pageCount) return;
        const page = pdfDoc.getPage(idx);
        const { width, height } = page.getSize();

        const redactions = pageData.redactions.filter((r) => !r.isPreview);
        redactions.forEach((box) => {
          const x = (box.x / 100) * width;
          const y = height - ((box.y + box.height) / 100) * height;
          const w = (box.width / 100) * width;
          const h = (box.height / 100) * height;

          page.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            color: rgb(0, 0, 0),
          });
        });
      });

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
    setError('');
    setCurrentPageIndex(0);
    setHistory([]);
    setHistoryIndex(-1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const currentPage = pages[currentPageIndex];
  const totalRedactions = pages.reduce((sum, p) => sum + p.redactions.filter((r) => !r.isPreview).length, 0);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  if (pages.length === 0) {
    return (
      <div
        className="app-container upload-view"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
      >
        <div className={`upload-zone ${isDraggingOver ? 'active' : ''}`}>
          <div className="upload-content">
            <div className="upload-icon">📄</div>
            <h1>Drop your PDF here</h1>
            <p>Redact sensitive information. No uploads, no servers, no tracking.</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => fileInputRef.current?.click()}
            >
              Select a PDF
            </button>
            {error && <div className="error-message">{error}</div>}
          </div>
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            accept="application/pdf"
            onChange={handleFileInput}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <div className="header">
        <div className="header-left">
          <h1>PrivaPDF</h1>
          <span className="file-name">{pdfName}</span>
        </div>
        <div className="header-center">
          <button onClick={undo} disabled={!canUndo} className="toolbar-btn" title="Undo">↶</button>
          <button onClick={redo} disabled={!canRedo} className="toolbar-btn" title="Redo">↷</button>
        </div>
        <div className="header-right">
          <button onClick={resetWorkspace} className="toolbar-btn secondary">New</button>
          <button onClick={saveCleanPdf} disabled={processing} className="toolbar-btn primary">
            {processing ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="content-area">
        <div className="sidebar">
          <div className="sidebar-title">Pages ({pages.length})</div>
          <div className="thumbnails-list">
            {pages.map((page, idx) => (
              <button
                key={page.id}
                className={`thumbnail ${idx === currentPageIndex ? 'active' : ''}`}
                onClick={() => setCurrentPageIndex(idx)}
              >
                <img src={page.previewUrl} alt={`Page ${idx + 1}`} />
                <div className="page-number">{idx + 1}</div>
                {page.redactions.some((r) => !r.isPreview) && (
                  <div className="redaction-badge">{page.redactions.filter((r) => !r.isPreview).length}</div>
                )}
              </button>
            ))}
          </div>
          <div className="sidebar-stats">
            <div className="stat">
              <span className="stat-label">Total Redactions</span>
              <span className="stat-value">{totalRedactions}</span>
            </div>
          </div>
        </div>

        <div className="main-content">
          <div className="canvas-area">
            {currentPage && (
              <div className="pdf-page-container">
                <img
                  src={currentPage.previewUrl}
                  alt={`Page ${currentPageIndex + 1}`}
                  className="pdf-image"
                  onMouseDown={handleCanvasMouseDown}
                  draggable={false}
                />
                <div className="redactions-canvas">
                  {currentPage.redactions.map((box) => (
                    <div
                      key={box.id}
                      className={`redaction ${box.isPreview ? 'preview' : ''}`}
                      style={{
                        left: `${box.x}%`,
                        top: `${box.y}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                      }}
                      onClick={() => !box.isPreview && removeRedaction(box.id)}
                      title={box.isPreview ? '' : 'Click to remove'}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="footer">
            <div className="footer-left">
              <span>Page {currentPageIndex + 1} of {pages.length}</span>
              {currentPage?.redactions.some((r) => !r.isPreview) && (
                <span className="redaction-count">• {currentPage.redactions.filter((r) => !r.isPreview).length} redactions</span>
              )}
            </div>
            <div className="footer-center">
              <button
                onClick={() => setCurrentPageIndex(Math.max(0, currentPageIndex - 1))}
                disabled={currentPageIndex === 0}
                className="nav-btn"
              >
                ←
              </button>
              <input
                type="number"
                value={currentPageIndex + 1}
                onChange={(e) => {
                  const page = parseInt(e.target.value) - 1;
                  if (page >= 0 && page < pages.length) {
                    setCurrentPageIndex(page);
                  }
                }}
                min="1"
                max={pages.length}
                className="page-input"
              />
              <button
                onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, currentPageIndex + 1))}
                disabled={currentPageIndex === pages.length - 1}
                className="nav-btn"
              >
                →
              </button>
            </div>
            <div className="footer-right">
              <button
                onClick={() => removePage(currentPageIndex)}
                className="nav-btn delete"
                title="Remove this page"
              >
                🗑
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error-bar">{error}</div>}

      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept="application/pdf"
        onChange={handleFileInput}
      />
    </div>
  );
}

export default App;
