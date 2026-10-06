import { useEffect, useRef, useState, useCallback } from 'react';
import { disableAnalytics, enableAnalytics } from './analytics';
import {
  appendHistory,
  createHistoryState,
  moveHistory,
} from './history';

const createFlattenedPageImage = async (pageData, pdfPage, onRenderTask) => {
  const viewport = pdfPage.getViewport({ scale: 3 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  try {
    const renderTask = pdfPage.render({ canvasContext: context, viewport });
    onRenderTask(renderTask);
    await renderTask.promise;
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

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode the exported PDF page.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
};

function AnalyticsConsentBanner({ onAccept, onDecline, className = '' }) {
  return (
    <aside className={`analytics-consent ${className}`} aria-label="Analytics consent">
      <div>
        <strong>Help improve PrivaPDF?</strong>
        <p>
          Optional Cloudflare analytics count page visits. If you allow it, your browser
          contacts Cloudflare for basic traffic measurement. Your PDFs, filenames, and
          document contents are never sent.
        </p>
      </div>
      <div className="analytics-consent-actions">
        <button type="button" className="toolbar-btn" onClick={onDecline}>No thanks</button>
        <button type="button" className="toolbar-btn primary" onClick={onAccept}>Allow analytics</button>
      </div>
    </aside>
  );
}

const canvasToObjectUrl = (canvas, type = 'image/png', quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) {
      reject(new Error('Could not create a PDF page preview.'));
      return;
    }
    resolve(URL.createObjectURL(blob));
  }, type, quality);
});

function App() {
  const fileInputRef = useRef(null);
  const pagesRef = useRef([]);
  const pageAssetsRef = useRef(new Map());
  const historyRef = useRef({ entries: [], index: -1 });
  const pdfDocumentRef = useRef(null);
  const pagePreviewUrlRef = useRef(null);
  const activePageRenderTaskRef = useRef(null);
  const activeLoadingTaskRef = useRef(null);
  const cancelRequestedRef = useRef(false);
  const [currentPagePreviewUrl, setCurrentPagePreviewUrl] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [pages, setPages] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isDrawingMode, setIsDrawingMode] = useState(() => (
    !window.matchMedia('(pointer: coarse)').matches
  ));
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [error, setError] = useState('');
  const [analyticsConsent, setAnalyticsConsent] = useState(() => (
    window.localStorage.getItem('privapdf-cloudflare-analytics-consent')
  ));
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => () => {
    pdfDocumentRef.current?.destroy();
    pageAssetsRef.current.forEach((asset) => URL.revokeObjectURL(asset.previewUrl));
    if (pagePreviewUrlRef.current) URL.revokeObjectURL(pagePreviewUrlRef.current);
  }, []);

  useEffect(() => {
    const page = pages[currentPageIndex];
    const pdf = pdfDocumentRef.current;
    if (!page || !pdf || !pdfFile) return undefined;

    let cancelled = false;
    let canvas;
    let renderTask;
    setCurrentPagePreviewUrl(page.previewUrl);

    const renderFullPage = async () => {
      try {
        const pdfPage = await pdf.getPage(page.pageNumber);
        if (cancelled) return;
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(1.5, 1200 / baseViewport.width);
        const viewport = pdfPage.getViewport({ scale });
        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        renderTask = pdfPage.render({ canvasContext: context, viewport });
        activePageRenderTaskRef.current = renderTask;
        await renderTask.promise;
        if (cancelled) return;

        const previewUrl = await canvasToObjectUrl(canvas);
        if (cancelled) {
          URL.revokeObjectURL(previewUrl);
          return;
        }

        if (pagePreviewUrlRef.current) URL.revokeObjectURL(pagePreviewUrlRef.current);
        pagePreviewUrlRef.current = previewUrl;
        setCurrentPagePreviewUrl(previewUrl);
      } catch (renderError) {
        if (!cancelled && renderError?.name !== 'RenderingCancelledException') {
          setError('Could not render this page. Try selecting it again.');
        }
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        if (activePageRenderTaskRef.current === renderTask) activePageRenderTaskRef.current = null;
      }
    };

    renderFullPage();
    return () => {
      cancelled = true;
      activePageRenderTaskRef.current?.cancel();
      if (pagePreviewUrlRef.current) {
        URL.revokeObjectURL(pagePreviewUrlRef.current);
        pagePreviewUrlRef.current = null;
      }
    };
  }, [currentPageIndex, pages[currentPageIndex]?.id, pdfFile]);

  useEffect(() => {
    if (analyticsConsent === 'accepted') {
      enableAnalytics();
    } else {
      disableAnalytics();
    }
  }, [analyticsConsent]);

  const updateAnalyticsConsent = (consent) => {
    if (consent) {
      window.localStorage.setItem('privapdf-cloudflare-analytics-consent', consent);
    } else {
      window.localStorage.removeItem('privapdf-cloudflare-analytics-consent');
    }
    setAnalyticsConsent(consent);
  };

  const manageAnalyticsConsent = () => {
    updateAnalyticsConsent(null);
  };

  const addToHistory = useCallback((newPages) => {
    const nextHistory = appendHistory(historyRef.current, newPages);
    historyRef.current = nextHistory;
    pagesRef.current = newPages;
    setHistory(nextHistory.entries);
    setHistoryIndex(nextHistory.index);
    setPages(newPages);
  }, []);

  const renderPdf = async (file) => {
    setError('');
    setProcessing(true);
    setProcessingMessage('Opening PDF…');
    let pdf;
    const thumbnailUrls = [];
    let keepDocument = false;
    cancelRequestedRef.current = false;

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      const arrayBuffer = await file.arrayBuffer();
      if (cancelRequestedRef.current) throw new DOMException('Operation cancelled', 'AbortError');
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      activeLoadingTaskRef.current = loadingTask;
      pdf = await loadingTask.promise;
      activeLoadingTaskRef.current = null;
      const loadedPages = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (cancelRequestedRef.current) throw new DOMException('Operation cancelled', 'AbortError');
        setProcessingMessage(`Preparing page ${pageNumber} of ${pdf.numPages}…`);
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(0.35, 180 / baseViewport.width);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        try {
          const renderTask = page.render({ canvasContext: context, viewport });
          activePageRenderTaskRef.current = renderTask;
          await renderTask.promise;
          if (activePageRenderTaskRef.current === renderTask) activePageRenderTaskRef.current = null;
          const previewUrl = await canvasToObjectUrl(canvas, 'image/jpeg', 0.78);
          thumbnailUrls.push(previewUrl);
          loadedPages.push({
            id: `${pageNumber}-${Date.now()}`,
            pageNumber,
            redactions: [],
            previewUrl,
            width: viewport.width,
            height: viewport.height,
          });
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }

      const initialHistory = createHistoryState(loadedPages);
      pageAssetsRef.current = new Map(loadedPages.map((page) => [page.id, {
        previewUrl: page.previewUrl,
        width: page.width,
        height: page.height,
      }]));
      pagesRef.current = loadedPages;
      historyRef.current = initialHistory;
      if (cancelRequestedRef.current) throw new DOMException('Operation cancelled', 'AbortError');
      pdfDocumentRef.current?.destroy();
      pdfDocumentRef.current = pdf;
      keepDocument = true;
      setPages(loadedPages);
      setPdfFile({ file });
      setPdfName(file.name);
      setCurrentPageIndex(0);
      setHistory(initialHistory.entries);
      setHistoryIndex(initialHistory.index);
    } catch (loadError) {
      thumbnailUrls.forEach((url) => URL.revokeObjectURL(url));
      if (loadError?.name === 'AbortError' || cancelRequestedRef.current) {
        // Cancellation is intentional; keep the upload screen ready for another file.
      } else if (loadError?.name === 'PasswordException') {
        setError('This PDF is password-protected. Remove its password and try again.');
      } else if (loadError?.name === 'InvalidPDFException') {
        setError('This file could not be read as a PDF. Try another copy of the document.');
      } else {
        console.error(loadError);
        setError('Could not load this PDF. Please try another file.');
      }
    } finally {
      if (!keepDocument) pdf?.destroy();
      activeLoadingTaskRef.current = null;
      activePageRenderTaskRef.current = null;
      cancelRequestedRef.current = false;
      setProcessing(false);
      setProcessingMessage('');
    }
  };

  const handleFileInput = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a valid PDF file.');
      event.target.value = '';
      return;
    }
    await renderPdf(file);
    event.target.value = '';
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDraggingOver(false);
    if (processing) return;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files can be redacted.');
      return;
    }
    await renderPdf(file);
  };

  const handleCanvasPointerDown = (event) => {
    if (!pages.length || processing) return;
    if (!isDrawingMode) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const img = event.currentTarget;
    const rect = img.getBoundingClientRect();
    const clamp = (value) => Math.min(100, Math.max(0, value));
    const startX = clamp(((event.clientX - rect.left) / rect.width) * 100);
    const startY = clamp(((event.clientY - rect.top) / rect.height) * 100);
    const pointerId = event.pointerId;
    const previewId = `temp-${Date.now()}`;
    const drawPageIndex = currentPageIndex;

    const onPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const currentX = clamp(((moveEvent.clientX - rect.left) / rect.width) * 100);
      const currentY = clamp(((moveEvent.clientY - rect.top) / rect.height) * 100);

      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      if (width > 0.5 && height > 0.5) {
        const currentPages = pagesRef.current;
        const newPages = [...currentPages];
        const currentPage = newPages[drawPageIndex];
        const redactionBox = {
          id: previewId,
          x,
          y,
          width,
          height,
          isPreview: true,
        };
        const redactions = [...currentPage.redactions];
        const existingPreviewIndex = redactions.findIndex((r) => r.isPreview);
        if (existingPreviewIndex >= 0) {
          redactions[existingPreviewIndex] = redactionBox;
        } else {
          redactions.push(redactionBox);
        }
        newPages[drawPageIndex] = { ...currentPage, redactions };
        pagesRef.current = newPages;
        setPages(newPages);
      }
    };

    const finishPointer = (finishEvent, commit) => {
      if (finishEvent.pointerId !== pointerId) return;
      const currentPages = pagesRef.current;
      const currentPage = currentPages[drawPageIndex];
      const previewIndex = currentPage?.redactions.findIndex((r) => r.id === previewId) ?? -1;
      let shouldAddToHistory = false;
      let newPages = currentPages;

      if (previewIndex >= 0) {
        const redactions = currentPage.redactions.map((redaction) => ({ ...redaction }));
        const previewBox = redactions[previewIndex];
        if (commit && previewBox.width > 0.5 && previewBox.height > 0.5) {
          delete previewBox.isPreview;
          previewBox.id = `redaction-${Date.now()}`;
          shouldAddToHistory = true;
        } else {
          redactions.splice(previewIndex, 1);
        }
        newPages = [...currentPages];
        newPages[drawPageIndex] = { ...currentPage, redactions };
      }

      if (shouldAddToHistory) {
        addToHistory(newPages);
      } else {
        pagesRef.current = newPages;
        setPages(newPages);
      }

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };

    const onPointerUp = (upEvent) => finishPointer(upEvent, true);
    const onPointerCancel = (cancelEvent) => finishPointer(cancelEvent, false);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  };

  const removeRedaction = (redactionId) => {
    const currentPages = pagesRef.current;
    const newPages = [...currentPages];
    newPages[currentPageIndex] = {
      ...currentPages[currentPageIndex],
      redactions: currentPages[currentPageIndex].redactions.filter((r) => r.id !== redactionId),
    };
    addToHistory(newPages);
  };

  const removePage = (pageIndex) => {
    if (pagesRef.current.length <= 1) return;
    const newPages = pagesRef.current.filter((_, idx) => idx !== pageIndex);
    addToHistory(newPages);
    if (currentPageIndex >= newPages.length) {
      setCurrentPageIndex(Math.max(0, newPages.length - 1));
    }
  };

  const undo = useCallback(() => {
    const result = moveHistory(historyRef.current, -1, pageAssetsRef.current);
    if (!result) return;

    historyRef.current = result.history;
    pagesRef.current = result.pages;
    setHistoryIndex(result.history.index);
    setPages(result.pages);
  }, []);

  const redo = useCallback(() => {
    const result = moveHistory(historyRef.current, 1, pageAssetsRef.current);
    if (!result) return;

    historyRef.current = result.history;
    pagesRef.current = result.pages;
    setHistoryIndex(result.history.index);
    setPages(result.pages);
  }, []);

  const saveCleanPdf = async () => {
    if (!pdfFile?.file || pages.length === 0) {
      setError('Upload a PDF first to begin redacting.');
      return;
    }

    if (totalRedactions === 0) {
      setError('Add at least one redaction before exporting.');
      return;
    }

    setProcessing(true);
    setProcessingMessage('Preparing export…');
    setError('');
    cancelRequestedRef.current = false;
    const renderPdfDocument = pdfDocumentRef.current;

    try {
      if (!renderPdfDocument) throw new Error('The source PDF is no longer available.');
      const { PDFDocument } = await import('pdf-lib');
      const flattenedPdf = await PDFDocument.create();

      for (let index = 0; index < pages.length; index += 1) {
        if (cancelRequestedRef.current) throw new DOMException('Operation cancelled', 'AbortError');
        setProcessingMessage(`Exporting page ${index + 1} of ${pages.length}…`);
        const pageData = pages[index];
        const renderPage = await renderPdfDocument.getPage(pageData.pageNumber);
        const { width, height } = renderPage.getViewport({ scale: 1 });
        const flattenedImage = await createFlattenedPageImage(pageData, renderPage, (task) => {
          activePageRenderTaskRef.current = task;
        });
        activePageRenderTaskRef.current = null;
        const image = await flattenedPdf.embedPng(flattenedImage);
        const page = flattenedPdf.addPage([width, height]);

        page.drawImage(image, {
          x: 0,
          y: 0,
          width,
          height,
        });
      }

      if (cancelRequestedRef.current) throw new DOMException('Operation cancelled', 'AbortError');

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
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (saveError) {
      if (saveError?.name !== 'AbortError' && !cancelRequestedRef.current) {
        console.error(saveError);
        setError('The export failed. Please try again with a different PDF.');
      }
    } finally {
      activePageRenderTaskRef.current = null;
      cancelRequestedRef.current = false;
      setProcessing(false);
      setProcessingMessage('');
    }
  };

  const cancelProcessing = () => {
    cancelRequestedRef.current = true;
    activePageRenderTaskRef.current?.cancel();
    activeLoadingTaskRef.current?.destroy();
  };

  const resetWorkspace = () => {
    if (historyIndex > 0 && !window.confirm('Start a new PDF? Your current document changes and redactions will be lost.')) {
      return;
    }
    pagesRef.current = [];
    pageAssetsRef.current.forEach((asset) => URL.revokeObjectURL(asset.previewUrl));
    pageAssetsRef.current.clear();
    pdfDocumentRef.current?.destroy();
    pdfDocumentRef.current = null;
    if (pagePreviewUrlRef.current) URL.revokeObjectURL(pagePreviewUrlRef.current);
    pagePreviewUrlRef.current = null;
    setCurrentPagePreviewUrl(null);
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
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
  const totalRedactions = pages.reduce((sum, p) => sum + p.redactions.filter((r) => !r.isPreview).length, 0);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  if (pages.length === 0) {
    return (
      <div
        className={`app-container upload-view ${!analyticsConsent ? 'has-analytics-consent' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
      >
        <div className={`upload-zone ${isDraggingOver ? 'active' : ''}`}>
          <main className="upload-content">
            <div className="brand-header">
              <div className="brand-icon">🔒</div>
              <div>
                <h1>PrivaPDF</h1>
                <p className="tagline">Redact Privately</p>
              </div>
            </div>
            <div className="trust-badges">
              <span className="badge secure">🔐 PDFs stay on your device</span>
              <span className="badge local">⚡ Client-side processing</span>
            </div>
            <div className="upload-main">
              <div className="upload-icon">📄</div>
              <h2>Drop your PDF here</h2>
              <p className="description">Redact sensitive information without uploading your PDF. Your document stays on your device.</p>
              <button
                type="button"
                className="primary-button"
                disabled={processing}
                onClick={() => fileInputRef.current?.click()}
              >
                {processing ? 'Preparing PDF…' : 'Select a PDF'}
              </button>
              {processing && (
                <div className="processing-controls">
                  <p className="processing-status" role="status" aria-live="polite">{processingMessage}</p>
                  <button type="button" className="toolbar-btn" onClick={cancelProcessing}>Cancel</button>
                </div>
              )}
            </div>
            <div className="trust-info">
              <div className="info-item">
                <span className="check">✓</span>
                <span>Your PDFs are never uploaded</span>
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
              {analyticsConsent && (
                <div className="info-item">
                  <span className="check" aria-hidden="true"> </span>
                  <button type="button" className="toolbar-btn" onClick={manageAnalyticsConsent}>
                    Analytics settings
                  </button>
                </div>
              )}
            </div>
            {error && <div className="error-message" role="alert">{error}</div>}
          </main>
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
      <header className="header">
        <div className="header-left">
          <div className="header-logo">🔒</div>
          <div className="header-brand">
            <h1>PrivaPDF</h1>
            <span className="header-badge">secure • private</span>
          </div>
          <span className="file-name">{pdfName}</span>
        </div>
        <div className="header-center history-controls" role="group" aria-label="Edit history">
          <button
            type="button"
            onClick={undo}
            disabled={processing || !canUndo}
            className="history-button"
            title="Undo"
            aria-label="Undo last change"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h9a7 7 0 0 1 0 14h-2" />
            </svg>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={processing || !canRedo}
            className="history-button"
            title="Redo"
            aria-label="Redo last change"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9h-9a7 7 0 0 0 0 14h2" />
            </svg>
          </button>
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
          <button type="button" className="toolbar-btn github-link" onClick={manageAnalyticsConsent}>
            Analytics settings
          </button>
          <button onClick={resetWorkspace} disabled={processing} className="toolbar-btn secondary">New</button>
          <button
            onClick={saveCleanPdf}
            disabled={processing || totalRedactions === 0}
            className="toolbar-btn primary"
            title={totalRedactions === 0
              ? 'Add at least one redaction to enable export'
              : 'Exports image-only pages; text search, selection, and links are not preserved'}
            aria-describedby="export-help"
          >
            {processing ? 'Exporting…' : totalRedactions === 0 ? 'Add redactions to export' : 'Export Image-only PDF'}
          </button>
          <span id="export-help" className="sr-only">Export creates image-only pages. Text search, selection, and links will not be preserved.</span>
        </div>
      </header>

      <main className="content-area">
        <nav className="sidebar" aria-label="PDF pages">
          <div className="sidebar-title">Pages ({pages.length})</div>
          <div className="thumbnails-list">
            {pages.map((page, idx) => (
              <button
                key={page.id}
                className={`thumbnail ${idx === currentPageIndex ? 'active' : ''}`}
                onClick={() => setCurrentPageIndex(idx)}
                disabled={processing}
                aria-label={`Go to page ${idx + 1}${page.redactions.filter((r) => !r.isPreview).length
                  ? `, ${page.redactions.filter((r) => !r.isPreview).length} redactions`
                  : ', no redactions'}`}
                aria-current={idx === currentPageIndex ? 'page' : undefined}
              >
                <img src={page.previewUrl} alt="" />
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
        </nav>

        <section className="main-content" aria-label="Document editor">
          <div className="canvas-area">
            {currentPage && (
              <div className="pdf-page-container">
                <img
                  src={currentPagePreviewUrl || currentPage.previewUrl}
                  alt={`Page ${currentPageIndex + 1}`}
                  className={`pdf-image ${isDrawingMode ? 'drawing-enabled' : ''}`}
                  onPointerDown={handleCanvasPointerDown}
                  draggable={false}
                />
                <div className="redactions-canvas">
                  {currentPage.redactions.map((box) => (
                    <button
                      type="button"
                      key={box.id}
                      className={`redaction ${box.isPreview ? 'preview' : ''}`}
                      style={{
                        left: `${box.x}%`,
                        top: `${box.y}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                      }}
                      onClick={() => !box.isPreview && removeRedaction(box.id)}
                      disabled={processing || box.isPreview}
                      aria-label={box.isPreview ? 'Redaction preview' : `Remove redaction ${currentPage.redactions
                        .filter((r) => !r.isPreview)
                        .findIndex((redaction) => redaction.id === box.id) + 1}`}
                      title={box.isPreview ? '' : 'Click to remove this redaction'}
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
                disabled={processing || currentPageIndex === 0}
                className="nav-btn"
                aria-label="Previous page"
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
                aria-label={`Current page, from 1 to ${pages.length}`}
                disabled={processing}
              />
              <button
                onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, currentPageIndex + 1))}
                disabled={processing || currentPageIndex === pages.length - 1}
                className="nav-btn"
                aria-label="Next page"
              >
                →
              </button>
            </div>
            <div className="footer-right">
              {isTouchDevice && !isDrawingMode && (
                <span className="touch-hint">Tap “Draw redactions” to mark an area.</span>
              )}
              <button
                onClick={() => setIsDrawingMode((enabled) => !enabled)}
                type="button"
                className={`toolbar-btn ${isDrawingMode ? 'primary' : ''}`}
                aria-pressed={isDrawingMode}
                aria-label={isDrawingMode ? 'Exit redaction drawing mode' : 'Enable redaction drawing mode'}
                disabled={processing}
              >
                {isDrawingMode ? 'Done drawing' : 'Draw redactions'}
              </button>
              <button
                onClick={() => removePage(currentPageIndex)}
                className="nav-btn delete"
                title="Remove this page"
                aria-label={`Remove page ${currentPageIndex + 1}`}
                aria-describedby={pages.length <= 1 ? 'last-page-help' : undefined}
                disabled={processing || pages.length <= 1}
              >
                🗑
              </button>
              {pages.length <= 1 && <span id="last-page-help" className="sr-only">A document must keep at least one page.</span>}
            </div>
          </div>
        </section>
      </main>

      {processing && (
        <div className="processing-status editor-processing" role="status" aria-live="polite">
          {processingMessage}
          <button type="button" className="toolbar-btn" onClick={cancelProcessing}>Cancel</button>
        </div>
      )}
      {error && <div className="error-bar" role="alert">{error}</div>}

      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept="application/pdf"
        onChange={handleFileInput}
      />
      {!analyticsConsent && (
        <AnalyticsConsentBanner
          className="editor-consent"
          onAccept={() => updateAnalyticsConsent('accepted')}
          onDecline={() => updateAnalyticsConsent('declined')}
        />
      )}
    </div>
  );
}

export default App;
