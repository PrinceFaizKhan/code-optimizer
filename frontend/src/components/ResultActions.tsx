import { useEffect, useState } from 'react';
import type { Language } from '@code-optimizer/shared';
import { downloadFileName } from '../lib/languages';

interface ResultActionsProps { code: string; language: Language; }

export default function ResultActions({ code, language }: ResultActionsProps) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  useEffect(() => {
    if (copied === 'idle') return;
    const timer = setTimeout(() => setCopied('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied('done'); } catch { setCopied('failed'); }
  }
  function download() {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadFileName(language);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const buttonClass = 'rounded-md border border-edge bg-ink px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-accent hover:text-accent';
  return <div className="flex items-center gap-2">
    <button type="button" onClick={copy} className={buttonClass}>{copied === 'done' ? '✓ Copied' : copied === 'failed' ? 'Copy failed' : 'Copy'}</button>
    <button type="button" onClick={download} className={buttonClass}>Download</button>
    <span aria-live="polite" className="sr-only">{copied === 'done' ? 'Optimized code copied to clipboard' : ''}</span>
  </div>;
}
