import { useState } from 'react';
import { MAX_CODE_CHARS, type Language } from '@code-optimizer/shared';
import CodeInput from './components/CodeInput';
import ResultsPanel from './components/ResultsPanel';
import ResultActions from './components/ResultActions';
import ErrorBanner from './components/ErrorBanner';
import LanguageSelect from './components/LanguageSelect';
import OptimizeButton from './components/OptimizeButton';
import { LANGUAGE_LABELS } from './lib/languages';
import { useOptimize } from './hooks/useOptimize';

export default function App() {
  const [language, setLanguage] = useState<Language>('typescript');
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState(true);
  const { status, result, error, elapsedSeconds, statusMessage, run, reset } = useOptimize();

  const loading = status === 'loading';
  const emptyCode = code.trim().length === 0;
  const tooLong = code.length > MAX_CODE_CHARS;
  const collapsed = Boolean(result) && !editing;

  function optimize() {
    setEditing(false);
    void run(language, code);
  }

  function startOver() {
    setEditing(true);
    reset();
  }

  return (
    <div className="min-h-full bg-ink">
      <header className="sticky top-0 z-10 border-b border-edge bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <span aria-hidden className="text-xl">⚡</span>
          <h1 className="truncate text-base font-semibold tracking-tight text-slate-100 sm:text-lg">AI Code Optimizer</h1>
          <div className="ml-auto">
            <LanguageSelect value={language} onChange={setLanguage} disabled={loading} />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:py-8">
        {error && <ErrorBanner message={error} onRetry={() => run(language, code)} onDismiss={reset} />}

        {collapsed ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-edge bg-panel px-4 py-3 text-sm">
            <span className="text-muted">{LANGUAGE_LABELS[language]} · {code.length.toLocaleString('en-US')} characters</span>
            <button type="button" onClick={startOver} className="ml-auto rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-accent hover:text-accent">Edit code</button>
          </div>
        ) : (
          <>
            <CodeInput value={code} language={language} onChange={setCode} disabled={loading} />
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-xs text-muted">{emptyCode ? 'Paste some code to get started.' : tooLong ? `That is over the ${MAX_CODE_CHARS.toLocaleString('en-US')} character limit.` : ' '}</p>
              <OptimizeButton loading={loading} disabled={emptyCode || tooLong} elapsedSeconds={elapsedSeconds} statusMessage={statusMessage} onClick={optimize} />
            </div>
          </>
        )}

        {result && <ResultsPanel result={result} original={code} language={language} actions={<ResultActions code={result.optimized_code} language={language} />} />}
      </main>
    </div>
  );
}
