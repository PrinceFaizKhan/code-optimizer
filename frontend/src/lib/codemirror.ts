import { javascript } from '@codemirror/lang-javascript';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import type { Extension } from '@codemirror/state';
import type { Language } from '@code-optimizer/shared';

export function codeMirrorLanguage(language: Language, code: string): Extension {
  switch (language) {
    case 'javascript':
      return javascript();
    case 'typescript':
      return javascript({ typescript: true });
    case 'python':
      return python();
    case 'sql':
      return sql();
    case 'blade':
      return php();
    case 'php':
      return php({ plain: !code.includes('<?') });
  }
}
