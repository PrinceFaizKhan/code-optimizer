import { LANGUAGES, type Language } from '@code-optimizer/shared';
import { LANGUAGE_LABELS } from '../lib/languages';

interface LanguageSelectProps {
  value: Language;
  onChange: (language: Language) => void;
  disabled?: boolean;
}

export default function LanguageSelect({ value, onChange, disabled }: LanguageSelectProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="sr-only sm:not-sr-only">Language</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as Language)}
        className="rounded-md border border-edge bg-panel px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-accent disabled:opacity-50"
      >
        {LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {LANGUAGE_LABELS[language]}
          </option>
        ))}
      </select>
    </label>
  );
}
