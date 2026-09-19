import { describe, it, expect } from 'vitest';
import {
  LANGUAGES,
  LanguageSchema,
  OptimizationResultSchema,
  MAX_CODE_CHARS,
} from './schema';

const sampleBug = {
  title: 'Null deref',
  severity: 'high',
  description: '`a` may be null.',
} as const;

const valid = {
  optimized_code: 'const x = 1;',
  quality_score: 72,
  no_optimization_needed: false,
  summary: 'Tightened the loop.',
  issues_found: [
    {
      title: 'Unused variable',
      severity: 'low',
      description: '`y` is never read.',
      line_reference: '4',
    },
  ],
  performance_improvements: [
    { title: 'Fewer allocations', description: 'Reuses the array.', impact: 'Moderate' },
  ],
  potential_bugs: [sampleBug],
  explanation_of_changes: [
    { change: 'Replaced the for loop with map.', why: 'Shorter and avoids an index bug.' },
  ],
};

describe('OptimizationResultSchema', () => {
  it('accepts a fully populated result', () => {
    expect(OptimizationResultSchema.parse(valid)).toEqual(valid);
  });

  it('accepts empty arrays for every list field', () => {
    const clean = {
      ...valid,
      no_optimization_needed: true,
      issues_found: [],
      performance_improvements: [],
      potential_bugs: [],
      explanation_of_changes: [],
    };
    expect(OptimizationResultSchema.parse(clean)).toEqual(clean);
  });

  it('rejects a missing field', () => {
    const { summary, ...withoutSummary } = valid;
    expect(OptimizationResultSchema.safeParse(withoutSummary).success).toBe(false);
  });

  it('rejects a quality_score above 100', () => {
    expect(OptimizationResultSchema.safeParse({ ...valid, quality_score: 101 }).success).toBe(false);
  });

  it('rejects a quality_score below 0', () => {
    expect(OptimizationResultSchema.safeParse({ ...valid, quality_score: -1 }).success).toBe(false);
  });

  it('rejects a fractional quality_score', () => {
    expect(OptimizationResultSchema.safeParse({ ...valid, quality_score: 72.5 }).success).toBe(false);
  });

  it('rejects an unknown severity', () => {
    const bad = { ...valid, potential_bugs: [{ ...sampleBug, severity: 'critical' }] };
    expect(OptimizationResultSchema.safeParse(bad).success).toBe(false);
  });
});

describe('LanguageSchema', () => {
  it('accepts all six supported languages', () => {
    for (const language of LANGUAGES) {
      expect(LanguageSchema.parse(language)).toBe(language);
    }
  });

  it('rejects an unsupported language', () => {
    expect(LanguageSchema.safeParse('ruby').success).toBe(false);
  });
});

describe('MAX_CODE_CHARS', () => {
  it('is 60000', () => {
    expect(MAX_CODE_CHARS).toBe(60_000);
  });
});
