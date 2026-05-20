"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import {
  getDraft,
  type DraftStatus,
  type PlayerTier,
} from "@/content/placeholders";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";

const TIER_BADGE: Record<PlayerTier, string> = {
  gold: "border-tier-gold/70 text-tier-gold",
  silver: "border-tier-silver/70 text-tier-silver",
  bronze: "border-tier-bronze/70 text-tier-bronze",
};
const PILL: Record<DraftStatus, string> = {
  reviewing: "border-ink-500 text-text-secondary",
  deciding: "border-state-amber/40 text-state-amber",
  hired: "border-state-live/40 text-state-live",
};

/** Compact horizontal draft card (~280×72). The status pill is sourced from
 *  the column the card currently sits in, not the card data, so a card
 *  picks up the right label as it slides through onDeck → live → drafted. */
export function MiniDraftCard({
  id,
  statusKey,
}: {
  id: string;
  statusKey: DraftStatus;
}) {
  const card = getDraft(id);
  const locale = useLocale();
  const t = useTranslations("draft");
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const role = locale === "lt" ? card.role.lt : card.role.en;
  const statusText = t(`status.${statusKey}`);

  return (
    <motion.div
      whileHover={mounted && !reduce ? { y: -4 } : undefined}
      transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }}
      role="listitem"
      aria-label={`${card.name} — ${role}, ${statusText}`}
      className="group flex items-center gap-3 card-border p-2.5"
    >
      <span
        aria-hidden
        className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-full border border-ink-500 bg-ink-700 text-text-muted"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 22c0-5 4-8 8-8s8 3 8 8Z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-text-primary">
          {card.name}{" "}
          <span aria-hidden className="ml-0.5">
            {card.flag}
          </span>
        </p>
        <p className="truncate text-[11px] text-text-muted">{role}</p>
      </div>
      <span
        className={cn(
          "inline-grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-[11px] font-bold",
          TIER_BADGE[card.tier],
        )}
      >
        {card.ovr}
      </span>
      <span
        className={cn(
          "hidden shrink-0 items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label transition-colors group-hover:brightness-125 sm:inline-flex",
          PILL[statusKey],
        )}
      >
        {statusText}
      </span>
    </motion.div>
  );
}
