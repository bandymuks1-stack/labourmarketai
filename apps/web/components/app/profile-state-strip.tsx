import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import { deriveWorkerReadiness } from "@/lib/player-card/readiness";
import { Card } from "@/components/ui/Card";

/**
 * Profile state strip (human-first launch train v1).
 *
 * THREE plain concepts a worker can tell apart at a glance — deliberately
 * separated so readiness, freshness and today's activity never blur into one
 * vague "profile status":
 *
 *   1. Profilio parengtis — is the profile ready enough to be found/used.
 *      Sourced from the ONE canonical readiness model the setup journey and
 *      the player-card ring already use (deriveWorkerReadiness) — never a
 *      second competing computation, never a percentage or score. Shown as a
 *      single state word; the tile links down to the setup-journey steps.
 *
 *   2. Aktualumas — is the information fresh. The REAL date of the newest
 *      work-journal entry (card.latestEvidenceAt); honest "no entries yet"
 *      when none exists.
 *
 *   3. Šiandienos aktyvumas — what was recorded TODAY. A real count of
 *      today's journal entries; zero shows an honest nothing-yet line.
 *
 * Honesty: every value is a real row or date; on any read error a tile falls
 * back to its empty state (never an invented value). Presentational only —
 * no new business rules, no writes, no new routes.
 */
export async function ProfileStateStrip({ workerId }: { workerId: string }) {
  const card = await getWorkerPlayerCard();
  if (!card) return null;
  const readiness = deriveWorkerReadiness(card);
  const t = await getTranslations("profileState");
  const locale = await getLocale();

  // Real count of TODAY's live journal entries. Days are compared on the
  // same UTC clock the timestamps are stored in. 0 on any error.
  let todayCount = 0;
  try {
    const supabase = await createClient();
    const todayStartIso = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
    const { count, error } = await supabase
      .from("journal_entries")
      .select("*", { count: "exact", head: true })
      .eq("worker_id", workerId)
      .is("deleted_at", null)
      .gte("created_at", todayStartIso);
    if (!error && typeof count === "number") todayCount = count;
  } catch {
    /* honest degradation — the tile shows the nothing-yet state */
  }

  // Freshness from the newest live entry timestamp (already on the card).
  const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
  const now = new Date();
  const latest = card.latestEvidenceAt ? new Date(card.latestEvidenceAt) : null;
  let freshnessValue = t("freshness.none");
  let freshnessOk = false;
  if (latest && !Number.isNaN(latest.getTime())) {
    const k = dayKey(latest);
    if (k === dayKey(now)) {
      freshnessValue = t("freshness.today");
      freshnessOk = true;
    } else if (k === dayKey(new Date(now.getTime() - 86_400_000))) {
      freshnessValue = t("freshness.yesterday");
      freshnessOk = true;
    } else {
      freshnessValue = t("freshness.onDate", {
        date: latest.toLocaleDateString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
      });
    }
  }

  const tiles: {
    key: "readiness" | "freshness" | "activity";
    label: string;
    value: string;
    ok: boolean;
    href: string;
  }[] = [
    {
      key: "readiness",
      label: t("readiness.label"),
      value: t(`readiness.${readiness.level}`),
      ok: readiness.level === "ready",
      href: "#setup-journey",
    },
    {
      key: "freshness",
      label: t("freshness.label"),
      value: freshnessValue,
      ok: freshnessOk,
      href: "/dashboard/journal",
    },
    {
      key: "activity",
      label: t("activity.label"),
      value:
        todayCount > 0 ? t("activity.count", { n: todayCount }) : t("activity.none"),
      ok: todayCount > 0,
      href: "/dashboard/journal",
    },
  ];

  // Same tappable-tile pattern the hub pillars use: the whole tile is the
  // target, with a visible hover/focus affordance. No explanations needed —
  // each tile is one label + one plain value.
  const tileCls =
    "flex min-h-[3.25rem] flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue active:border-brand-blue";

  // S2: the strip and the conversation-first "Mano erdvė" block now share ONE
  // surface grammar — the canonical Card primitive (visual contract v1)
  // instead of a hand-typed surface class. The list itself carries the label
  // and the test id, so the block keeps its accessible name with no extra
  // wrapper element.
  return (
    <Card compact>
      <ul
        className="grid gap-2 sm:grid-cols-3"
        aria-label={t("readiness.label")}
        data-testid="profile-state-strip"
      >
        {tiles.map((tile) => {
          const body = (
            <>
              <span className="flex items-center justify-between gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
                {tile.label}
                <span aria-hidden className="text-text-muted">
                  {tile.href.startsWith("#") ? "↓" : "→"}
                </span>
              </span>
              <span
                data-status={tile.ok ? "ok" : "todo"}
                className={`text-xs font-medium ${
                  tile.ok ? "text-state-success" : "text-text-secondary"
                }`}
              >
                {tile.value}
              </span>
            </>
          );
          return (
            <li key={tile.key}>
              {tile.href.startsWith("#") ? (
                <a
                  href={tile.href}
                  className={tileCls}
                  data-testid={`profile-state-${tile.key}`}
                >
                  {body}
                </a>
              ) : (
                <Link
                  href="/dashboard/journal"
                  className={tileCls}
                  data-testid={`profile-state-${tile.key}`}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
