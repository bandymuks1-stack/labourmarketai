"use client";

import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { getDemand, type DemandIntensity } from "@/content/placeholders";
import { cn } from "@/lib/utils";

const DOT: Record<DemandIntensity, string> = {
  HOT: "bg-state-danger",
  FILLING: "bg-state-amber",
  OPEN: "bg-brand-cyan",
};

export function DemandPreviewCard({ id }: { id: string }) {
  const d = getDemand(id);
  const locale = useLocale();
  const t = useTranslations("shared.preview");
  const lc = (v: { lt: string; en: string }) =>
    locale === "lt" ? v.lt : v.en;

  return (
    <Card className="w-[340px] max-w-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold tracking-tight text-text-primary">
            {lc(d.project)}
          </p>
          <p className="mt-1 text-sm text-text-secondary">{lc(d.location)}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-text-secondary">
          <span
            aria-hidden
            className={cn("h-2 w-2 rounded-full", DOT[d.intensity])}
          />
          {t(`intensity.${d.intensity}`)}
        </span>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {d.headcount}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("headcount")}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {d.skills.map((s) => (
          <Badge key={s} tone="muted">
            {s}
          </Badge>
        ))}
      </div>

      <div className="mt-5 inline-flex items-center gap-2 rounded-sm border border-brand-blue/40 px-2.5 py-1 font-mono text-[11px] uppercase tracking-label text-brand-blue">
        <span className="font-bold text-text-primary">{d.rankedMatches}</span>
        {t("rankedMatches")}
      </div>
    </Card>
  );
}
