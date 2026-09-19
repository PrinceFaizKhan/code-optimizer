import { describe, it, expect } from 'vitest';
import { LANGUAGES } from '@code-optimizer/shared';
import { FILE_EXTENSIONS, LANGUAGE_LABELS, downloadFileName } from './languages';

describe('language metadata', () => {
  it('has a label for every supported language', () => {
    for (const language of LANGUAGES) {
      expect(LANGUAGE_LABELS[language]).toBeTruthy();
    }
  });

  it('has an extension for every supported language', () => {
    for (const language of LANGUAGES) {
      expect(FILE_EXTENSIONS[language]).toBeTruthy();
    }
  });

  it('uses the documented download names', () => {
    expect(downloadFileName('php')).toBe('optimized.php');
    expect(downloadFileName('javascript')).toBe('optimized.js');
    expect(downloadFileName('typescript')).toBe('optimized.ts');
    expect(downloadFileName('python')).toBe('optimized.py');
    expect(downloadFileName('sql')).toBe('optimized.sql');
    expect(downloadFileName('blade')).toBe('optimized.blade.php');
  });
});
