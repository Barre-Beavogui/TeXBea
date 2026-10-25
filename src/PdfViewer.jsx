import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
// The legacy build polyfills recent JavaScript (e.g. Map.getOrInsertComputed) for Safari and older Chrome.
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import './pdf-text-layer.css';
import { Minus, Plus, Maximize2, Presentation, X } from 'lucide-react';
import { locateInPages } from './source-navigation.js';
GlobalWorkerOptions.workerSrc = workerUrl;
const clamp = (n) => Math.min(4, Math.max(0.4, n));
function PdfPage({ page, scale, onSource, occurrences, marker }) {
  const canvasRef = useRef(),
    layerRef = useRef();
  const viewport = page.getViewport({ scale });
  useEffect(() => {
    let cancelled = false,
      renderTask,
      textLayer;
    const canvas = canvasRef.current,
      container = layerRef.current;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const view = page.getViewport({ scale });
    canvas.width = Math.ceil(view.width * ratio);
    canvas.height = Math.ceil(view.height * ratio);
    container.replaceChildren();
    renderTask = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: view,
      transform: [ratio, 0, 0, ratio, 0, 0],
    });
    (async () => {
      try {
        await renderTask.promise;
        const content = await page.getTextContent();
        if (cancelled) return;
        textLayer = new TextLayer({ textContentSource: content, container, viewport: view });
        await textLayer.render();
      } catch (error) {
        if (!cancelled && error.name !== 'RenderingCancelledException') console.error(error);
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [page, scale]);
  function doubleClick(event) {
    const span = event.target.closest('.textLayer span');
    if (!span?.textContent?.trim()) return;
    const spans = [...layerRef.current.querySelectorAll('span')].filter((s) => s.textContent?.trim());
    const index = spans.indexOf(span);
    const fragment = span.textContent;
    const preceding = spans.slice(0, index).filter((s) => s.textContent === fragment).length;
    onSource(fragment, (occurrences[fragment] || 0) + preceding);
  }
  return (
    <div
      className="pdf-page"
      style={{ width: viewport.width, height: viewport.height, '--scale-factor': scale, '--total-scale-factor': scale }}
      onDoubleClick={doubleClick}
    >
      <canvas ref={canvasRef} style={{ width: viewport.width, height: viewport.height }} />
      <div ref={layerRef} className="textLayer" />
      {marker && <div key={marker.id} className="pdf-target" style={{ top: marker.top * scale - 6 }} />}
    </div>
  );
}
// Full-screen slideshow of the compiled PDF: one page at a time, keyboard, click or swipe to move.
function Presenter({ pages, start, onClose }) {
  const [index, setIndex] = useState(start),
    [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const root = useRef(),
    canvas = useRef(),
    touch = useRef();
  const go = (delta) => setIndex((i) => Math.min(pages.length - 1, Math.max(0, i + delta)));
  useEffect(() => {
    const el = root.current;
    el.focus();
    el.requestFullscreen?.().catch(() => {});
    const resize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const leave = () => !document.fullscreenElement && onClose();
    window.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', leave);
    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('fullscreenchange', leave);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);
  useEffect(() => {
    const page = pages[index],
      base = page.getViewport({ scale: 1 });
    const scale = Math.min(size.w / base.width, size.h / base.height),
      ratio = Math.min(window.devicePixelRatio || 1, 2);
    const view = page.getViewport({ scale }),
      c = canvas.current;
    c.width = Math.floor(view.width * ratio);
    c.height = Math.floor(view.height * ratio);
    c.style.width = Math.floor(view.width) + 'px';
    c.style.height = Math.floor(view.height) + 'px';
    const task = page.render({
      canvasContext: c.getContext('2d'),
      viewport: view,
      transform: [ratio, 0, 0, ratio, 0, 0],
    });
    task.promise.catch(() => {});
    return () => task.cancel();
  }, [index, size, pages]);
  function key(e) {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) go(1);
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) go(-1);
    else if (e.key === 'Home') setIndex(0);
    else if (e.key === 'End') setIndex(pages.length - 1);
    else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
  }
  return (
    <div
      ref={root}
      className="presenter"
      tabIndex={-1}
      role="dialog"
      aria-label="Présentation plein écran"
      onKeyDown={key}
      onClick={(e) => go(e.clientX < window.innerWidth / 3 ? -1 : 1)}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touch.current ?? 0);
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      <canvas ref={canvas} />
      <div className="presenter-bar" onClick={(e) => e.stopPropagation()}>
        <span>
          {index + 1} / {pages.length}
        </span>
        <button aria-label="Quitter la présentation" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export default function PdfViewer({ url, onSource, target, onTargetMissing }) {
  const [pages, setPages] = useState([]),
    [error, setError] = useState(''),
    [zoom, setZoom] = useState(1),
    [width, setWidth] = useState(600);
  const scroller = useRef(),
    anchor = useRef(),
    zoomRef = useRef(zoom),
    callback = useRef(onSource),
    [counts, setCounts] = useState([]),
    [texts, setTexts] = useState([]),
    [marker, setMarker] = useState(null),
    [presenting, setPresenting] = useState(null);
  callback.current = onSource;
  // The slideshow starts on the page shown at the top of the viewer.
  function present() {
    const top = scroller.current.getBoundingClientRect().top + 40;
    const shown = [...scroller.current.querySelectorAll('.pdf-page')].findIndex(
      (el) => el.getBoundingClientRect().bottom > top,
    );
    setPresenting(Math.max(0, shown));
  }
  zoomRef.current = zoom;
  useEffect(() => {
    let disposed = false;
    const task = getDocument({ url, isEvalSupported: false });
    setError('');
    setPages([]);
    setTexts([]);
    setMarker(null);
    setZoom(1);
    (async () => {
      try {
        const doc = await task.promise,
          loaded = [],
          maps = [],
          pageTexts = [],
          seen = {};
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          maps.push({ ...seen });
          const text = await page.getTextContent();
          pageTexts.push(text.items);
          for (const item of text.items) if (item.str?.trim()) seen[item.str] = (seen[item.str] || 0) + 1;
          loaded.push(page);
        }
        if (!disposed) {
          setPages(loaded);
          setCounts(maps);
          setTexts(pageTexts);
        }
      } catch (err) {
        if (!disposed) setError('Le PDF ne peut pas être affiché : ' + err.message);
      }
    })();
    return () => {
      disposed = true;
      task.destroy();
    };
  }, [url]);
  useEffect(() => {
    const el = scroller.current;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(220, entry.contentRect.width - 32)));
    observer.observe(el);
    function wheel(event) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect(),
        next = clamp(zoomRef.current * Math.exp(-event.deltaY * 0.003));
      anchor.current = {
        ratio: next / zoomRef.current,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        left: el.scrollLeft,
        top: el.scrollTop,
      };
      zoomRef.current = next;
      setZoom(next);
    }
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', wheel);
    };
  }, []);
  // Forward search: scroll to the place in the PDF that matches the line under the cursor.
  useEffect(() => {
    if (!target || !texts.length || !scroller.current) return;
    const found = locateInPages(texts, target.phrases);
    if (!found) {
      onTargetMissing?.();
      return;
    }
    const page = pages[found.page];
    const height = page.getViewport({ scale: 1 }).height;
    const top = height - texts[found.page][found.item].transform[5] - 10;
    setMarker({ page: found.page, top, id: target.id });
    requestAnimationFrame(() => {
      const el = scroller.current?.querySelectorAll('.pdf-page')[found.page];
      if (!el) return;
      const scale = el.offsetWidth / page.getViewport({ scale: 1 }).width;
      const offset = el.getBoundingClientRect().top - scroller.current.getBoundingClientRect().top;
      scroller.current.scrollTo({
        top: scroller.current.scrollTop + offset + top * scale - scroller.current.clientHeight / 3,
        behavior: 'smooth',
      });
    });
  }, [target, texts]);
  useLayoutEffect(() => {
    if (anchor.current && scroller.current) {
      const a = anchor.current;
      scroller.current.scrollLeft = (a.left + a.x) * a.ratio - a.x;
      scroller.current.scrollTop = (a.top + a.y) * a.ratio - a.y;
      anchor.current = null;
    }
  }, [zoom]);
  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar" aria-label="Navigation du PDF">
        <button aria-label="Réduire le zoom" onClick={() => setZoom((z) => clamp(z / 1.2))}>
          <Minus size={16} />
        </button>
        <span>{Math.round(zoom * 100)} %</span>
        <button aria-label="Agrandir le zoom" onClick={() => setZoom((z) => clamp(z * 1.2))}>
          <Plus size={16} />
        </button>
        <button aria-label="Ajuster à la largeur" onClick={() => setZoom(1)}>
          <Maximize2 size={16} />
        </button>
        <span className="pdf-page-count">
          {pages.length ? `${pages.length} page${pages.length > 1 ? 's' : ''}` : 'Chargement…'}
        </span>
        <small>Double-clic sur le texte : code</small>
        <button
          className="pdf-present"
          disabled={!pages.length}
          title="Présenter en plein écran (flèches pour avancer, Échap pour quitter)"
          onClick={present}
        >
          <Presentation size={15} /> Présenter
        </button>
      </div>
      {presenting !== null && pages.length > 0 && (
        <Presenter pages={pages} start={Math.min(presenting, pages.length - 1)} onClose={() => setPresenting(null)} />
      )}
      <div className="pdf-scroll" ref={scroller} tabIndex={0} aria-label="Document PDF : défiler et zoomer">
        {error && (
          <p role="alert" className="pdf-error">
            {error}
          </p>
        )}
        <div className="pdf-page-stack">
          {pages.map((page, i) => (
            <PdfPage
              key={page.pageNumber}
              page={page}
              scale={(width / page.getViewport({ scale: 1 }).width) * zoom}
              occurrences={counts[i] || {}}
              marker={marker?.page === i ? marker : null}
              onSource={(...args) => callback.current(...args)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
