import type { ReactNode } from 'react';
import type { Language, OptimizationResult, Severity } from '@code-optimizer/shared';
import BugWarning from './BugWarning';
import ChangeList from './ChangeList';
import DiffView from './DiffView';
import IssueCard from './IssueCard';
import QualityScore from './QualityScore';

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
interface ResultsPanelProps { result: OptimizationResult; original: string; language: Language; actions: ReactNode; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-lg border border-edge bg-panel p-4"><h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>{children}</section>; }

export default function ResultsPanel({ result, original, language, actions }: ResultsPanelProps) {
  const issues = [...result.issues_found].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const bugs = [...result.potential_bugs].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-4 rounded-lg border border-edge bg-panel p-4 lg:flex-row lg:items-center lg:justify-between"><QualityScore score={result.quality_score} summary={result.summary} noOptimizationNeeded={result.no_optimization_needed} issueCount={result.issues_found.length} improvementCount={result.performance_improvements.length} bugCount={result.potential_bugs.length} /><div className="shrink-0">{actions}</div></div>
    <DiffView original={original} optimized={result.optimized_code} language={language} />
    {bugs.length > 0 && <Section title="⚠ Potential bugs"><ul className="flex flex-col gap-2">{bugs.map((bug, index) => <BugWarning key={index} bug={bug} />)}</ul></Section>}
    {issues.length > 0 && <Section title="Issues found"><ul className="flex flex-col gap-2">{issues.map((issue, index) => <IssueCard key={index} issue={issue} />)}</ul></Section>}
    {result.performance_improvements.length > 0 && <Section title="Performance improvements"><ul className="flex flex-col gap-2">{result.performance_improvements.map((improvement, index) => <li key={index} className="rounded-lg border border-edge bg-ink/40 p-3"><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-slate-100">{improvement.title}</h4><span className="ml-auto text-xs text-emerald-300">{improvement.impact}</span></div><p className="mt-1.5 text-sm text-slate-300">{improvement.description}</p></li>)}</ul></Section>}
    {result.explanation_of_changes.length > 0 && <Section title="What changed and why"><ChangeList changes={result.explanation_of_changes} /></Section>}
  </div>;
}
