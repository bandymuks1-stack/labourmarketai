export function Stat({
  icon,
  value,
  label,
}: {
  icon?: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {icon ? (
        <div className="flex items-center gap-2 text-brand-cyan">{icon}</div>
      ) : null}
      <div className="font-display text-3xl font-bold tracking-tightest text-text-primary">
        {value}
      </div>
      <div className="font-mono text-xs uppercase tracking-label text-text-muted">
        {label}
      </div>
    </div>
  );
}
