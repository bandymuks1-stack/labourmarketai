"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, EyeOff, Pause, Pencil, Play, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { StatusChip } from "@/components/app/status-chip";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import {
  allowedActions,
  visibilityReason,
  type DomainSupport,
  type EntryAction,
  type EntryFacts,
  type VisibilityFacts,
} from "@/lib/market-lifecycle/contract";

/**
 * The ONE owner-facing face of the lifecycle contract
 * (`lib/market-lifecycle/contract.ts`) — every own need, offer and listing
 * row renders its state, whether others can find it, and the actions the
 * contract allows, with the same words (`marketLifecycle` messages).
 *
 * Nothing here decides a transition: the actions shown are exactly
 * `allowedActions(support, facts)`, and the server re-checks the same
 * contract before writing. Hiding (pause / complete / withdraw) is one
 * click and reversible; the only confirmation is on permanent deletion,
 * which is data erasure, not a lifecycle action.
 */

const ICON: Record<EntryAction, LucideIcon> = {
  publish: Play,
  edit: Pencil,
  pause: Pause,
  resume: Play,
  complete: CheckCircle2,
  withdraw: EyeOff,
};

const ACTION_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded border px-2.5 text-xs font-medium disabled:opacity-60 sm:min-h-8";

const TONE: Record<EntryAction, string> = {
  publish: "border-state-success/50 text-state-success hover:border-state-success",
  resume: "border-state-success/50 text-state-success hover:border-state-success",
  edit: "border-ink-500 text-text-secondary hover:border-brand-blue",
  pause: "border-ink-500 text-text-secondary hover:border-brand-blue",
  complete: "border-ink-500 text-text-secondary hover:border-state-success",
  withdraw: "border-ink-500 text-text-secondary hover:border-state-warning",
};

/** The label key: the same action reads differently where the meaning differs. */
function actionLabelKey(action: EntryAction, facts: EntryFacts): string {
  if (action === "resume" && facts.state === "closed") return "publishAgain";
  if (action === "withdraw" && facts.state === "draft") return "discard";
  return action;
}

function stateKey(facts: EntryFacts): string {
  if (facts.ownerLocked) return "locked";
  if (facts.state === "closed") return facts.closedOutcome ?? "closed";
  return facts.state;
}

/** The state chip: only a row others can find right now is a positive fact. */
export function MarketEntryChip({
  facts,
  visibility,
  testId,
}: {
  facts: EntryFacts;
  visibility?: VisibilityFacts;
  testId?: string;
}) {
  const t = useTranslations("marketLifecycle");
  const visible = visibilityReason(facts, visibility) === "visible";
  return (
    <StatusChip variant={visible ? "success" : "neutral"} testid={testId} className="px-2 py-0.5 text-meta">
      {t(`states.${stateKey(facts)}`)}
    </StatusChip>
  );
}

/** Whether others can find it now, and if not, why — in words. */
export function MarketEntryVisibility({
  facts,
  visibility,
  testId,
}: {
  facts: EntryFacts;
  visibility?: VisibilityFacts;
  testId?: string;
}) {
  const t = useTranslations("marketLifecycle");
  const reason = visibilityReason(facts, visibility);
  return (
    <p
      data-testid={testId}
      data-visibility={reason}
      className={`text-meta leading-relaxed ${reason === "visible" ? "text-state-success" : "text-text-muted"}`}
    >
      {t(`visibility.${reason}`)}
    </p>
  );
}

/** The contract's actions for this row, plus (separately) permanent deletion. */
export function MarketEntryActions({
  support,
  facts,
  onAction,
  pending,
  testIdFor,
  hide,
  erase,
}: {
  support: DomainSupport;
  facts: EntryFacts;
  onAction: (action: EntryAction) => void;
  pending?: boolean;
  /** Keeps each surface's existing test ids (walk specs depend on them). */
  testIdFor?: (action: EntryAction) => string | undefined;
  /** Actions a surface serves through another control (e.g. a draft's
   *  publish lives in its form). Never used to ADD an action. */
  hide?: readonly EntryAction[];
  /** Permanent deletion where the domain allows it — data erasure, apart
   *  from the lifecycle, behind the one strong-tier confirmation. */
  erase?: { onConfirm: () => void; testId?: string };
}) {
  const t = useTranslations("marketLifecycle");
  const actions = allowedActions(support, facts).filter((a) => !hide?.includes(a));
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="market-entry-actions">
      {actions.map((action) => {
        const Icon = action === "withdraw" && facts.state === "draft" ? X : ICON[action];
        return (
          <button
            key={action}
            type="button"
            onClick={() => onAction(action)}
            disabled={pending}
            data-testid={testIdFor?.(action)}
            data-action={action}
            className={`${ACTION_CLASS} ${TONE[action]}`}
          >
            <Icon aria-hidden className="h-3.5 w-3.5" />
            {t(`actions.${actionLabelKey(action, facts)}`)}
          </button>
        );
      })}
      {erase ? (
        <InlineConfirm
          label={t("deleteForever")}
          question={t("deleteQuestion")}
          confirmLabel={t("deleteYes")}
          cancelLabel={t("cancel")}
          tier="strong_irreversible"
          onConfirm={erase.onConfirm}
          disabled={pending}
          testId={erase.testId}
          className={`${ACTION_CLASS} border-transparent text-state-danger hover:border-state-danger`}
        />
      ) : null}
    </div>
  );
}
