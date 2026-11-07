import React, { useRef, useState } from 'react';
import { FilePlus2, LayoutTemplate, Presentation, Upload, FileArchive, FileCode2, Check } from 'lucide-react';
import { templates, templateGroups, accents } from './templates.js';
import { formatSize, MAX_ARCHIVE_SIZE } from './project-tools.js';

// The « Nouveau projet » dialog: start blank, from a document template, from a Beamer presentation, or from files.
const sources = [
  { id: 'blank', label: 'Projet vide', hint: 'Juste le préambule', Icon: FilePlus2 },
  { id: 'documents', label: 'Modèle de document', hint: 'Article, rapport, CV…', Icon: LayoutTemplate },
  { id: 'presentations', label: 'Présentation Beamer', hint: 'Diapositives prêtes à projeter', Icon: Presentation },
  { id: 'import', label: 'Importer', hint: '.zip ou fichiers .tex', Icon: Upload },
];
const firstOf = (group) => Object.keys(templates).find((id) => templates[id].group === group && id !== 'blank');

// A small drawing of the first page or slide, in the chosen colour.
export function TemplatePreview({ id, accent, aspect }) {
  const t = templates[id];
  const style = { '--tpl-accent': '#' + accent };
  if (t.beamer)
    return (
      <span className={`tpl-preview tpl-slide tpl-${id} ${aspect === '43' ? 'ratio-43' : ''}`} style={style}>
        <i className="tpl-band" />
        <i className="tpl-title" />
        <i className="tpl-sub" />
        <i className="tpl-rule" />
        <i className="tpl-foot" />
      </span>
    );
  return (
    <span className={`tpl-preview tpl-page tpl-${id}`} style={style}>
      <i className="tpl-title" />
      <i className="tpl-line" />
      <i className="tpl-line" />
      <i className="tpl-line short" />
      <i className="tpl-head" />
      <i className="tpl-line" />
      <i className="tpl-line short" />
    </span>
  );
}

export default function NewProjectDialog({ onClose, onCreate, onImport, initialSource = 'blank' }) {
  const [source, setSource] = useState(initialSource),
    [name, setName] = useState(''),
    [picked, setPicked] = useState({ documents: firstOf('documents'), presentations: firstOf('presentations') }),
    [aspect, setAspect] = useState('169'),
    [accent, setAccent] = useState(accents[0].id),
    [files, setFiles] = useState([]),
    [dragging, setDragging] = useState(false),
    [waiting, setWaiting] = useState(false),
    [error, setError] = useState('');
  const fileRef = useRef();
  const template = source === 'blank' ? 'blank' : picked[source];
  const importing = source === 'import';
  const defaultName = importing ? files[0]?.name.replace(/\.(zip|tex)$/i, '') || '' : '';

  function chooseFiles(list) {
    const chosen = [...list];
    setError('');
    if (chosen.some((f) => /\.zip$/i.test(f.name)) && chosen.length > 1)
      return setError('Choisis une seule archive .zip, ou des fichiers séparés (.tex, .bib, images).');
    setFiles(chosen);
  }
  async function submit(e) {
    e.preventDefault();
    setWaiting(true);
    setError('');
    try {
      if (importing) await onImport(files, name.trim());
      else await onCreate({ name: name.trim(), template, aspect, accent });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setWaiting(false);
    }
  }
  const ready = importing ? files.length > 0 : !!name.trim();

  return (
    <div className="modalBack" onMouseDown={(e) => e.target === e.currentTarget && !waiting && onClose()}>
      <section className="modal new-project-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div className="modalHead">
          <h2 id="create-title">Nouveau projet</h2>
          <button type="button" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="np-sources" role="tablist" aria-label="Point de départ">
            {sources.map(({ id, label, hint, Icon }) => (
              <button
                type="button"
                role="tab"
                key={id}
                aria-selected={source === id}
                className={source === id ? 'on' : ''}
                onClick={() => {
                  setSource(id);
                  setError('');
                }}
              >
                <Icon size={20} />
                <b>{label}</b>
                <small>{hint}</small>
              </button>
            ))}
          </div>

          {(source === 'documents' || source === 'presentations') && (
            <div
              className="np-templates"
              role="radiogroup"
              aria-label={templateGroups.find((g) => g.id === source).label}
            >
              {Object.entries(templates)
                .filter(([id, t]) => t.group === source && id !== 'blank')
                .map(([id, t]) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={template === id}
                    key={id}
                    className={'np-template' + (template === id ? ' on' : '')}
                    onClick={() => setPicked((p) => ({ ...p, [source]: id }))}
                  >
                    <TemplatePreview id={id} accent={accent} aspect={aspect} />
                    <span className="np-template-text">
                      <b>{t.name}</b>
                      <small>{t.description}</small>
                    </span>
                    {template === id && <Check className="np-check" size={16} />}
                  </button>
                ))}
            </div>
          )}

          {source === 'presentations' && (
            <div className="np-options">
              <div>
                <span className="np-label">Format</span>
                <div className="segmented" role="radiogroup" aria-label="Format des diapositives">
                  {[
                    ['169', '16:9 · écran large'],
                    ['43', '4:3 · classique'],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={aspect === value}
                      key={value}
                      className={aspect === value ? 'on' : ''}
                      onClick={() => setAspect(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="np-label">Couleur principale</span>
                <div className="np-swatches" role="radiogroup" aria-label="Couleur principale">
                  {accents.map((a) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={accent === a.id}
                      aria-label={a.label}
                      title={a.label}
                      key={a.id}
                      className={accent === a.id ? 'on' : ''}
                      style={{ '--swatch': '#' + a.id }}
                      onClick={() => setAccent(a.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {source === 'blank' && (
            <div className="np-blank">
              <TemplatePreview id="blank" accent={accent} aspect={aspect} />
              <p>
                Un fichier <code>main.tex</code> avec le préambule de base (français, UTF-8). Idéal si tu sais déjà ce
                que tu veux écrire.
              </p>
            </div>
          )}

          {importing && (
            <label
              className={'np-drop' + (dragging ? ' dragging' : '') + (files.length ? ' filled' : '')}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                chooseFiles(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".zip,.tex,.bib,.sty,.cls,.bst,.txt,.csv,.md,.png,.jpg,.jpeg,.pdf"
                onChange={(e) => {
                  chooseFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              {files.length ? (
                <ul>
                  {files.map((f) => (
                    <li key={f.name}>
                      {/\.zip$/i.test(f.name) ? <FileArchive size={16} /> : <FileCode2 size={16} />}
                      {f.name}
                      <small>{formatSize(f.size)}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <Upload size={26} />
                  <b>Dépose ici une archive .zip ou des fichiers .tex</b>
                </>
              )}
              <small>
                {files.length
                  ? 'Clique pour choisir d’autres fichiers.'
                  : `Export Overleaf ou TeXBea (.zip), ou un .tex avec ses images et sa bibliographie (.bib, .png, .jpg, .pdf). Jusqu’à ${formatSize(MAX_ARCHIVE_SIZE)}.`}
              </small>
            </label>
          )}

          <div className="np-footer">
            <label className="np-name">
              <span className="np-label">Nom du projet{importing ? ' (facultatif)' : ''}</span>
              <input
                autoFocus
                required={!importing}
                maxLength={80}
                placeholder={
                  defaultName ||
                  (source === 'presentations' ? 'Soutenance, réunion d’équipe…' : 'Rapport, mémoire, article…')
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="primary" disabled={waiting || !ready}>
              {waiting ? (importing ? 'Import…' : 'Création…') : importing ? 'Importer le projet' : 'Créer le projet'}
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
