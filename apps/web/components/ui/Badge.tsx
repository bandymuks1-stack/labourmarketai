import { cn } from "@/lib/utils";

type Tone = "brand" | "live" | "warning" | "muted";

const tones: Record<Tone, string> = {
  brand: "border-brand-blue/40 text-brand-blue",
  live: "border-state-live/40 text-state-live",
  warning: "border-state-warning/40 text-state-warning",
  muted: "border-ink-500 text-text-muted",
};

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2.5 py-1 font-mono text-[11px] uppercase tracking-label",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
