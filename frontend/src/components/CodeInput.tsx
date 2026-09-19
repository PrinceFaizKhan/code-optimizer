import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { MAX_CODE_CHARS, type Language } from '@code-optimizer/shared';
import { codeMirrorLanguage } from '../lib/codemirror';

interface CodeInputProps {
  value: string;
  language: Language;
  onChange: (code: string) => void;
  disabled?: boolean;
}

export default function CodeInput({ value, language, onChange, disabled }: CodeInputProps) {
  const hasOpenTag = value.includes('<?');
  const extensions = useMemo(
    () => [codeMirrorLanguage(language, hasOpenTag ? '<?php' : '')],
    [language, hasOpenTag],
  );

  const overLimit = value.length > MAX_CODE_CHARS;
  const nearLimit = !overLimit && value.length > MAX_CODE_CHARS * 0.9;

  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-panel">
      <CodeMirror
        value={value}
        height="360px"
        theme={oneDark}
        extensions={extensions}
        editable={!disabled}
        onChange={onChange}
        placeholder="Paste your code here…"
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: !disabled }}
      />
      <div className="flex items-center justify-between border-t border-edge px-3 py-2 text-xs">
        <span className={overLimit ? 'text-red-400' : nearLimit ? 'text-amber-400' : 'text-muted'}>
          {value.length.toLocaleString('en-US')} / {MAX_CODE_CHARS.toLocaleString('en-US')} characters
        </span>
      </div>
    </div>
  );
}
