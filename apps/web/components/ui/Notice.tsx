import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type NoticeTone = "info" | "success" | "warning" | "error";

const TONE: Record<NoticeTone, { box: string; icon: typeof Info }> = {
  info: { box: "border-ink-500 bg-ink-800/50 text-text-secondary", icon: Info },
  success: { box: "border-state-success/40 bg-state-success/10 text-text-primary", icon: CheckCircle2 },
  warning: { box: "border-brand-orange/50 bg-brand-orange/10 text-text-primary", icon: AlertTriangle },
  error: { box: "border-state-danger/40 bg-state-danger/10 text-text-primary", icon: XCircle },
};

/**
 * ONE NOTICE — the general message block for a screen or a form: something
 * was saved, something could not be read, something needs attention.
 *
 * The tone is carried by an icon and the words, never by colour alone. An
 * error or a warning is announced at once (`role="alert"`); a success or an
 * information notice is announced politely (`role="status"`). Purpose-built
 * notices that already exist (manager scope, staff review, access refusal,
 * connection) stay as they are — this is for the cases that had none and
 * hand-wrote a coloured paragraph.
 */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  testId,
  className,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  /** One optional action, e.g. a retry button or a link. */
  action?: ReactNode;
  testId?: string;
  className?: string;
}) {
  const { box, icon: Icon } = TONE[tone];
  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      data-testid={testId}
      data-tone={tone}
      className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", box, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-semibold leading-snug text-text-primary">{title}</p>}
        {children && <div className="leading-snug">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
