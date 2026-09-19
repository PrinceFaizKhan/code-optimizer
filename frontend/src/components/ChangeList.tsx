import type { Change } from '@code-optimizer/shared';

export default function ChangeList({ changes }: { changes: Change[] }) {
  return <ol className="flex flex-col gap-3">{changes.map((change, index) => <li key={index} className="flex gap-3"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-edge text-[10px] text-muted">{index + 1}</span><div className="min-w-0"><p className="text-sm font-medium text-slate-100">{change.change}</p><p className="text-sm text-muted">{change.why}</p></div></li>)}</ol>;
}
