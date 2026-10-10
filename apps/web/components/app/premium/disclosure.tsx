import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { Explain, Reveal } from "@/components/app/premium/grammar";

/**
 * Server wrappers for the grammar's two disclosure primitives, carrying the
 * ONE shared wording (`common.disclosure`), so every server surface folds its
 * explanations and long lists the same way with a one-line call site.
 * Client surfaces use `Explain` / `Reveal` from the grammar with labels from
 * `useTranslations("common.disclosure")`.
 */

export async function ExplainMore({
  children,
  summary,
  className,
  testId,
}: {
  readonly children: ReactNode;
  /** Optional, already localised; defaults to "How this works". */
  readonly summary?: string;
  readonly className?: string;
  readonly testId?: string;
}) {
  const t = await getTranslations("common.disclosure");
  return (
    <Explain summary={summary ?? t("details")} className={className} testId={testId}>
      {children}
    </Explain>
  );
}

export async function RevealList({
  items,
  limit = 3,
  className,
  listClassName,
  listAs,
  testId,
}: {
  readonly items: readonly ReactNode[];
  readonly limit?: number;
  readonly className?: string;
  readonly listClassName?: string;
  readonly listAs?: "ul" | "div";
  readonly testId?: string;
}) {
  const t = await getTranslations("common.disclosure");
  return (
    <Reveal
      items={items}
      limit={limit}
      showAllLabel={t("showAll", { count: items.length })}
      className={className}
      listClassName={listClassName}
      listAs={listAs}
      testId={testId}
    />
  );
}
