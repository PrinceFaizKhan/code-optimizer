import type { Issue } from '@code-optimizer/shared';
import SeverityChip from './SeverityChip';

export default function IssueCard({ issue }: { issue: Issue }) {
  return <li className="rounded-lg border border-edge bg-ink/40 p-3"><div className="flex flex-wrap items-center gap-2"><SeverityChip severity={issue.severity} /><h4 className="text-sm font-semibold text-slate-100">{issue.title}</h4><span className="ml-auto text-xs text-muted">line {issue.line_reference}</span></div><p className="mt-1.5 text-sm text-slate-300">{issue.description}</p></li>;
}
