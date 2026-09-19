import { describe, it, expect } from 'vitest';
import { computeDiffMarks } from './diff';

describe('computeDiffMarks', () => {
  it('marks nothing when the texts are identical', () => {
    const text = 'a\nb\nc';
    expect(computeDiffMarks(text, text)).toEqual({ removedLines: [], addedLines: [] });
  });

  it('marks a changed line on both sides', () => {
    expect(computeDiffMarks('a\nb\nc', 'a\nB\nc')).toEqual({ removedLines: [2], addedLines: [2] });
  });

  it('marks a pure insertion on the right only', () => {
    expect(computeDiffMarks('a\nc', 'a\nb\nc')).toEqual({ removedLines: [], addedLines: [2] });
  });

  it('marks a pure deletion on the left only', () => {
    expect(computeDiffMarks('a\nb\nc', 'a\nc')).toEqual({ removedLines: [2], addedLines: [] });
  });

  it('keeps the two sides independently numbered when lengths differ', () => {
    const marks = computeDiffMarks('a\nb\nc\nd', 'a\nX\nY\nZ\nc\nd');
    expect(marks.removedLines).toEqual([2]);
    expect(marks.addedLines).toEqual([2, 3, 4]);
  });

  it('marks everything when the whole text is replaced', () => {
    expect(computeDiffMarks('a\nb', 'x\ny\nz')).toEqual({
      removedLines: [1, 2],
      addedLines: [1, 2, 3],
    });
  });

  it('handles an empty original', () => {
    expect(computeDiffMarks('', 'a\nb')).toEqual({ removedLines: [], addedLines: [1, 2] });
  });

  it('returns ascending line numbers', () => {
    const marks = computeDiffMarks('a\nb\nc\nd\ne', 'a\nB\nc\nD\ne');
    expect(marks.removedLines).toEqual([...marks.removedLines].sort((x, y) => x - y));
    expect(marks.addedLines).toEqual([...marks.addedLines].sort((x, y) => x - y));
  });
});
