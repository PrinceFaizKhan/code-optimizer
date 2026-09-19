import { useState } from 'react';
import { MAX_CODE_CHARS, type Language } from '@code-optimizer/shared';
import CodeInput from './components/CodeInput';
import ErrorBanner from './components/ErrorBanner';
import LanguageSelect from './components/LanguageSelect';
import OptimizeButton from './components/OptimizeButton';
import { useOptimize } from './hooks/useOptimize';

export default function App() {
  const [language, setLanguage] = useState<Language>('typescript');
  const [code, setCode] = useState('');
  const { status, result, error, elapsedSeconds, statusMessage, run, reset } = useOptimize();

  const loading = status === 'loading';
  const emptyCode = code.trim().length === 0;
  const tooLong = code.length > MAX_CODE_CHARS;

  return (
    <div className="min-h-full bg-ink">
      <header className="border-b border-edge bg-panel/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <span aria-hidden className="text-xl">⚡</span>
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">AI Code Optimizer</h1>
          <div className="ml-auto">
            <LanguageSelect value={language} onChange={setLanguage} disabled={loading} />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8">
        {error && <ErrorBanner message={error} onRetry={() => run(language, code)} onDismiss={reset} />}

        <CodeInput value={code} language={language} onChange={setCode} disabled={loading} />

        <div className="flex items-start justify-between gap-4">
          <p className="text-xs text-muted">
            {emptyCode
              ? 'Paste some code to get started.'
              : tooLong
                ? `That is over the ${MAX_CODE_CHARS.toLocaleString('en-US')} character limit.`
                : ' '}
          </p>
          <OptimizeButton
            loading={loading}
            disabled={emptyCode || tooLong}
            elapsedSeconds={elapsedSeconds}
            statusMessage={statusMessage}
            onClick={() => run(language, code)}
          />
        </div>

        {result && <pre className="overflow-auto rounded-lg border border-edge bg-panel p-4 text-xs text-slate-300">{JSON.stringify(result, null, 2)}</pre>}
      </main>
    </div>
  );
}
