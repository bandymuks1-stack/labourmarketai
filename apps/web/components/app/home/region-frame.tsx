import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { HomeRetry } from "@/components/app/home/home-retry";
import { cn } from "@/lib/utils";

/**
 * THE REGION FRAME shared by the home's regions and the consequence trace
 * (home + Living CV). Kept in its own small module so a page that draws only
 * the trace (the Living CV) does not import the whole home's reader graph.
 */
const NOTE = "text-support text-text-secondary";

/**
 * One region: a surface with its title INSIDE the head (number · title ·
 * optional aside), so the phone does not pay a separate title band per
 * region. `featured` is the region that carries the one gold action — it
 * gets the brand hairline, nothing else does.
 */
export function Region({
  id,
  index,
  title,
  state,
  testId,
  extra,
  aside,
  featured = false,
  children,
}: {
  readonly id: "waiting" | "running" | "because" | "outside" | "trace";
  /** The region number — the one mono line (a number, not a label). */
  readonly index: string;
  readonly title: string;
  readonly state: string;
  readonly testId?: string;
  readonly extra?: Record<string, string | undefined>;
  readonly aside?: ReactNode;
  readonly featured?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId ?? `home-${id}`}
      data-region={id}
      data-state={state}
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-card border p-4 sm:gap-4 sm:p-6",
        featured
          ? "border-brand-blue/35 bg-gradient-to-b from-ink-800 to-ink-800/60 shadow-card"
          : "border-ink-600/70 bg-ink-800/50",
      )}
      {...extra}
    >
      {featured ? (
        <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-brand-blue/70 to-transparent" />
      ) : null}
      <header className="flex items-baseline gap-3">
        <span className="font-mono text-meta tabular-nums text-text-muted">{index}</span>
        <h2 className="min-w-0 font-display text-body font-semibold tracking-tightest text-text-primary sm:text-title">
          {title}
        </h2>
        {aside ? <div className="ml-auto shrink-0">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

export type RetryLabels = { readonly retry: string; readonly retrying: string };

/** A failed read: named, with a way to read again. */
export function Unreadable({ text, testid, labels }: { readonly text: string; readonly testid: string; readonly labels: RetryLabels }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" role="status">
      <p className={NOTE} data-testid={testid}>
        {text}
      </p>
      <HomeRetry label={labels.retry} pendingLabel={labels.retrying} testid={`${testid}-retry`} />
    </div>
  );
}

export async function retryLabels(): Promise<RetryLabels> {
  const t = await getTranslations("homeRegions");
  return { retry: t("retry"), retrying: t("retrying") };
}

