export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="eyebrow inline-flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
      {children}
    </span>
  );
}
