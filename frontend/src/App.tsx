import { useState } from 'react';
import type { Language } from '@code-optimizer/shared';
import CodeInput from './components/CodeInput';
import LanguageSelect from './components/LanguageSelect';

export default function App() {
  const [language, setLanguage] = useState<Language>('typescript');
  const [code, setCode] = useState('');

  return (
    <div className="min-h-full bg-ink">
      <header className="border-b border-edge bg-panel/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <span aria-hidden className="text-xl">⚡</span>
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">AI Code Optimizer</h1>
          <div className="ml-auto">
            <LanguageSelect value={language} onChange={setLanguage} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <CodeInput value={code} language={language} onChange={setCode} />
      </main>
    </div>
  );
}
