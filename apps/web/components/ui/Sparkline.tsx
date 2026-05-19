import { cn } from "@/lib/utils";

export function Sparkline({
  points,
  className,
}: {
  points: number[];
  className?: string;
}) {
  const w = 120;
  const h = 36;
  if (points.length < 2) {
    return <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden />;
  }
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("text-brand-cyan", className)}
      aria-hidden
    >
      <defs>
        <filter id="sparkline-glow">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <polyline
        points={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#sparkline-glow)"
      />
    </svg>
  );
}
