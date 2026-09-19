import type { Severity } from '@code-optimizer/shared';

const STYLES: Record<Severity, string> = {
  low: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  high: 'border-red-500/40 bg-red-500/10 text-red-300',
};

export default function SeverityChip({ severity }: { severity: Severity }) {
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STYLES[severity]}`}>{severity}</span>;
}
