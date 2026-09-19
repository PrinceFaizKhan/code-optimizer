import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language, OptimizationResult } from '@code-optimizer/shared';
import { ApiError, optimizeCode } from '../api/client';

export type OptimizeStatus = 'idle' | 'loading' | 'success' | 'error';

const STATUS_MESSAGES = [
  'Reading your code…',
  'Looking for bugs…',
  'Checking performance…',
  'Writing the optimized version…',
  'Still working — larger files take longer…',
];
const MESSAGE_INTERVAL_SECONDS = 8;
const REQUEST_TIMEOUT_MS = 180_000;

export function useOptimize() {
  const [status, setStatus] = useState<OptimizeStatus>('idle');
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (language: Language, code: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setStatus('loading');
    setError(null);
    setResult(null);
    setElapsedSeconds(0);

    try {
      const optimization = await optimizeCode(language, code, controller.signal);
      setResult(optimization);
      setStatus('success');
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        if (abortRef.current !== controller) return;
        setError('That took too long and was cancelled. Try a smaller piece of code.');
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      }
      setStatus('error');
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
    setResult(null);
    setError(null);
    setElapsedSeconds(0);
  }, []);

  const messageIndex = Math.min(
    Math.floor(elapsedSeconds / MESSAGE_INTERVAL_SECONDS),
    STATUS_MESSAGES.length - 1,
  );

  return {
    status,
    result,
    error,
    elapsedSeconds,
    statusMessage: STATUS_MESSAGES[messageIndex]!,
    run,
    reset,
  };
}
