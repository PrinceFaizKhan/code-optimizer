interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export default function ErrorBanner({ message, onRetry, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
    >
      <span aria-hidden>⚠</span>
      <p className="flex-1">{message}</p>
      <button type="button" onClick={onRetry} className="rounded border border-red-400/50 px-2.5 py-1 text-xs hover:bg-red-500/20">
        Retry
      </button>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="px-1 text-red-300 hover:text-red-100">
        ✕
      </button>
    </div>
  );
}
