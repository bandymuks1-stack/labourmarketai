import { getTranslations } from "next-intl/server";

import { playerInitials } from "@/lib/identity/player-identity";
import { TwoSidesLifecycle } from "./two-sides-lifecycle";

/** Server wrapper: resolves the `twoSides` copy and the labelled sample name. */
export async function TwoSidesSection() {
  const t = await getTranslations("twoSides");
  const tCards = await getTranslations("playercards");
  const keys = ["find", "connect", "work", "verify", "grow", "continue"] as const;
  const sampleName = tCards("sample.name");
  return (
    <TwoSidesLifecycle
      title={t("title")}
      professionalLabel={t("professional")}
      companyLabel={t("company")}
      sampleName={sampleName}
      sampleInitials={playerInitials(sampleName)}
      steps={keys.map((k) => ({
        label: t(`steps.${k}.label`),
        worker: t(`steps.${k}.worker`),
        company: t(`steps.${k}.company`),
      }))}
    />
  );
}
