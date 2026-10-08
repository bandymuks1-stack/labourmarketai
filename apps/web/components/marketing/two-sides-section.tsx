import { getTranslations } from "next-intl/server";

import { TwoSidesLifecycle } from "./two-sides-lifecycle";

/** Server wrapper: resolves the `twoSides` copy (no named persona). */
export async function TwoSidesSection() {
  const t = await getTranslations("twoSides");
  const keys = ["find", "connect", "work", "verify", "grow", "continue"] as const;
  return (
    <TwoSidesLifecycle
      title={t("title")}
      professionalLabel={t("professional")}
      companyLabel={t("company")}
      steps={keys.map((k) => ({
        label: t(`steps.${k}.label`),
        worker: t(`steps.${k}.worker`),
        company: t(`steps.${k}.company`),
      }))}
    />
  );
}
