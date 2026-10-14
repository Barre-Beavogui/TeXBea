import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState, Compartment, EditorSelection } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view';
import {
  StreamLanguage,
  HighlightStyle,
  syntaxHighlighting,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  foldService,
} from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from '@codemirror/search';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  snippetCompletion,
  snippet,
} from '@codemirror/autocomplete';
import { setDiagnostics, lintGutter } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
// Vim and Emacs bindings are downloaded only when chosen in the settings.
const keymapLoaders = {
  vim: () => import('@replit/codemirror-vim').then((m) => m.vim()),
  emacs: () => import('@replit/codemirror-emacs').then((m) => m.emacs()),
};
const loadedKeymaps = {};
import {
  commands,
  environments,
  packages,
  latexContext,
  openEnvironment,
  projectSymbols,
} from './latex-completions.js';

const latex = StreamLanguage.define(stex);

const darkColors = {
  command: '#ffb58b',
  comment: '#8b9cae',
  math: '#cebbf2',
  delimiter: '#e9d097',
  bracket: '#91d1df',
};
const lightColors = {
  command: '#a6461c',
  comment: '#6b7a89',
  math: '#6a3fb5',
  delimiter: '#8a6a00',
  bracket: '#0f6f86',
};
const highlight = (c) =>
  HighlightStyle.define([
    { tag: tags.tagName, color: c.command },
    { tag: tags.comment, color: c.comment, fontStyle: 'italic' },
    { tag: tags.keyword, color: c.delimiter },
    { tag: tags.number, color: c.delimiter },
    { tag: [tags.special(tags.variableName), tags.invalid], color: c.math },
    { tag: [tags.bracket, tags.atom], color: c.bracket },
  ]);

function theme(settings) {
  const dark = settings.theme !== 'light';
  return [
    EditorView.theme(
      {
        '&': {
          height: '100%',
          fontSize: settings.fontSize + 'px',
          backgroundColor: dark ? '#132235' : '#fbfcfe',
          color: dark ? '#d1ddea' : '#1d2a38',
        },
        '.cm-scroller': { fontFamily: "'JetBrains Mono', ui-monospace, monospace", lineHeight: '1.65' },
        '.cm-content': { caretColor: dark ? '#ffc59e' : '#a6461c', padding: '10px 0' },
        '.cm-cursor': { borderLeftColor: dark ? '#ffc59e' : '#a6461c' },
        '.cm-gutters': {
          backgroundColor: dark ? '#132235' : '#f0f4f8',
          color: dark ? '#6a829c' : '#8193a6',
          border: 'none',
        },
        '.cm-activeLine': { backgroundColor: dark ? '#1b2e44' : '#eef3f9' },
        '.cm-activeLineGutter': { backgroundColor: dark ? '#1b2e44' : '#e3eaf2', color: dark ? '#c6d4e3' : '#33475b' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
          backgroundColor: dark ? '#7d543e !important' : '#f3c9ae !important',
        },
        '.cm-matchingBracket': { backgroundColor: dark ? '#2f4c68' : '#cfe3f2', outline: 'none' },
        '.cm-tooltip': {
          backgroundColor: dark ? '#1d3147' : '#ffffff',
          color: dark ? '#e3ebf3' : '#1d2a38',
          border: '1px solid ' + (dark ? '#31475f' : '#c8d3df'),
        },
        '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#db7544', color: '#fff' },
        '.cm-completionDetail': { opacity: 0.7, marginLeft: '1em', fontStyle: 'normal' },
        '.cm-panels': { backgroundColor: dark ? '#1d3147' : '#f0f4f8', color: 'inherit' },
        '.cm-panels input, .cm-panels button': { fontSize: '13px' },
        '.cm-searchMatch': { backgroundColor: '#e9d09755' },
        '.cm-searchMatch-selected': { backgroundColor: '#db754488' },
        '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: '#db7544' },
        '.cm-jump-highlight': { backgroundColor: '#db754444' },
      },
      { dark },
    ),
    syntaxHighlighting(highlight(dark ? darkColors : lightColors)),
  ];
}

// Fold \begin{x}…\end{x} blocks and sections, like Overleaf's gutter arrows.
const latexFolding = foldService.of((state, lineStart, lineEnd) => {
  const line = state.doc.sliceString(lineStart, lineEnd);
  const begin = line.match(/\\begin\{([^}]+)\}/);
  if (begin && !line.includes('\\end{' + begin[1] + '}')) {
    let depth = 0;
    for (let n = state.doc.lineAt(lineStart).number + 1; n <= state.doc.lines; n++) {
      const text = state.doc.line(n).text;
      if (text.includes('\\begin{' + begin[1] + '}')) depth++;
      if (text.includes('\\end{' + begin[1] + '}')) {
        if (depth === 0)
          return n - 1 > state.doc.lineAt(lineStart).number ? { from: lineEnd, to: state.doc.line(n - 1).to } : null;
        depth--;
      }
    }
    return null;
  }
  const levels = ['part', 'chapter', 'section', 'subsection', 'subsubsection'];
  const heading = line.match(/^\s*\\(part|chapter|section|subsection|subsubsection)\*?[[{]/);
  if (heading) {
    const level = levels.indexOf(heading[1]);
    let last = state.doc.lineAt(lineStart).number;
    for (let n = last + 1; n <= state.doc.lines; n++) {
      const text = state.doc.line(n).text;
      const next = text.match(/^\s*\\(part|chapter|section|subsection|subsubsection)\*?[[{]/);
      if ((next && levels.indexOf(next[1]) <= level) || /\\end\{document\}|\\bibliography\{|\\appendix/.test(text))
        break;
      last = n;
    }
    while (last > state.doc.lineAt(lineStart).number && !state.doc.line(last).text.trim()) last--;
    if (last > state.doc.lineAt(lineStart).number) return { from: lineEnd, to: state.doc.line(last).to };
  }
  return null;
});

function completionSource(getProject) {
  return (context) => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const found = latexContext(before);
    if (!found) return null;
    if (found.kind === 'command' && !found.prefix && !context.explicit && !before.endsWith('\\')) return null;
    const { files, assets } = getProject();
    const symbols = projectSymbols(files, assets);
    const from = context.pos - found.prefix.length;
    const plain = (list, type, detail) => ({
      from,
      options: list.map((label) => ({ label, type, detail })),
      validFor: /^[^}\s,]*$/,
    });
    switch (found.kind) {
      case 'label':
        return plain(symbols.labels, 'variable', 'étiquette');
      case 'citation':
        return plain(symbols.citations, 'text', 'référence');
      case 'texFile':
        return plain(symbols.texFiles, 'namespace', 'fichier');
      case 'image':
        return plain(symbols.images, 'namespace', 'image');
      case 'bibFile':
        return plain(symbols.bibFiles, 'namespace', 'bibliographie');
      case 'package':
        return plain(packages, 'keyword', 'paquet');
      case 'end': {
        const open = openEnvironment(context.state.doc.sliceString(0, context.pos));
        const names = [...new Set([open, ...environments.map((e) => e.name)].filter(Boolean))];
        return {
          from,
          options: names.map((name, i) => ({ label: name, type: 'type', boost: name === open ? 99 : -i })),
          validFor: /^[a-zA-Z*]*$/,
        };
      }
      case 'begin': {
        // Replace "\begin{pre" by a complete environment with its \end.
        const start = from - '\\begin{'.length;
        return {
          from,
          options: environments.map((env) => ({
            label: env.name,
            type: 'type',
            detail: 'environnement',
            apply: (view, completion, _from, to) => {
              const close = view.state.sliceDoc(to, to + 1) === '}' ? 1 : 0;
              snippet(`\\begin{${env.name}}${env.args}\n\t${env.body}\n\\end{${env.name}}`)(
                view,
                completion,
                start,
                to + close,
              );
            },
          })),
          validFor: /^[a-zA-Z*]*$/,
        };
      }
      default: {
        const start = from - 1;
        const builtIn = commands.map((c) =>
          snippetCompletion(c.snippet, { label: '\\' + c.name, detail: c.detail, type: 'function' }),
        );
        const user = symbols.userCommands.map((name) => ({ label: '\\' + name, type: 'function', detail: 'projet' }));
        const begin = snippetCompletion('\\begin{${environnement}}\n\t${}\n\\end{${environnement}}', {
          label: '\\begin',
          detail: 'environnement',
          type: 'keyword',
        });
        return { from: start, options: [...builtIn, ...user, begin], validFor: /^\\[a-zA-Z@]*\*?$/ };
      }
    }
  };
}

function wrapWith(view, before, after) {
  view.dispatch(
    view.state.changeByRange((range) => {
      const text = view.state.sliceDoc(range.from, range.to);
      if (text.startsWith(before) && text.endsWith(after) && text.length >= before.length + after.length)
        return {
          changes: { from: range.from, to: range.to, insert: text.slice(before.length, text.length - after.length) },
          range: EditorSelection.range(range.from, range.to - before.length - after.length),
        };
      return {
        changes: [
          { from: range.from, insert: before },
          { from: range.to, insert: after },
        ],
        range: EditorSelection.range(range.from + before.length, range.to + before.length),
      };
    }),
  );
  view.focus();
  return true;
}

const CodeEditor = forwardRef(function CodeEditor(
  { value, docKey, onChange, settings, getProject, diagnostics, jump, actions, onCursor },
  ref,
) {
  const host = useRef(),
    view = useRef(),
    callbacks = useRef({});
  callbacks.current = { onChange, getProject, actions, onCursor, keymap: settings.keymap };
  const compartments = useRef({
    theme: new Compartment(),
    keys: new Compartment(),
    wrap: new Compartment(),
    complete: new Compartment(),
    brackets: new Compartment(),
    spell: new Compartment(),
  }).current;

  function dynamic(s) {
    return {
      theme: theme(s),
      keys: loadedKeymaps[s.keymap] || [],
      wrap: s.lineWrapping ? EditorView.lineWrapping : [],
      complete: s.autocomplete
        ? autocompletion({ override: [completionSource(() => callbacks.current.getProject())], icons: false })
        : [],
      brackets: s.closeBrackets ? closeBrackets() : [],
      spell: EditorView.contentAttributes.of(
        s.spellcheck && s.spellcheck !== 'off'
          ? { spellcheck: 'true', lang: s.spellcheck, autocorrect: 'off', autocapitalize: 'off' }
          : { spellcheck: 'false' },
      ),
    };
  }

  function createState(doc) {
    const d = dynamic(settings);
    const run = (name) => () => {
      callbacks.current.actions?.[name]?.();
      return true;
    };
    return EditorState.create({
      doc,
      extensions: [
        compartments.keys.of(d.keys),
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter(),
        lintGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        indentUnit.of('  '),
        latex,
        latexFolding,
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        compartments.theme.of(d.theme),
        compartments.wrap.of(d.wrap),
        compartments.complete.of(d.complete),
        compartments.brackets.of(d.brackets),
        compartments.spell.of(d.spell),
        EditorView.contentAttributes.of({ 'aria-label': 'Code LaTeX' }),
        keymap.of([
          { key: 'Mod-s', run: run('save'), preventDefault: true },
          { key: 'Mod-Enter', run: run('compile'), preventDefault: true },
          { key: 'Mod-Shift-f', run: run('projectSearch'), preventDefault: true },
          { key: 'Mod-b', run: (v) => wrapWith(v, '\\textbf{', '}') },
          { key: 'Mod-i', run: (v) => wrapWith(v, '\\textit{', '}') },
          { key: 'Mod-/', run: toggleComment },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            callbacks.current.onCursor?.({ line: line.number, column: head - line.from + 1 });
          }
        }),
      ],
    });
  }

  useEffect(() => {
    view.current = new EditorView({ state: createState(value), parent: host.current });
    return () => view.current.destroy();
  }, []);

  // A new file or project starts a fresh undo history.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.setState(createState(value));
  }, [docKey]);

  // External edits (restore, AI suggestion, replace all) keep the history so they can be undone.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const d = dynamic(settings);
    view.current?.dispatch({
      effects: Object.keys(compartments).map((k) => compartments[k].reconfigure(d[k])),
    });
    const name = settings.keymap;
    if (keymapLoaders[name] && !loadedKeymaps[name])
      keymapLoaders[name]().then((extension) => {
        loadedKeymaps[name] = extension;
        if (callbacks.current.keymap === name)
          view.current?.dispatch({ effects: compartments.keys.reconfigure(extension) });
      });
  }, [settings]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const length = v.state.doc.length;
    v.dispatch(
      setDiagnostics(
        v.state,
        (diagnostics || [])
          .filter((d) => d.line && d.line <= v.state.doc.lines)
          .map((d) => {
            const line = v.state.doc.line(d.line);
            return {
              from: Math.min(line.from, length),
              to: Math.min(line.to, length),
              severity: d.level === 'error' ? 'error' : d.level === 'warning' ? 'warning' : 'info',
              message: d.message,
            };
          }),
      ),
    );
  }, [diagnostics, docKey]);

  useEffect(() => {
    const v = view.current;
    if (!jump || !v) return;
    const length = v.state.doc.length;
    const anchor = Math.min(jump.start ?? 0, length),
      head = Math.min(jump.end ?? anchor, length);
    requestAnimationFrame(() => {
      v.dispatch({
        selection: EditorSelection.range(anchor, head),
        effects: EditorView.scrollIntoView(anchor, { y: 'center' }),
      });
      v.focus();
    });
  }, [jump]);

  useImperativeHandle(ref, () => ({
    focus: () => view.current.focus(),
    selection: () => {
      const { from, to } = view.current.state.selection.main;
      return { start: from, end: to };
    },
    // Text of the line holding the cursor, used to find the matching place in the PDF.
    cursorLine: () => {
      const s = view.current.state;
      return s.doc.lineAt(s.selection.main.head).text;
    },
    wrap: (before, after) => wrapWith(view.current, before, after),
    insert: (template) => {
      const v = view.current;
      const { from, to } = v.state.selection.main;
      // Environments start on their own line.
      if (template.startsWith('\\begin{')) {
        const line = v.state.doc.lineAt(from);
        if (v.state.sliceDoc(line.from, from).trim()) template = '\n' + template;
      }
      if (template.includes('${')) snippet(template)(v, null, from, to);
      else v.dispatch({ changes: { from, to, insert: template }, selection: { anchor: from + template.length } });
      v.focus();
    },
    toggleComment: () => toggleComment(view.current),
    openSearch: () => openSearchPanel(view.current),
  }));

  return <div className="cm-host" ref={host} />;
});

export default CodeEditor;
