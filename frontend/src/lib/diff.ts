import { diffLines } from 'diff';

export interface DiffMarks {
  /** 1-based line numbers in the original that were removed or changed. */
  removedLines: number[];
  /** 1-based line numbers in the optimized text that were added or changed. */
  addedLines: number[];
}

export function computeDiffMarks(original: string, optimized: string): DiffMarks {
  const removedLines: number[] = [];
  const addedLines: number[] = [];

  let originalLine = 1;
  let optimizedLine = 1;

  for (const part of diffLines(original, optimized)) {
    const lineCount = part.count ?? 0;
    if (lineCount === 0) continue;

    if (part.added) {
      for (let offset = 0; offset < lineCount; offset += 1) addedLines.push(optimizedLine + offset);
      optimizedLine += lineCount;
    } else if (part.removed) {
      for (let offset = 0; offset < lineCount; offset += 1) removedLines.push(originalLine + offset);
      originalLine += lineCount;
    } else {
      originalLine += lineCount;
      optimizedLine += lineCount;
    }
  }

  return { removedLines, addedLines };
}
