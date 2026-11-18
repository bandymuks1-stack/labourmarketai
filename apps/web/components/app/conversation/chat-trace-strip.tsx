"use client";

import { TraceStepNode } from "@/components/app/home/trace-step-node";
import type { ChatTraceItem } from "@/lib/conversation/what-changed";
import { Link } from "@/lib/i18n/navigation";

/**
 * The "what changed" answer inside the conversation — the SAME chains and
 * the SAME step shapes as the home's "Kas pasikeitė" region (one shared
 * `TraceStepNode`), already worded on the server (`readWhatChangedForChat`).
 * Each chain opens the place its source fact lives.
 */
export function ChatTraceStrip({
  items,
  partial,
}: {
  readonly items: readonly ChatTraceItem[];
  readonly partial: string | null;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="chat-trace">
      <ol className="flex flex-col divide-y divide-ink-600/60 rounded-card border border-ink-600/70 bg-ink-800/50 px-3 sm:px-4">
        {items.map((item) => (
          <li key={item.id} className="py-3" data-reached-cv={item.reachedCv ? "true" : undefined}>
            <Link
              href={item.href as "/dashboard"}
              className="-mx-2 flex flex-col gap-2 rounded-control px-2 py-1 transition-colors hover:bg-ink-700/40 focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-body font-medium text-text-primary">{item.title}</span>
                <span className="shrink-0 font-mono text-meta tabular-nums text-text-muted">{item.when}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {item.steps.map((step, i) => (
                  <span key={`${item.id}-${i}`} className="flex min-w-0 items-center gap-1.5">
                    {i > 0 ? (
                      <span aria-hidden className="text-text-muted">
                        →
                      </span>
                    ) : null}
                    <TraceStepNode
                      tone={step.tone}
                      text={step.text}
                      celebrate={item.reachedCv && step.tone === "derived" && i === item.steps.findIndex((s) => s.tone === "derived")}
                      style={{ animationDelay: `${i * 90}ms` }}
                    />
                  </span>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {partial ? (
        <p role="status" className="text-support text-text-muted" data-testid="chat-trace-partial">
          {partial}
        </p>
      ) : null}
    </div>
  );
}
