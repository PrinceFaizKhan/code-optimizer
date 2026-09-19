interface QualityScoreProps { score: number; summary: string; noOptimizationNeeded: boolean; issueCount: number; improvementCount: number; bugCount: number; }

function band(score: number): string {
  if (score >= 85) return 'text-emerald-400 border-emerald-500/40';
  if (score >= 60) return 'text-amber-400 border-amber-500/40';
  return 'text-red-400 border-red-500/40';
}
function plural(count: number, noun: string): string { return `${count} ${noun}${count === 1 ? '' : 's'}`; }

export default function QualityScore({ score, summary, noOptimizationNeeded, issueCount, improvementCount, bugCount }: QualityScoreProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg border-2 ${band(score)}`}>
        <span className="text-2xl font-bold leading-none">{score}</span><span className="text-[10px] uppercase tracking-wider text-muted">/ 100</span>
      </div>
      <div className="min-w-0">
        {noOptimizationNeeded && <p className="mb-1 inline-block rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">✓ No changes needed</p>}
        <p className="text-xs text-muted">{plural(issueCount, 'issue')} · {plural(improvementCount, 'performance win')} · {plural(bugCount, 'potential bug')}</p>
        <p className="mt-1 text-sm text-slate-200">{summary}</p>
      </div>
    </div>
  );
}
