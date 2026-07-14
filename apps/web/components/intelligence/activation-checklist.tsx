import { getTranslations } from "next-intl/server";

import type { OwnerActivationChecklistV1 } from "@/lib/intelligence/source-activation";
import type { SourceHealthState } from "@/lib/intelligence/source-health";
import {
  INTEL_CHECK_TONE,
  INTEL_CHIP_CLASS,
  INTEL_HEALTH_TONE,
} from "./badge-styles";

/**
 * Owner ACTIVATION CHECKLIST + source HEALTH badge (Source Readiness v1) —
 * strictly display components over the pure models
 * (lib/intelligence/source-activation.ts / source-health.ts). Nothing here
 * can approve, activate, or change anything: no form, no button, no
 * action. The checklist makes the honest zero-state VISIBLE — today every
 * item is red for every external source.
 */

const HEALTH_LEAF: Record<SourceHealthState, string> = {
  offline: "offline",
  waiting_approval: "waitingApproval",
  paused: "paused",
  healthy: "healthy",
  error: "error",
  blocked: "blocked",
  maintenance: "maintenance",
  unknown: "unknown",
};

export async function SourceHealthBadge({
  state,
}: {
  state: SourceHealthState;
}) {
  const t = await getTranslations("intelligence");
  return (
    <span
      className={`${INTEL_CHIP_CLASS} ${INTEL_HEALTH_TONE[state]}`}
      data-testid="intelligence-source-health-badge"
      data-health={state}
    >
      {t(`health.${HEALTH_LEAF[state]}`)}
    </span>
  );
}

export async function ActivationChecklist({
  checklist,
}: {
  checklist: OwnerActivationChecklistV1;
}) {
  const t = await getTranslations("intelligence");
  const tc = (code: string) =>
    t(code.replace(/^intelligence\./, "") as never) as string;

  return (
    <div
      className="flex flex-col gap-2"
      data-testid={`activation-checklist-${checklist.sourceKey}`}
      data-activation-allowed={checklist.activationAllowed}
    >
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {checklist.items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-1.5 text-xs text-text-primary"
            data-check-item={item.id}
            data-check-status={item.status}
          >
            <span className={`${INTEL_CHIP_CLASS} ${INTEL_CHECK_TONE[item.status]}`}>
              {t(`activation.status.${item.status}`)}
            </span>
            <span>{tc(item.labelCode)}</span>
          </li>
        ))}
      </ul>
      {checklist.vetoCodes.length > 0 ? (
        <ul
          className="flex flex-col gap-1 text-[11px] text-state-danger"
          data-testid="activation-vetoes"
        >
          {checklist.vetoCodes.map((code) => (
            <li key={code}>{tc(code)}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-[11px] text-text-muted">
        {checklist.activationAllowed
          ? t("activation.allGreenNote")
          : t("activation.notReadyNote")}
      </p>
    </div>
  );
}
