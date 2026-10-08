import { getFormatter, getTranslations } from "next-intl/server";

import { getOwnRecognisedByRows } from "@/lib/qualification/capability-evidence";
import { deriveRecognisedByItems } from "@/lib/qualification/recognised-by-view";

/**
 * "RECOGNISED BY <institution>" on the person's OWN profile and Living CV
 * (SKL-9 downstream).
 *
 * A recognition is an independent assessor's decision - evidence class
 * `assessor_recognition`. It is not worker-verified, not a credential and not a
 * score, and nothing here touches confidence or matching rank (SEP-6, doctrine
 * section 7). The block renders ONLY when a current positive recognition of a
 * skill or profession exists: no empty header (the document centre's
 * `OwnRecognitionsBlock` is where "none yet" and "unavailable" are said).
 */
export async function RecognisedByBlock({
  profileId,
  variant = "profile",
  locale,
}: {
  readonly profileId: string;
  readonly variant?: "profile" | "cv";
  readonly locale: string;
}) {
  const data = await getOwnRecognisedByRows(profileId).catch(() => null);
  if (!data) return null;
  const items = deriveRecognisedByItems(
    data.rows,
    data.institutionNames,
    new Date().toISOString().slice(0, 10),
  );
  if (items.length === 0) return null;

  const t = await getTranslations("recognisedBy");
  const tSkill = await getTranslations("skillNames");
  const tProf = await getTranslations("professions");
  const fmt = await getFormatter({ locale });
  const label = (kind: "skill" | "profession", key: string): string => {
    const tr = kind === "skill" ? tSkill : tProf;
    return tr.has(key as never) ? tr(key as never) : key;
  };

  return (
    <section
      id="cv-recognitions"
      className="flex flex-col gap-2 scroll-mt-20"
      data-testid="recognised-by"
      data-variant={variant}
      data-evidence-class="assessor_recognition"
      aria-labelledby="recognised-by-title"
    >
      <h2 id="recognised-by-title" className={variant === "cv" ? "font-display text-lg font-bold" : "font-display text-base font-semibold text-text-primary"}>
        {t("title")}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 text-sm" data-testid="recognised-by-item">
            <span className="font-medium">{label(i.kind, i.key)}</span>
            <span className="text-xs text-text-secondary">
              {i.institutionName
                ? t("recognisedBy", { institution: i.institutionName })
                : t("recognisedByUnnamed")}
              {i.validUntil ? ` · ${t("validUntil", { date: fmt.dateTime(new Date(i.validUntil), { dateStyle: "medium" }) })}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-meta text-text-muted">{t("note")}</p>
    </section>
  );
}
