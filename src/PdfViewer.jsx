import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {getDocument, GlobalWorkerOptions, TextLayer} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './pdf-text-layer.css';
import {Minus, Plus, Maximize2} from 'lucide-react';
GlobalWorkerOptions.workerSrc = workerUrl;
const clamp = n => Math.min(4, Math.max(0.4, n));
function PdfPage({page, scale, onSource, occurrences}) {
  const canvasRef = useRef(), layerRef = useRef();
  const viewport = page.getViewport({scale});
  useEffect(() => {
    let cancelled = false, renderTask, textLayer;
    const canvas = canvasRef.current, container = layerRef.current;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const view = page.getViewport({scale});
    canvas.width = Math.ceil(view.width * ratio); canvas.height = Math.ceil(view.height * ratio);
    container.replaceChildren();
    renderTask = page.render({canvasContext: canvas.getContext('2d'), viewport: view, transform: [ratio, 0, 0, ratio, 0, 0]});
    (async () => {
      try {
        await renderTask.promise;
        const content = await page.getTextContent();
        if (cancelled) return;
        textLayer = new TextLayer({textContentSource: content, container, viewport: view});
        await textLayer.render();
      } catch (error) { if (!cancelled && error.name !== 'RenderingCancelledException') console.error(error); }
    })();
    return () => { cancelled = true; renderTask?.cancel(); textLayer?.cancel(); };
  }, [page, scale]);
  function doubleClick(event) {
    const span = event.target.closest('.textLayer span');
    if (!span?.textContent?.trim()) return;
    const spans = [...layerRef.current.querySelectorAll('span')].filter(s => s.textContent?.trim());
    const index = spans.indexOf(span);
    const fragment = span.textContent;
    const preceding = spans.slice(0, index).filter(s => s.textContent === fragment).length;
    onSource(fragment, (occurrences[fragment] || 0) + preceding);
  }
  return <div className="pdf-page" style={{width: viewport.width, height: viewport.height, '--scale-factor':scale, '--total-scale-factor':scale}} onDoubleClick={doubleClick}>
    <canvas ref={canvasRef} style={{width: viewport.width, height: viewport.height}} />
    <div ref={layerRef} className="textLayer" />
  </div>;
}
export default function PdfViewer({url, onSource}) {
  const [pages, setPages] = useState([]), [error, setError] = useState(''), [zoom, setZoom] = useState(1), [width, setWidth] = useState(600);
  const scroller = useRef(), anchor = useRef(), zoomRef = useRef(zoom), callback = useRef(onSource), [counts, setCounts] = useState([]);
  callback.current = onSource; zoomRef.current = zoom;
  useEffect(() => {
    let disposed = false;
    const task = getDocument({url, isEvalSupported:false});
    setError(''); setPages([]); setZoom(1);
    (async () => {
      try {
        const doc = await task.promise, loaded = [], maps = [], seen = {};
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n); maps.push({...seen});
          const text = await page.getTextContent();
          for (const item of text.items) if (item.str?.trim()) seen[item.str] = (seen[item.str] || 0) + 1;
          loaded.push(page);
        }
        if (!disposed) { setPages(loaded); setCounts(maps); }
      } catch (err) { if (!disposed) setError('Le PDF ne peut pas être affiché : ' + err.message); }
    })();
    return () => { disposed = true; task.destroy(); };
  }, [url]);
  useEffect(() => {
    const el = scroller.current;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(220, entry.contentRect.width - 32)));
    observer.observe(el);
    function wheel(event) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect(), next = clamp(zoomRef.current * Math.exp(-event.deltaY * 0.003));
      anchor.current = {ratio:next / zoomRef.current, x:event.clientX - rect.left, y:event.clientY - rect.top, left:el.scrollLeft, top:el.scrollTop};
      zoomRef.current = next; setZoom(next);
    }
    el.addEventListener('wheel', wheel, {passive:false});
    return () => { observer.disconnect(); el.removeEventListener('wheel', wheel); };
  }, []);
  useLayoutEffect(() => {
    if (anchor.current && scroller.current) {
      const a = anchor.current; scroller.current.scrollLeft = (a.left + a.x) * a.ratio - a.x; scroller.current.scrollTop = (a.top + a.y) * a.ratio - a.y; anchor.current = null;
    }
  }, [zoom]);
  return <div className="pdf-viewer">
    <div className="pdf-toolbar" aria-label="Navigation du PDF">
      <button aria-label="Réduire le zoom" onClick={() => setZoom(z => clamp(z / 1.2))}><Minus size={16}/></button>
      <span>{Math.round(zoom * 100)} %</span>
      <button aria-label="Agrandir le zoom" onClick={() => setZoom(z => clamp(z * 1.2))}><Plus size={16}/></button>
      <button aria-label="Ajuster à la largeur" onClick={() => setZoom(1)}><Maximize2 size={16}/></button>
      <span className="pdf-page-count">{pages.length ? `${pages.length} page${pages.length > 1 ? 's' : ''}` : 'Chargement…'}</span>
      <small>Double-clic sur le texte : code</small>
    </div>
    <div className="pdf-scroll" ref={scroller} tabIndex={0} aria-label="Document PDF : défiler et zoomer">
      {error && <p role="alert" className="pdf-error">{error}</p>}
      <div className="pdf-page-stack">{pages.map((page, i) => <PdfPage key={page.pageNumber} page={page} scale={width / page.getViewport({scale:1}).width * zoom} occurrences={counts[i] || {}} onSource={(...args) => callback.current(...args)}/>)}</div>
    </div>
  </div>;
}
