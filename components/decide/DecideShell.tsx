import Link from "next/link";

export default function DecideShell({
  children,
  statusLabel,
  showCancel,
  showNew,
  onCancel,
  onNew,
  onOpenMemory,
  speakingMode = false,
}: {
  children: React.ReactNode;
  statusLabel?: string | null;
  showCancel?: boolean;
  showNew?: boolean;
  onCancel?: () => void;
  onNew?: () => void;
  onOpenMemory?: () => void;
  speakingMode?: boolean;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-ink text-paper pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div
        className="night-ambient pointer-events-none absolute inset-0"
        aria-hidden
      />

      <header
        className={`relative z-10 mx-auto flex w-full max-w-2xl items-center justify-between px-6 pt-7 sm:px-8 transition-opacity duration-200 ${
          speakingMode ? "opacity-40" : ""
        }`}
      >
        <Link
          href="/"
          className="font-serif text-[1.55rem] font-semibold tracking-[-0.03em] text-paper"
        >
          Megamind
        </Link>
        <div className="flex items-center gap-4">
          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-10 text-sm font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={onOpenMemory}
            aria-controls="memory-panel"
            className="min-h-10 text-sm font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Memory
          </button>
          {showNew && (
            <button
              type="button"
              onClick={onNew}
              className="min-h-10 text-sm font-medium text-muted transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              New
            </button>
          )}
        </div>
      </header>

      {statusLabel && (
        <div
          className="relative z-20 mx-auto w-full max-w-2xl px-6 pt-4 sm:px-8"
          role="status"
          aria-live="polite"
        >
          <div className="decide-progress-track">
            <div className="decide-progress-bar" />
          </div>
          <p className="mt-2 text-sm font-medium text-paper/85">{statusLabel}</p>
        </div>
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-14 pt-8 sm:px-8">
        {children}
      </div>
    </div>
  );
}
