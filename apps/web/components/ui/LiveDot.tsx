export function LiveDot({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="live-dot" aria-hidden />
      {label && (
        <span className="font-mono text-xs uppercase tracking-label text-state-live">
          {label}
        </span>
      )}
    </span>
  );
}
