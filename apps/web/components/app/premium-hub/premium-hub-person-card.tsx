import { getTranslations } from "next-intl/server";
import { UserRound } from "lucide-react";

import { personMonogram } from "@/lib/visual/avatar-monogram";
import type { HubPerson } from "./premium-hub-fixtures";
import { HubPanel, HubProgress } from "./premium-hub-primitives";

/** Block A — Asmens kortelė. The worker as a visible profile object: identity,
 *  an availability status (never a certification badge), and self-declared skill
 *  levels as progress rows. */
export async function PremiumHubPersonCard({ person }: { person: HubPerson }) {
  const t = await getTranslations("premiumHub");
  return (
    <HubPanel eyebrow={t("person.title")} icon={UserRound} testid="premium-hub-person">
      <div className="flex items-center gap-4">
        <div
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-brand-blue/40 bg-gradient-to-br from-brand-blue/25 to-brand-cyan/10 font-display text-lg font-bold tracking-tight text-text-primary"
        >
          {personMonogram(person.name)}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate font-display text-lg font-bold tracking-tightest text-text-primary">
            {person.name}
          </h2>
          <p className="truncate text-sm text-text-secondary">{person.role}</p>
          <span className="mt-0.5 inline-flex w-fit items-center gap-1.5 rounded-full border border-state-success/40 bg-state-success/5 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-success">
            <span className="live-dot" aria-hidden />
            {t("person.status")}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("person.skillsHeading")}
        </span>
        <div className="flex flex-col gap-3">
          {person.skills.map((skill) => (
            <HubProgress key={skill.label} label={skill.label} value={skill.value} />
          ))}
        </div>
      </div>
    </HubPanel>
  );
}
