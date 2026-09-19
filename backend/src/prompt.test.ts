import { describe, it, expect } from 'vitest';
import { LANGUAGES } from '@code-optimizer/shared';
import { buildSystemPrompt, buildUserMessage } from './prompt';

describe('buildSystemPrompt', () => {
  it('states the language in a human-readable form', () => {
    expect(buildSystemPrompt('typescript')).toContain('TypeScript');
    expect(buildSystemPrompt('blade')).toContain('Laravel Blade');
  });

  it('includes the non-negotiable review rules for every language', () => {
    for (const language of LANGUAGES) {
      const prompt = buildSystemPrompt(language);
      expect(prompt).toContain('Preserve the original functionality');
      expect(prompt).toContain('Do not invent missing business logic');
      expect(prompt).toContain('Do not remove security validation');
      expect(prompt).toContain('no_optimization_needed');
    }
  });

  it('adds the Blade directive warning only for Blade', () => {
    expect(buildSystemPrompt('blade')).toContain('@directives');
    expect(buildSystemPrompt('php')).not.toContain('@directives');
    expect(buildSystemPrompt('javascript')).not.toContain('@directives');
  });

  it('tells the model that line references point at the original code', () => {
    expect(buildSystemPrompt('python')).toContain('ORIGINAL');
  });
});

describe('buildUserMessage', () => {
  it('fences the code with the language tag', () => {
    const message = buildUserMessage('sql', 'SELECT 1;');
    expect(message).toContain('```sql\nSELECT 1;\n```');
  });

  it('does not alter the code', () => {
    const code = 'def f():\n    return  1  # spacing preserved\n';
    expect(buildUserMessage('python', code)).toContain(code);
  });
});
