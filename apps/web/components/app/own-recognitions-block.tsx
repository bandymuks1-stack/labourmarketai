import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { getOwnRecognitionRows } from "@/lib/qualification/capability-evidence";
import {
  deriveRecognitionsView,
  type RecognitionItemState,
} from "@/lib/qualification/recognitions-view";

const STATE_KEY: Record<RecognitionItemState, string> = {
  current: "stateCurrent",
  lapsed: "stateLapsed",
  not_recognised: "stateNotRecognised",
  revoked: "stateRevoked",
  not_yet_valid: "stateNotYetValid",
};

const KIND_KEY = {
  document_type: "kindDocument",
  skill: "kindSkill",
  profession: "kindProfession",
} as const;

/**
 * SKL-9 — the person's OWN recognitions, read-only. A recognition is an
 * independent assessor's decision; it is distinct from declared, evidenced and
 * qualified (SEP-6) and is never labelled "verified" here. Empty and
 * unavailable are different sentences (SEP-7): `getOwnRecognitionRows` answers
 * `[]` while the register is absent and `null` when the read failed.
 */
export async function OwnRecognitionsBlock({ profileId }: { readonly profileId: string }) {
  const t = await getTranslations("qualificationRecognitions");
  const rows = await getOwnRecognitionRows(profileId).catch(() => null);
  const view = deriveRecognitionsView(rows, new Date().toISOString().slice(0, 10));

  return (
    <Card compact>
      <section className="flex flex-col gap-3" data-testid="own-recognitions" aria-labelledby="own-recognitions-title">
        <header className="flex flex-col gap-1">
          <h2 id="own-recognitions-title" className="font-display text-base font-semibold text-text-primary">
            {t("title")}
          </h2>
          <p className="text-xs leading-relaxed text-text-secondary">{t("subtitle")}</p>
        </header>
        {view.kind === "unavailable" ? (
          <p className="text-xs leading-relaxed text-text-muted" data-testid="own-recognitions-unavailable">
            {t("unavailable")}
          </p>
        ) : view.kind === "empty" ? (
          <p className="text-xs leading-relaxed text-text-muted" data-testid="own-recognitions-empty">
            {t("empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="own-recognitions-list">
            {view.items.map((i) => (
              <li key={i.id} className="flex flex-col gap-0.5 rounded-md border border-ink-600 p-2 text-xs">
                <span className="text-text-primary">
                  {t(KIND_KEY[i.requirementKind])}: {i.requirementKey}
                </span>
                <span className="text-text-secondary">
                  {t(STATE_KEY[i.state])}
                  {i.validFrom ? ` · ${t("validFrom", { date: i.validFrom })}` : ""}
                  {i.validUntil ? ` · ${t("validUntil", { date: i.validUntil })}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
