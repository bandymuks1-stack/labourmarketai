"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { getPool } from "@/content/placeholders";

export function AgencyPoolPreview({ id }: { id: string }) {
  const p = getPool(id);
  const t = useTranslations("shared.preview");
  const max = Math.max(...p.breakdown.map((b) => b.count), 1);

  const STATUS = [
    { key: "active", n: p.status.active, cls: "border-state-live/40 text-state-live" },
    { key: "pending", n: p.status.pending, cls: "border-state-amber/40 text-state-amber" },
    { key: "available", n: p.status.available, cls: "border-brand-cyan/40 text-brand-cyan" },
  ] as const;

  return (
    <Card label={t("poolSize")} className="w-[360px] max-w-full">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl font-bold tracking-tightest text-text-primary">
          {p.poolSize}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("poolSize")}
        </span>
      </div>

      <p className="mt-5 font-mono text-[11px] uppercase tracking-label text-text-muted">
        {t("trades")}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {p.breakdown.map((b) => (
          <div key={b.trade} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-xs text-text-secondary">
              {b.trade}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-600">
              <div
                className="h-full rounded-full bg-gradient-cta"
                style={{ width: `${(b.count / max) * 100}%` }}
              />
            </div>
            <span className="w-7 shrink-0 text-right font-mono text-[11px] text-text-secondary">
              {b.count}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {STATUS.map((s) => (
          <span
            key={s.key}
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-label ${s.cls}`}
          >
            <span className="font-bold">{s.n}</span>
            {t(`status.${s.key}`)}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center">
        <div className="flex -space-x-2">
          {Array.from({ length: p.avatars }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="inline-grid h-8 w-8 place-items-center rounded-full border border-ink-500 bg-ink-700 text-text-muted"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 22c0-5 4-8 8-8s8 3 8 8Z" />
              </svg>
            </span>
          ))}
        </div>
        <span className="ml-3 font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("more", { n: p.extraCount })}
        </span>
      </div>
    </Card>
  );
}
