import type { CSSProperties } from "react";

import type { TraceStepTone } from "@/lib/home/consequence-trace-copy";
import { cn } from "@/lib/utils";

/**
 * ONE consequence-trace step, drawn the same on the home and in the
 * conversation. The SHAPE says what kind of fact it is (never colour alone):
 *
 *   fact       solid frame, filled dot
 *   confirmed  solid frame + check — the ONLY green (a second party approved)
 *   negative   solid frame + diamond in warning (rejected / changes requested)
 *   pending    dashed frame + open ring (waiting for a second party)
 *   derived    frame + steel diamond (Living CV, matching — derived from facts)
 *
 * Server-safe and client-safe: no hooks, no data, only props.
 */
const FRAME: Record<TraceStepTone, string> = {
  fact: "border-ink-500",
  confirmed: "border-trust-accent/60",
  negative: "border-state-warning/60",
  pending: "border-dashed border-brand-blue/70",
  derived: "border-brand-cyan/60",
};

const BASIS: Record<TraceStepTone, "fact" | "pending" | "derived"> = {
  fact: "fact",
  confirmed: "fact",
  negative: "fact",
  pending: "pending",
  derived: "derived",
};

export function TraceMark({ tone }: { readonly tone: TraceStepTone }) {
  switch (tone) {
    case "confirmed":
      return (
        <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-trust-accent">
          <path d="M2.5 6.5l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "pending":
      return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full border-2 border-brand-blue" />;
    case "derived":
      return <span aria-hidden className="h-2 w-2 shrink-0 rotate-45 bg-brand-cyan" />;
    case "negative":
      return <span aria-hidden className="h-2 w-2 shrink-0 rotate-45 bg-state-warning" />;
    default:
      return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-text-secondary" />;
  }
}

export function TraceStepNode({
  tone,
  text,
  testId,
  celebrate = false,
  style,
  extra,
}: {
  readonly tone: TraceStepTone;
  readonly text: string;
  readonly testId?: string;
  /** The ONE celebration: a chain that reached the Living CV. */
  readonly celebrate?: boolean;
  readonly style?: CSSProperties;
  readonly extra?: Record<string, string | undefined>;
}) {
  return (
    <span
      className={cn(
        "ua-msg-in inline-flex min-h-8 max-w-full items-center gap-2 rounded-control border px-2.5 py-1 text-support leading-snug text-text-primary",
        FRAME[tone],
        celebrate && "ua-confirmed",
      )}
      style={style}
      data-basis={BASIS[tone]}
      data-testid={testId}
      {...extra}
    >
      <TraceMark tone={tone} />
      <span className="min-w-0">{text}</span>
    </span>
  );
}
