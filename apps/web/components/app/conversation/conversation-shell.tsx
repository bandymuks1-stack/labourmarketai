"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Search } from "lucide-react";
import { Link, useRouter } from "@/lib/i18n/navigation";
import {
  matchCommands,
  type CommandAudience,
} from "@/lib/navigation/command-registry";
import type { ActiveLocale } from "@/lib/i18n/config";
import type { ConfirmationTier } from "@/lib/conversation/action-registry";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import {
  WorkerBookingAction,
  type BookingActionLabels,
} from "@/components/app/conversation/worker-booking-action";
import { InlineActionForm } from "@/components/app/conversation/inline-action-form";
import { OpportunitiesShownMarker } from "@/components/app/marketplace/opportunities-shown-marker";
import { WorkerCvFlow } from "@/components/app/conversation/worker-cv-flow";
import { getWorkerForm, type WorkerFormSpec } from "@/lib/conversation/worker-forms";
import type { WorkerActivity } from "@/lib/conversation/worker-activity";

/** A worker's incoming booking offer, executed inline in the shell. */
export type BookingOffer = {
  bookingId: string;
  title: string; // roleText (may be empty → generic offer label used)
  subtitle: string | null; // period line
};

/** One opportunity the conversation puts in front of the worker. Every field
 *  is already localized and already explained by the server through the
 *  canonical marketplace use case — the shell never ranks, never scores and
 *  never invents a company or a need. */
export type ConversationMatch = {
  requestId: string;
  title: string;
  /** Location / start line, or null when the demand states neither. */
  metaLine: string | null;
  /** §19 canonical basis — matched/total counts WITH the confirmed share.
   *  A bare percentage or an aggregate "AI score" must never appear here. */
  basisLine: string;
  isNew: boolean;
};

/** Localized chrome for the matches block (null when there is nothing to show). */
export type ConversationMatchLabels = {
  title: string;
  newBadge: string;
  viewAll: string;
  boardRoute: string;
};

/** Serializable view of a registry action passed from the server page. */
export type ShellAction = {
  id: string;
  subject: string;
  labelKey: string; // e.g. "conversation.actions.worker.uploadCv.label"
  descriptionKey: string;
  confirmation: ConfirmationTier;
  advancedRoute: string; // locale-prefix-free
};

/** A tiny visual weight cue so the user can tell a light action from a
 *  strong one BEFORE opening it. Every card here is a proposal that opens the
 *  real screen — nothing is executed from this list (§10: proposed vs done). */
const TIER_DOT: Record<ConfirmationTier, string> = {
  read: "bg-text-muted",
  reversible_write: "bg-brand-blue",
  important_write: "bg-brand-orange",
  strong_irreversible: "bg-state-danger",
};

/**
 * Conversation Shell (foundation v1) — the deterministic, conversation-first
 * entry surface. It NEVER executes a write itself: it routes the user to the
 * canonical screen that performs each action (Advanced mode), using the
 * existing command registry for free-text intent. Fully functional with the
 * LLM disabled (its production state). Mobile-first, one clear focus.
 */
export function ConversationShell({
  locale,
  audiences,
  suggested,
  continueHref,
  continueLabel,
  bookingOffers = [],
  bookingLabels = null,
  activity = null,
  matches = [],
  matchLabels = null,
}: {
  locale: ActiveLocale;
  audiences: CommandAudience[];
  suggested: ShellAction[];
  /** Canonical next step (from next-action) — locale-prefix-free, or null. */
  continueHref: string | null;
  /** Human label for the continue step (already localized), or null. */
  continueLabel: string | null;
  /** Incoming booking offers to accept/decline inline (worker). */
  bookingOffers?: BookingOffer[];
  /** Localized labels for the inline booking flow (null when no offers). */
  bookingLabels?: BookingActionLabels | null;
  /** Worker activity + completeness (worker only), or null. */
  activity?: WorkerActivity | null;
  /** Opportunities to show in the conversation — from the canonical
   *  marketplace use case, already ranked and explained. */
  matches?: ConversationMatch[];
  /** Localized chrome for the matches block (null when there is none). */
  matchLabels?: ConversationMatchLabels | null;
}) {
  const t = useTranslations("conversation.shell");
  const tActions = useTranslations("conversation.actions");
  const tJournal = useTranslations("conversation.journal");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeForm, setActiveForm] = useState<WorkerFormSpec | null>(null);
  const [showCv, setShowCv] = useState(false);

  const audienceSet = useMemo(
    () => new Set<CommandAudience>(audiences),
    [audiences],
  );
  const results = useMemo(() => {
    if (query.trim().length === 0) return [];
    return matchCommands(query, locale, audienceSet);
  }, [query, locale, audienceSet]);

  function go(route: string, event: (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS]) {
    trackFunnel(event, { surface: "conversation" });
    router.push(route);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("greeting")}</p>
      </header>

      {/* Profile completeness — server-derived from the worker's own rows */}
      {activity && (
        <div className="flex flex-col gap-1.5" data-testid="conversation-completeness">
          <div className="flex items-center justify-between text-[11px] text-text-muted">
            <span>{tJournal("completeness", { pct: activity.completenessPct })}</span>
            <span className="font-mono">
              {activity.stepsDone}/{activity.stepsTotal}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
            <div
              className="h-full rounded-full bg-brand-blue transition-all"
              style={{ width: `${activity.completenessPct}%` }}
              role="progressbar"
              aria-valuenow={activity.completenessPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      )}

      {/* Command input — deterministic intent via the existing command registry */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 rounded-lg border border-ink-500 bg-ink-800 px-3 py-2.5 focus-within:border-brand-blue">
          <Search className="h-4 w-4 flex-none text-text-muted" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("commandPlaceholder")}
            aria-label={t("commandPlaceholder")}
            data-testid="conversation-command-input"
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </label>
        {query.trim().length > 0 && (
          <ul className="flex flex-col gap-1" data-testid="conversation-command-results">
            {results.length === 0 ? (
              <li className="px-1 py-2 text-xs text-text-muted">{t("noResults")}</li>
            ) : (
              results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => go(c.route, FUNNEL_EVENTS.ctaClicked)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-ink-600 px-3 py-2 text-left text-sm text-text-primary hover:border-brand-blue"
                  >
                    <span>{c.labels[locale]}</span>
                    <ArrowRight className="h-3.5 w-3.5 flex-none text-text-muted" aria-hidden />
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {/* Continue where you left off — the canonical next step */}
      {continueHref && continueLabel && (
        <section className="flex flex-col gap-2" data-testid="conversation-continue">
          <h2 className="font-mono text-[11px] uppercase tracking-label text-text-muted">
            {t("continueTitle")}
          </h2>
          <button
            type="button"
            onClick={() => go(continueHref, FUNNEL_EVENTS.firstActionCardClicked)}
            className="flex items-center justify-between gap-3 rounded-lg border border-brand-blue/40 bg-brand-blue/5 px-4 py-3 text-left hover:border-brand-blue"
          >
            <span className="text-sm font-semibold text-text-primary">{continueLabel}</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue">
              {t("continueCta")} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </button>
        </section>
      )}

      {/* Needs your response — incoming booking offers, executed inline */}
      {bookingOffers.length > 0 && bookingLabels && (
        <section className="flex flex-col gap-2" data-testid="conversation-booking-offers">
          <h2 className="font-mono text-[11px] uppercase tracking-label text-brand-orange">
            {t("needsResponseTitle")}
          </h2>
          <div className="flex flex-col gap-2">
            {bookingOffers.map((o) => (
              <WorkerBookingAction
                key={o.bookingId}
                bookingId={o.bookingId}
                locale={locale}
                title={o.title || bookingLabels.offerFrom}
                subtitle={o.subtitle}
                labels={bookingLabels}
              />
            ))}
          </div>
        </section>
      )}

      {/* Opportunities, IN the conversation. Same canonical marketplace use
          case, same ranking, same §19 explanations and the same shown-state
          contract as the structured board — the conversation is not allowed a
          marketplace of its own (canonical decision:
          CONVERSATION_AND_UI_SHARE_DOMAIN_USE_CASES). */}
      {matches.length > 0 && matchLabels && (
        <section className="flex flex-col gap-2" data-testid="conversation-matches">
          {/* Rendering IS the read event — exactly these rows, nothing more. */}
          <OpportunitiesShownMarker
            surface="conversation"
            requestIds={matches.map((m) => m.requestId)}
          />
          <h2 className="font-mono text-[11px] uppercase tracking-label text-text-muted">
            {matchLabels.title}
          </h2>
          <ul className="flex flex-col divide-y divide-border/40">
            {matches.map((m) => (
              <li key={m.requestId} className="py-2 first:pt-0 last:pb-0">
                <Link
                  href={matchLabels.boardRoute as "/dashboard"}
                  data-testid={`conversation-match-${m.requestId}`}
                  className="flex flex-col gap-0.5 rounded-md p-1 transition-colors hover:bg-ink-800/40"
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-text-primary">
                      {m.title}
                    </span>
                    {m.isNew && (
                      <span
                        className="rounded-full bg-brand-cyan/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-brand-cyan"
                        data-testid="conversation-match-new"
                      >
                        {matchLabels.newBadge}
                      </span>
                    )}
                  </span>
                  {m.metaLine && (
                    <span className="text-xs text-text-muted">{m.metaLine}</span>
                  )}
                  <span
                    className="text-xs text-text-secondary"
                    data-testid="conversation-match-basis"
                  >
                    {m.basisLine}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={matchLabels.boardRoute as "/dashboard"}
            data-testid="conversation-matches-view-all"
            className="w-fit text-xs font-medium text-brand-blue hover:underline"
          >
            {matchLabels.viewAll} →
          </Link>
        </section>
      )}

      {/* CV import — runs inline in the conversation (deterministic parse). */}
      {showCv && (
        <section>
          <WorkerCvFlow onClose={() => setShowCv(false)} />
        </section>
      )}

      {/* Inline action form — a form-backed action runs IN the conversation. */}
      {activeForm && (
        <section data-testid="conversation-active-form">
          <InlineActionForm spec={activeForm} locale={locale} onClose={() => setActiveForm(null)} />
        </section>
      )}

      {/* Suggested actions for this person's roles */}
      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("suggestedTitle")}
        </h2>
        {suggested.length === 0 ? (
          <p className="text-sm text-text-muted">{t("nothingPending")}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="conversation-suggested">
            {suggested.map((a) => {
              const form = getWorkerForm(a.id);
              const inlineable = Boolean(form) || a.id === "worker.upload-cv";
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      trackFunnel(FUNNEL_EVENTS.ctaClicked, { surface: "conversation" });
                      if (a.id === "worker.upload-cv") {
                        setShowCv(true);
                        setActiveForm(null);
                      } else if (form) {
                        setActiveForm(form);
                        setShowCv(false);
                      } else {
                        go(a.advancedRoute, FUNNEL_EVENTS.ctaClicked);
                      }
                    }}
                    data-testid={`conversation-action-${a.id}`}
                    className="flex w-full items-start justify-between gap-3 rounded-lg border border-ink-600 bg-surface-1/40 px-4 py-3 text-left hover:border-brand-blue"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                        <span
                          aria-hidden
                          className={`inline-block size-2 flex-none rounded-full ${TIER_DOT[a.confirmation]}`}
                        />
                        {tActions(`${a.subject}.${keyTail(a.labelKey)}.label`)}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {tActions(`${a.subject}.${keyTail(a.labelKey)}.description`)}
                      </span>
                    </span>
                    <span className="mt-0.5 inline-flex flex-none items-center gap-1 text-xs font-semibold text-brand-blue">
                      {inlineable ? t("openHere") : t("openAdvanced")}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Work journal — human-readable activity from the worker's own rows */}
      {activity && activity.events.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="conversation-journal">
          <h2 className="font-mono text-[11px] uppercase tracking-label text-text-muted">
            {tJournal("title")}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {activity.events.map((e) => (
              <li
                key={`${e.key}-${e.at}`}
                className="flex items-center justify-between gap-3 rounded-md border border-ink-600 px-3 py-2 text-sm"
              >
                <span className="text-text-primary">{tJournal(`events.${e.key}`)}</span>
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {new Date(e.at).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Advanced mode — always available, never hidden */}
      <section className="flex items-center justify-between gap-3 rounded-lg border border-ink-600 px-4 py-3">
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-text-primary">{t("advancedToggle")}</span>
          <span className="text-xs text-text-muted">{t("advancedHint")}</span>
        </span>
        <Link
          href="/dashboard"
          data-testid="conversation-advanced-link"
          className="inline-flex flex-none items-center gap-1 rounded-md border border-ink-500 px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-brand-blue"
        >
          {t("openAdvanced")} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </section>

      <p className="text-[11px] leading-relaxed text-text-muted">{t("previewNote")}</p>
    </div>
  );
}

/** "conversation.actions.worker.uploadCv.label" → "uploadCv" */
function keyTail(labelKey: string): string {
  const parts = labelKey.split(".");
  // .../<subject>/<name>/label → name is second-to-last
  return parts[parts.length - 2] ?? "";
}
