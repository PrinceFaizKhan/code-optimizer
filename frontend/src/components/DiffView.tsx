import { useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import type { Language } from '@code-optimizer/shared';
import { codeMirrorLanguage } from '../lib/codemirror';
import { computeDiffMarks } from '../lib/diff';
import { diffLineDecorations } from '../lib/diffDecorations';

interface DiffViewProps {
  original: string;
  optimized: string;
  language: Language;
}

export default function DiffView({ original, optimized, language }: DiffViewProps) {
  const [mobilePane, setMobilePane] = useState<'original' | 'optimized'>('optimized');
  const leftView = useRef<EditorView | null>(null);
  const rightView = useRef<EditorView | null>(null);
  const syncing = useRef(false);

  const marks = useMemo(() => computeDiffMarks(original, optimized), [original, optimized]);
  const leftExtensions = useMemo(
    () => [codeMirrorLanguage(language, original), diffLineDecorations(marks.removedLines, 'cm-diff-removed'), EditorView.editable.of(false)],
    [language, original, marks.removedLines],
  );
  const rightExtensions = useMemo(
    () => [codeMirrorLanguage(language, optimized), diffLineDecorations(marks.addedLines, 'cm-diff-added'), EditorView.editable.of(false)],
    [language, optimized, marks.addedLines],
  );

  function link(source: EditorView | null, target: EditorView | null) {
    if (!source || !target) return;
    source.scrollDOM.addEventListener('scroll', () => {
      if (syncing.current) return;
      syncing.current = true;
      target.scrollDOM.scrollTop = source.scrollDOM.scrollTop;
      requestAnimationFrame(() => {
        syncing.current = false;
      });
    });
  }

  const pane = (side: 'original' | 'optimized') => {
    const isLeft = side === 'original';
    return (
      <div className={`min-w-0 flex-1 ${isLeft ? 'md:border-r md:border-edge' : ''} ${mobilePane === side ? '' : 'hidden md:block'}`}>
        <div className="hidden border-b border-edge px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted md:block">
          {isLeft ? 'Original' : 'Optimized'}
        </div>
        <CodeMirror
          value={isLeft ? original : optimized}
          height="480px"
          theme={oneDark}
          editable={false}
          extensions={isLeft ? leftExtensions : rightExtensions}
          basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
          onCreateEditor={(view) => {
            if (isLeft) {
              leftView.current = view;
              link(view, rightView.current);
              link(rightView.current, view);
            } else {
              rightView.current = view;
              link(view, leftView.current);
              link(leftView.current, view);
            }
          }}
        />
      </div>
    );
  };

  return (
    <section className="overflow-hidden rounded-lg border border-edge bg-panel">
      <div className="flex border-b border-edge md:hidden" role="tablist">
        {(['original', 'optimized'] as const).map((side) => (
          <button
            key={side}
            type="button"
            role="tab"
            aria-selected={mobilePane === side}
            onClick={() => setMobilePane(side)}
            className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide ${mobilePane === side ? 'bg-edge text-slate-100' : 'text-muted'}`}
          >
            {side}
          </button>
        ))}
      </div>
      <div className="flex flex-col md:flex-row">
        {pane('original')}
        {pane('optimized')}
      </div>
    </section>
  );
}
