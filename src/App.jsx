import { useEffect, useRef, useState, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { disableAnalytics, enableAnalytics, trackEvent } from './analytics';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const createFlattenedPageImage = (pageData) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    context.fillStyle = '#000000';

    pageData.redactions
      .filter((redaction) => !redaction.isPreview)
      .forEach((redaction) => {
        context.fillRect(
          (redaction.x / 100) * canvas.width,
          (redaction.y / 100) * canvas.height,
          (redaction.width / 100) * canvas.width,
          (redaction.height / 100) * canvas.height,
        );
      });

    resolve(canvas.toDataURL('image/png'));
  };
  image.onerror = () => reject(new Error('Could not rasterize a PDF page.'));
  image.src = pageData.previewUrl;
});

function AnalyticsConsentBanner({ onAccept, onDecline }) {
  return (
    <aside className="analytics-consent" aria-label="Analytics consent">
      <div>
        <strong>Help improve PrivaPDF?</strong>
        <p>
          Optional anonymous usage analytics help us understand visits and feature usage.
          PDF files, filenames, and document contents are never sent.
        </p>
      </div>
      <div className="analytics-consent-actions">
        <button type="button" className="toolbar-btn" onClick={onDecline}>No thanks</button>
        <button type="button" className="toolbar-btn primary" onClick={onAccept}>Allow analytics</button>
      </div>
    </aside>
  );
}

function App() {
  const fileInputRef = useRef(null);
  const pagesRef = useRef([]);
  const historyRef = useRef({ entries: [], index: -1 });
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [pages, setPages] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [analyticsConsent, setAnalyticsConsent] = useState(() => (
    window.localStorage.getItem('privapdf-analytics-consent')
  ));
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    return () => {
      if (pdfFile?.url) {
        URL.revokeObjectURL(pdfFile.url);
      }
    };
  }, [pdfFile]);

  useEffect(() => {
    if (analyticsConsent === 'accepted') {
      enableAnalytics().then((analytics) => {
        if (analytics) trackEvent('page_view');
      });
    } else if (analyticsConsent === 'declined') {
      disableAnalytics();
    }
  }, [analyticsConsent]);

  const updateAnalyticsConsent = (consent) => {
    window.localStorage.setItem('privapdf-analytics-consent', consent);
    setAnalyticsConsent(consent);
  };

  const addToHistory = useCallback((newPages) => {
    const snapshot = JSON.parse(JSON.stringify(newPages));
    const { entries, index } = historyRef.current;
    const newEntries = entries.slice(0, index + 1);
    newEntries.push(snapshot);
    const newIndex = newEntries.length - 1;

    historyRef.current = { entries: newEntries, index: newIndex };
    pagesRef.current = snapshot;
    setHistory(newEntries);
    setHistoryIndex(newIndex);
    setPages(snapshot);
  }, []);

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

      const initialSnapshot = JSON.parse(JSON.stringify(loadedPages));
      pagesRef.current = loadedPages;
      historyRef.current = { entries: [initialSnapshot], index: 0 };
      setPages(loadedPages);
      setPdfFile({ file, url: URL.createObjectURL(file) });
      setPdfName(file.name);
      setCurrentPageIndex(0);
      setHistory([initialSnapshot]);
      setHistoryIndex(0);
      trackEvent('pdf_imported');
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
          const newPages = JSON.parse(JSON.stringify(prevPages));
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
          pagesRef.current = newPages;
          return newPages;
        });
      }
    };

    const onMouseUp = () => {
      const newPages = JSON.parse(JSON.stringify(pagesRef.current));
      const currentPage = newPages[currentPageIndex];
      const previewIndex = currentPage.redactions.findIndex((r) => r.isPreview);
      let shouldAddToHistory = false;

      if (previewIndex >= 0) {
        const previewBox = currentPage.redactions[previewIndex];
        if (previewBox.width > 0.5 && previewBox.height > 0.5) {
          delete previewBox.isPreview;
          previewBox.id = `redaction-${Date.now()}`;
          shouldAddToHistory = true;
        } else {
          currentPage.redactions.splice(previewIndex, 1);
        }
      }

      if (shouldAddToHistory) {
        addToHistory(newPages);
      } else {
        pagesRef.current = newPages;
        setPages(newPages);
      }

      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const removeRedaction = (redactionId) => {
    const newPages = JSON.parse(JSON.stringify(pagesRef.current));
    newPages[currentPageIndex].redactions = newPages[currentPageIndex].redactions.filter(
      (r) => r.id !== redactionId,
    );
    setPages(newPages);
    addToHistory(newPages);
  };

  const removePage = (pageIndex) => {
    const newPages = pagesRef.current.filter((_, idx) => idx !== pageIndex);
    addToHistory(newPages);
    if (currentPageIndex >= newPages.length) {
      setCurrentPageIndex(Math.max(0, newPages.length - 1));
    }
  };

  const undo = useCallback(() => {
    const { entries, index } = historyRef.current;
    const newIndex = Math.max(0, index - 1);
    if (newIndex === index) return;

    const snapshot = JSON.parse(JSON.stringify(entries[newIndex]));
    historyRef.current = { entries, index: newIndex };
    pagesRef.current = snapshot;
    setHistoryIndex(newIndex);
    setPages(snapshot);
  }, []);

  const redo = useCallback(() => {
    const { entries, index } = historyRef.current;
    const newIndex = Math.min(entries.length - 1, index + 1);
    if (newIndex === index) return;

    const snapshot = JSON.parse(JSON.stringify(entries[newIndex]));
    historyRef.current = { entries, index: newIndex };
    pagesRef.current = snapshot;
    setHistoryIndex(newIndex);
    setPages(snapshot);
  }, []);

  const saveCleanPdf = async () => {
    if (!pdfFile?.file || pages.length === 0) {
      setError('Upload a PDF first to begin redacting.');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const inputBytes = await pdfFile.file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(inputBytes);
      const flattenedPdf = await PDFDocument.create();

      for (let index = 0; index < pages.length; index += 1) {
        const pageData = pages[index];
        const sourcePageIndex = Math.min(
          Math.max(0, pageData.pageNumber - 1),
          sourcePdf.getPageCount() - 1,
        );
        const sourcePage = sourcePdf.getPage(sourcePageIndex);
        const { width, height } = sourcePage.getSize();
        const flattenedImage = await createFlattenedPageImage(pageData);
        const image = await flattenedPdf.embedPng(flattenedImage);
        const page = flattenedPdf.addPage([width, height]);

        page.drawImage(image, {
          x: 0,
          y: 0,
          width,
          height,
        });
      }

      flattenedPdf.setTitle('');
      flattenedPdf.setAuthor('');
      flattenedPdf.setSubject('');
      flattenedPdf.setKeywords([]);
      flattenedPdf.setCreator('');
      flattenedPdf.setProducer('');

      const cleanedPdfBytes = await flattenedPdf.save();
      const blob = new Blob([cleanedPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = pdfName ? `${pdfName.replace(/\.pdf$/i, '')}-redacted.pdf` : 'redacted.pdf';
      anchor.click();
      URL.revokeObjectURL(url);
      trackEvent('redacted_pdf_exported');
    } catch (saveError) {
      console.error(saveError);
      setError('The export failed. Please try again with a different PDF.');
    } finally {
      setProcessing(false);
    }
  };

  const resetWorkspace = () => {
    pagesRef.current = [];
    historyRef.current = { entries: [], index: -1 };
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
            <div className="brand-header">
              <div className="brand-icon">🔒</div>
              <div>
                <h1>PrivaPDF</h1>
                <p className="tagline">Redact Privately</p>
              </div>
            </div>
            <div className="trust-badges">
              <span className="badge secure">🔐 100% Private</span>
              <span className="badge local">⚡ Client-Side Only</span>
            </div>
            <div className="upload-main">
              <div className="upload-icon">📄</div>
              <h2>Drop your PDF here</h2>
              <p className="description">Redact sensitive information without uploading anywhere. Your data stays on your device.</p>
              <button
                type="button"
                className="primary-button"
                onClick={() => fileInputRef.current?.click()}
              >
                Select a PDF
              </button>
            </div>
            <div className="trust-info">
              <div className="info-item">
                <span className="check">✓</span>
                <span>No server uploads</span>
              </div>
              <div className="info-item">
                <span className="check">✓</span>
                <span>No PDF data collection</span>
              </div>
              <div className="info-item">
                <span className="check">✓</span>
                <span>Open source</span>
              </div>
              <div className="info-item">
                <span className="check">✓</span>
                <a className="info-link" href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy policy</a>
              </div>
            </div>
            {error && <div className="error-message">{error}</div>}
          </div>
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            accept="application/pdf"
            onChange={handleFileInput}
          />
          {!analyticsConsent && (
            <AnalyticsConsentBanner
              onAccept={() => updateAnalyticsConsent('accepted')}
              onDecline={() => updateAnalyticsConsent('declined')}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <div className="header">
        <div className="header-left">
          <div className="header-logo">🔒</div>
          <div className="header-brand">
            <h1>PrivaPDF</h1>
            <span className="header-badge">secure • private</span>
          </div>
          <span className="file-name">{pdfName}</span>
        </div>
        <div className="header-center">
          <button onClick={undo} disabled={!canUndo} className="toolbar-btn" title="Undo">↶</button>
          <button onClick={redo} disabled={!canRedo} className="toolbar-btn" title="Redo">↷</button>
        </div>
        <div className="header-right">
          <a
            href="https://github.com/harish-kunta/PrivaPDF"
            target="_blank"
            rel="noreferrer"
            className="toolbar-btn github-link"
          >
            Open source
          </a>
          <a
            href={`${import.meta.env.BASE_URL}privacy.html`}
            className="toolbar-btn github-link"
          >
            Privacy
          </a>
          <button onClick={resetWorkspace} className="toolbar-btn secondary">New</button>
          <button
            onClick={saveCleanPdf}
            disabled={processing}
            className="toolbar-btn primary"
            title="Creates a flattened PDF with redactions baked into the page images"
          >
            {processing ? 'Exporting...' : 'Export Flattened PDF'}
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
      {!analyticsConsent && (
        <AnalyticsConsentBanner
          onAccept={() => updateAnalyticsConsent('accepted')}
          onDecline={() => updateAnalyticsConsent('declined')}
        />
      )}
    </div>
  );
}

export default App;
