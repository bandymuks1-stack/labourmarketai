import { cn } from "@/lib/utils";

/**
 * ResultShell — the canonical presentation frame for an asynchronous result
 * surface (visual contract v1, docs/design/visual-contract-v1.md).
 *
 * The audit found every workspace result component hand-rolling the same
 * idle/loading/error/ready state machine AND its presentation. The STATE
 * MACHINE stays with the caller — which status a result is in is domain truth
 * (result-registry readiness, W6/W10/W11/W12 logic) and this primitive must
 * never decide it. What standardizes here is only how each status LOOKS:
 *
 *   idle        → title + description + optional actions (nothing started)
 *   loading     → calm skeleton, aria-busy, reduced-motion safe
 *   error       → danger-toned description + optional retry action
 *   blocked     → honest "you can't do this from here" copy + the way there
 *   unavailable → the data source is not live — stated plainly, no fake shell
 *   empty       → a real "nothing here yet" (content optional)
 *   partial     → real content plus an honest note that it is incomplete
 *   ready       → the content
 *
 * Honesty contract: the shell NEVER promotes a status — `ready` is only ever
 * what the caller proved. All copy arrives already translated (usable in
 * server components); no technical state labels are printed to the user. The
 * status is exposed as `data-status` for tests, not as visible text.
 */
export type ResultShellStatus =
  | "idle"
  | "loading"
  | "error"
  | "blocked"
  | "unavailable"
  | "empty"
  | "partial"
  | "ready";

/** Statuses whose meaning includes showing the caller's content. */
const CONTENT_STATUSES: ReadonlySet<ResultShellStatus> = new Set([
  "partial",
  "ready",
]);

function Skeleton() {
  return (
    <div
      aria-hidden
      data-testid="result-shell-skeleton"
      className="flex flex-col gap-2 motion-reduce:animate-none animate-pulse"
    >
      <div className="h-4 w-3/5 rounded-sm bg-ink-700" />
      <div className="h-4 w-4/5 rounded-sm bg-ink-700" />
      <div className="h-4 w-2/5 rounded-sm bg-ink-700" />
    </div>
  );
}

export function ResultShell({
  status,
  title,
  description,
  actions,
  children,
  testId = "result-shell",
  className,
}: {
  status: ResultShellStatus;
  /** Already-translated heading for the surface. */
  title: string;
  /** Already-translated status copy: the why for idle/blocked/unavailable/
   *  empty, the honest error line, or the incompleteness note for partial. */
  description?: string;
  /** Real actions only (Button / pill link). Never a dead control. */
  actions?: React.ReactNode;
  /** The result content — rendered for `ready` and `partial` only. */
  children?: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  const showContent = CONTENT_STATUSES.has(status);

  return (
    <section
      data-testid={testId}
      data-status={status}
      aria-busy={status === "loading" || undefined}
      aria-label={title}
      className={cn("flex flex-col gap-3", className)}
    >
      <h3 className="font-display text-base font-semibold text-text-primary">
        {title}
      </h3>
      {status === "loading" ? (
        <Skeleton />
      ) : (
        <>
          {description ? (
            <p
              data-testid={`${testId}-description`}
              className={cn(
                "max-w-prose text-basis leading-relaxed",
                status === "error"
                  ? "text-state-danger"
                  : "text-text-secondary",
              )}
            >
              {description}
            </p>
          ) : null}
          {showContent ? children : null}
        </>
      )}
      {status !== "loading" && actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </section>
  );
}
