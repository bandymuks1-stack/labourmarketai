"use client";

// Low-fidelity preview, bus pakeistas TASK 07 (living-arena UI po owner
// vizualinio užrakto). Koncepcinė FIFA-stiliaus kortelė — ne galutinė estetika.

import { useRef } from "react";
import Image from "next/image";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import {
  getCard,
  type PlayerStatKey,
  type PlayerStatus,
  type PlayerTier,
} from "@/content/placeholders";
import { env } from "@/lib/env";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";
import { OVRRing } from "@/components/app/ovr-ring";

const STAT_KEYS: PlayerStatKey[] = ["SKL", "REL", "SPD", "SAF", "ADP", "TRS"];

const TIER_BAR: Record<PlayerTier, string> = {
  gold: "bg-tier-gold",
  silver: "bg-tier-silver",
  bronze: "bg-tier-bronze",
};
const TIER_ACCENT: Record<PlayerTier, string> = {
  gold: "border-tier-gold/50",
  silver: "border-tier-silver/50",
  bronze: "border-tier-bronze/50",
};
const STATUS_CLS: Record<PlayerStatus, string> = {
  LIVE: "border-state-live/40 text-state-live",
  AVAILABLE: "border-brand-cyan/40 text-brand-cyan",
  DRAFTED: "border-brand-violet/40 text-brand-violet",
  BUSY: "border-state-amber/40 text-state-amber",
};
const STATUS_KEY: Record<PlayerStatus, string> = {
  LIVE: "live",
  AVAILABLE: "available",
  DRAFTED: "drafted",
  BUSY: "busy",
};

export function PlayerCard({ id }: { id: string }) {
  const card = getCard(id);
  const locale = useLocale();
  const t = useTranslations("playercards");
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const animateIn = mounted && !reduce;
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.35 });

  const lc = (v: { lt: string; en: string }) =>
    locale === "lt" ? v.lt : v.en;
  const name = lc(card.name);
  const role = lc(card.role);
  const tierLabel = t(`tier.${card.tier}`);
  const showMarker =
    env.NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS === "true";

  return (
    <motion.article
      ref={ref}
      role="article"
      aria-label={`${name} — ${role}, concept fit signal ${card.ovr} of 99 (preview)`}
      whileHover={reduce ? undefined : { y: -8 }}
      transition={{ duration: reduce ? 0 : 0.25, ease: "easeOut" }}
      className={cn(
        "group relative flex h-[420px] w-[280px] max-w-full flex-col overflow-hidden card-border bg-card-glow p-4",
        "hover:shadow-card-hover",
      )}
    >
      {/* tier corner accents */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-2 top-2 h-5 w-5 rounded-tl-md border-l-2 border-t-2",
          TIER_ACCENT[card.tier],
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-2 right-2 h-5 w-5 rounded-br-md border-b-2 border-r-2",
          TIER_ACCENT[card.tier],
        )}
      />

      {/* a) top band */}
      <div className="flex h-8 items-center justify-between">
        <span
          className={cn(
            "font-mono text-[11px] font-semibold uppercase tracking-label",
            card.tier === "gold"
              ? "text-tier-gold"
              : card.tier === "silver"
                ? "text-tier-silver"
                : "text-tier-bronze",
          )}
        >
          {tierLabel}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label",
            STATUS_CLS[card.status],
          )}
        >
          {card.status === "LIVE" && (
            <span className="live-dot" aria-hidden />
          )}
          {t(`status.${STATUS_KEY[card.status]}`)}
        </span>
      </div>

      {/* b) hero zone */}
      <div className="mt-2 flex items-start gap-3">
        <div className="relative">
          <Image
            src={card.photo.src}
            alt={lc(card.photo.alt)}
            width={96}
            height={96}
            unoptimized
            className="h-24 w-24 rounded-lg object-cover shadow-portrait ring-1 ring-brand-blue/40"
          />
          {showMarker && (
            <span
              aria-hidden
              className="pointer-events-none absolute -right-1 -top-2 select-none rounded-sm border border-brand-blue/40 bg-ink-800 px-1 font-mono text-[8px] uppercase tracking-label text-brand-blue"
            >
              Placeholder
            </span>
          )}
        </div>
        <div className="ml-auto">
          <OVRRing
            value={card.ovr}
            tier={card.tier}
            size="lg"
            tierLabel={tierLabel}
          />
        </div>
      </div>
      <div className="mt-3">
        <p className="font-display text-base font-bold tracking-tight text-text-primary">
          {name} <span aria-hidden>{card.flag}</span>
        </p>
        <p className="mt-0.5 text-xs text-text-muted">{role}</p>
      </div>

      {/* c) stats grid */}
      <div className="mt-4 grid flex-1 grid-cols-2 gap-x-4 gap-y-2 content-start">
        {STAT_KEYS.map((k, i) => {
          const v = card.stats[k];
          return (
            <div key={k} className="flex items-center gap-2">
              <span className="w-7 shrink-0 font-mono text-[11px] text-text-muted">
                {k}
              </span>
              <div
                role="meter"
                aria-valuenow={v}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t(`stat.${k}`)}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-600"
              >
                <motion.div
                  className={cn("h-full origin-left rounded-full", TIER_BAR[card.tier])}
                  initial={false}
                  animate={{
                    scaleX: !animateIn || inView ? v / 100 : 0,
                  }}
                  transition={{
                    duration: animateIn && inView ? 0.6 : 0,
                    ease: "easeOut",
                    delay: animateIn && inView ? i * 0.08 : 0,
                  }}
                />
              </div>
              <span className="w-6 shrink-0 text-right font-mono text-[11px] text-text-secondary">
                {v}
              </span>
            </div>
          );
        })}
      </div>

      {/* d) bottom band — verified skills */}
      <div className="mt-3 flex h-8 items-center gap-2 overflow-hidden">
        {card.skills.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 truncate rounded-sm border border-ink-500 px-2 py-1 text-[10px] text-text-secondary"
          >
            <span aria-hidden className="text-state-live">
              ✓
            </span>
            {s}
          </span>
        ))}
      </div>
    </motion.article>
  );
}
