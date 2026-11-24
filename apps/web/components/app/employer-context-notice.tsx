import { getTranslations } from "next-intl/server";

import type { EmployerContextReason } from "@/lib/company/employer-company-context";

/**
 * THE ONE honest state an employer surface renders when the active workspace
 * is not acting for a company (W8 slice 1).
 *
 * The audit's P0-1 fix makes every employer read and write fail closed outside
 * a company context. Failing closed is only half of honest: the person must
 * also be told WHICH context they are in and WHAT would change it — otherwise
 * the surface just looks broken or empty, which is the same lie in a different
 * shape.
 *
 * COPY: composed entirely from EXISTING message keys (`spaces.current`,
 * `spaces.switchSpace`, `scouting.contactRequest.noOrganization`), all present
 * in every active locale (lt/en/ru/nl/de). This slice deliberately adds no key
 * to `messages/*.json` — those twelve files are touched by W6 PR #974 and the
 * slice contract forbids conflicting with it.
 *
 * NO RAW DB TEXT. `reason` is a product-state name; the person sees a
 * localized sentence, never a Postgres code. The reason IS rendered as a
 * machine-readable `data-reason` so tests and support can tell the states
 * apart without exposing internals in the UI.
 */
export async function EmployerContextNotice({
  reason,
  activeWorkspaceName,
}: {
  reason: EmployerContextReason;
  activeWorkspaceName: string | null;
}) {
  const tSpaces = await getTranslations("spaces");
  const tChat = await getTranslations("conversation.chat");
  const tScouting = await getTranslations("scouting");

  // "personal-workspace" resolves to the localized personal-space label rather
  // than an empty name — the chip uses the same one, so both agree.
  const spaceName =
    reason === "personal-workspace"
      ? tChat("workspacePersonal")
      : (activeWorkspaceName?.trim() || tChat("workspaceUnnamed"));

  // The person has, or could have, an organization to switch INTO → point at
  // the switcher. Otherwise the missing thing is the organization itself.
  const switchable =
    reason === "personal-workspace" ||
    reason === "not-a-member" ||
    reason === "company-not-owned";

  return (
    <section
      data-testid="employer-context-notice"
      data-reason={reason}
      className="flex flex-col gap-1.5 rounded-lg border border-state-warning/40 bg-state-warning/5 px-4 py-3"
    >
      <p className="text-sm font-semibold text-text-primary">
        {tSpaces("current")}: {spaceName}
      </p>
      <p className="text-xs leading-relaxed text-text-secondary">
        {switchable ? tSpaces("switchSpace") : tScouting("contactRequest.noOrganization")}
      </p>
    </section>
  );
}
