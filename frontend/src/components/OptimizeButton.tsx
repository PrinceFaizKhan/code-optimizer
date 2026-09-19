interface OptimizeButtonProps {
  loading: boolean;
  disabled: boolean;
  elapsedSeconds: number;
  statusMessage: string;
  onClick: () => void;
}

export default function OptimizeButton({
  loading,
  disabled,
  elapsedSeconds,
  statusMessage,
  onClick,
}: OptimizeButtonProps) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? (
          <>
            <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
            Optimizing… {elapsedSeconds}s
          </>
        ) : (
          <>⚡ Optimize Code</>
        )}
      </button>
      {loading && <p aria-live="polite" className="text-xs text-muted">{statusMessage}</p>}
    </div>
  );
}
