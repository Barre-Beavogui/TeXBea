import { prepareImage } from './image-input.js';

// Reads a file attached in Bea's chat: text formats, PDF (text layer), Word .docx, or an image for the vision model.
export const acceptedFiles = '.tex,.txt,.md,.bib,.csv,.sty,.cls,.json,.pdf,.docx,image/*';
const MAX_TEXT = 60000;

export async function readAttachment(file) {
  if (file.size > 25_000_000) throw Error(`${file.name} : fichier trop lourd (25 Mo maximum).`);
  const name = file.name || 'image collée';
  if (file.type.startsWith('image/')) {
    const [image, thumb] = await Promise.all([prepareImage(file), prepareImage(file, 240)]);
    return { name, kind: 'image', image, thumb };
  }
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return { name, kind: 'pdf', text: (await pdfText(file)).slice(0, MAX_TEXT) };
  if (lower.endsWith('.docx')) return { name, kind: 'docx', text: (await docxText(file)).slice(0, MAX_TEXT) };
  if (/\.(tex|txt|md|bib|csv|sty|cls|json)$/.test(lower))
    return { name, kind: 'text', text: (await file.text()).slice(0, MAX_TEXT) };
  throw Error(`${name} : format non pris en charge (images, PDF, Word .docx, .tex, .txt, .md, .bib, .csv).`);
}

async function pdfText(file) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!GlobalWorkerOptions.workerSrc)
    GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 40); n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(content.items.map((i) => i.str + (i.hasEOL ? '\n' : ' ')).join(''));
  }
  const text = pages.join('\n\n').trim();
  if (!text)
    throw Error(`${file.name} : ce PDF ne contient pas de texte (scan ?). Envoie plutôt une photo de la page.`);
  return text;
}

// Text of a Word document: paragraphs of word/document.xml.
export async function docxText(file) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw Error(`${file.name} : document Word illisible.`);
  return docxXmlToText(xml);
}

export function docxXmlToText(xml) {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
