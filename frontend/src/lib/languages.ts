import type { Language } from '@code-optimizer/shared';

export const LANGUAGE_LABELS: Record<Language, string> = {
  php: 'PHP',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  sql: 'SQL',
  blade: 'Laravel Blade',
};

export const FILE_EXTENSIONS: Record<Language, string> = {
  php: 'php',
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  sql: 'sql',
  blade: 'blade.php',
};

export function downloadFileName(language: Language): string {
  return `optimized.${FILE_EXTENSIONS[language]}`;
}
