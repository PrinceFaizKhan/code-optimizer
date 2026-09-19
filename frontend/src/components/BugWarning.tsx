import type { Bug } from '@code-optimizer/shared';
import SeverityChip from './SeverityChip';

export default function BugWarning({ bug }: { bug: Bug }) {
  return <li className="rounded-lg border border-red-500/30 bg-red-500/[0.07] p-3"><div className="flex flex-wrap items-center gap-2"><span aria-hidden>⚠</span><SeverityChip severity={bug.severity} /><h4 className="text-sm font-semibold text-slate-100">{bug.title}</h4></div><p className="mt-1.5 text-sm text-slate-300">{bug.description}</p></li>;
}
