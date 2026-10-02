import { getTranslations } from "next-intl/server";

import { WorkLifecycleGraph, type LifecycleStage } from "./work-lifecycle-graph";

/**
 * Server wrapper: resolves the `workLifecycle` copy and maps each stage to the
 * REAL workspace route it opens. `audience` picks the worker lifecycle
 * (identity → team → project → work → evidence → confirmed → history) or the
 * company one (need → people → team → project → work → confirmed → report).
 */
const WORKER: ReadonlyArray<Pick<LifecycleStage, "key" | "icon" | "href" | "tone">> = [
  { key: "person", icon: "person", href: "/dashboard/profile" },
  { key: "team", icon: "team", href: "/dashboard/people" },
  { key: "project", icon: "project", href: "/dashboard/projects" },
  { key: "work", icon: "work", href: "/dashboard/journal" },
  { key: "evidence", icon: "evidence", href: "/dashboard/journal", tone: "evidence" },
  { key: "confirmation", icon: "confirmation", href: "/dashboard/journal", tone: "confirmed" },
  { key: "history", icon: "history", href: "/dashboard/profile?card=history" },
];

const COMPANY: ReadonlyArray<Pick<LifecycleStage, "key" | "icon" | "href" | "tone">> = [
  { key: "need", icon: "need", href: "/company-need" },
  { key: "people", icon: "people", href: "/dashboard/talent" },
  { key: "team", icon: "team", href: "/dashboard/people" },
  { key: "project", icon: "project", href: "/dashboard/projects" },
  { key: "work", icon: "work", href: "/dashboard/journal" },
  { key: "confirmation", icon: "confirmation", href: "/dashboard/journal", tone: "confirmed" },
  { key: "report", icon: "report", href: "/dashboard/reports" },
];

export async function WorkLifecycleSection({ audience }: { audience: "workers" | "companies" }) {
  const t = await getTranslations("workLifecycle");
  const defs = audience === "workers" ? WORKER : COMPANY;
  const stages: LifecycleStage[] = defs.map((d) => ({
    ...d,
    label: t(`${audience}.${d.key}.label`),
    fact: t(`${audience}.${d.key}.fact`),
    detail: t(`${audience}.${d.key}.detail`),
  }));
  return (
    <WorkLifecycleGraph
      title={audience === "workers" ? t("title") : t("titleCompany")}
      hint={t("hint")}
      exampleNote={t("example")}
      openLabel={t("open")}
      listLabel={t("list")}
      stages={stages}
      testId={`work-lifecycle-${audience}`}
    />
  );
}
