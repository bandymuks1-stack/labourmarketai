import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { type Role } from "@/lib/auth/actions";
import {
  workerNextAction,
  managerNextAction,
  customerNextAction,
  type NextAction,
} from "@/lib/dashboard/next-action";
import {
  actionsForRoles,
  type ConversationActionDescriptor,
} from "@/lib/conversation/action-registry";
import {
  ConversationShell,
  type ShellAction,
  type BookingOffer,
  type ConversationMatch,
  type ConversationMatchLabels,
} from "@/components/app/conversation/conversation-shell";
import { loadWorkerOpportunityMatches } from "@/lib/marketplace/worker-opportunities";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";
import type { BookingActionLabels } from "@/components/app/conversation/worker-booking-action";
import { listMyBookings } from "@/lib/booking/booking-actions";
import { getWorkerActivity, type WorkerActivity } from "@/lib/conversation/worker-activity";
import type { CommandAudience } from "@/lib/navigation/command-registry";
import type { ActiveLocale } from "@/lib/i18n/config";

/**
 * Conversation-first control surface (foundation v1). A deterministic,
 * role-aware entry that reuses the canonical next-action engine + command
 * registry and routes to the existing Advanced-mode screens. No LLM, no new
 * data system, no migration. See docs/architecture/CONVERSATION_CONTROL_ARCHITECTURE_v1.md.
 */
export default async function AssistantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const session = await getSessionProfile();
  const activeRole = (session.profile?.active_role as Role | null) ?? "worker";

  // Held roles (catalogue) — RLS-scoped. Default to the active role on any read
  // issue so the surface still renders honestly.
  let heldRoles = new Set<Role>([activeRole]);
  try {
    const { data: rows } = await supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id)
      .eq("is_active", true);
    const set = new Set<Role>((rows ?? []).map((r) => r.role as Role));
    if (set.size > 0) heldRoles = set;
  } catch {
    /* keep the active-role default */
  }

  // Command-finder audiences derived from held roles (display-only filter).
  const audiences: CommandAudience[] = ["public"];
  if (heldRoles.has("worker")) audiences.push("worker");
  if (heldRoles.has("company") || heldRoles.has("agency")) audiences.push("company");

  // Canonical "continue where you left off" — derived, never a new store.
  const { href: continueHref, label: continueLabel } = await deriveContinue(
    supabase,
    user.id,
    activeRole,
  );

  // Suggested actions: role-filtered registry, active-role subject first, capped.
  const forRoles = actionsForRoles(heldRoles);
  const ordered = [...forRoles].sort(
    (a, b) => rank(a, activeRole) - rank(b, activeRole),
  );
  const suggested: ShellAction[] = ordered.slice(0, 8).map((a) => ({
    id: a.id,
    subject: a.subject,
    labelKey: a.labelKey,
    descriptionKey: a.descriptionKey,
    confirmation: a.confirmation,
    advancedRoute: a.advancedRoute,
  }));

  // Actionable, conversation-first booking offers (worker only) — the highest
  // priority "needs your response" items, executed inline via the dispatcher.
  const { offers: bookingOffers, labels: bookingLabels } = await loadBookingOffers(
    activeRole,
    heldRoles,
  );

  // Human-readable activity + profile completeness (worker) — derived from the
  // worker's own canonical rows (server-derived continuity, no new store).
  const activity: WorkerActivity | null =
    activeRole === "worker" && heldRoles.has("worker")
      ? await getWorkerActivity(user.id)
      : null;

  // Opportunities IN the conversation — through the canonical marketplace use
  // case, so the conversation shows the same ranked, §19-explained matches as
  // the structured board and reports the same shown-state.
  const { matches, matchLabels } = await loadConversationMatches(
    locale,
    activeRole,
    heldRoles,
  );

  return (
    <ConversationShell
      locale={locale as ActiveLocale}
      audiences={audiences}
      suggested={suggested}
      continueHref={continueHref}
      continueLabel={continueLabel}
      bookingOffers={bookingOffers}
      bookingLabels={bookingLabels}
      activity={activity}
      matches={matches}
      matchLabels={matchLabels}
    />
  );
}

/** Top opportunities for the conversation, straight from the canonical
 *  marketplace use case. The conversation does NOT load, filter, rank or
 *  explain anything of its own — it renders what the use case returned and the
 *  shell reports exactly those rows as shown.
 *
 *  Honest empties: no worker, an unapplied worker-visibility RPC, or zero
 *  recommendable matches all yield no block at all rather than an empty state
 *  claiming something about data that cannot exist yet. */
async function loadConversationMatches(
  locale: string,
  activeRole: Role,
  heldRoles: ReadonlySet<Role>,
): Promise<{
  matches: ConversationMatch[];
  matchLabels: ConversationMatchLabels | null;
}> {
  if (!heldRoles.has("worker") || activeRole !== "worker") {
    return { matches: [], matchLabels: null };
  }
  const view = await loadWorkerOpportunityMatches({
    surface: "conversation",
    limit: CONVERSATION_MATCH_LIMIT,
  });
  if (view.kind !== "ready" || !view.capabilities.boardAvailable) {
    return { matches: [], matchLabels: null };
  }
  if (view.matches.length === 0) return { matches: [], matchLabels: null };

  const tCard = await getTranslations("auth.dashboard.jobsCard");
  const tRec = await getTranslations("opportunities.recommendations");
  const tOpp = await getTranslations("opportunities");
  const tlm = await getTranslations("labourMarket");
  const workLabels = buildWorkTypeLabelMap(locale);

  const matches: ConversationMatch[] = view.matches.map((m) => {
    const country =
      m.country && tlm.has(`countryNames.${m.country}`)
        ? tlm(`countryNames.${m.country}`)
        : m.country;
    const start =
      m.startPeriod && tOpp.has(`urgency.${m.startPeriod}`)
        ? (tOpp(`urgency.${m.startPeriod}` as never) as string)
        : null;
    const metaLine =
      [m.locationLabel, country, start].filter(Boolean).join(" · ") || null;
    return {
      requestId: m.requestId,
      title: (m.roleSlug && workLabels[m.roleSlug]) || tOpp("fieldRoleUnknown"),
      metaLine,
      // §19: counts + confirmed share together, never a bare % and never a
      // person-level score.
      basisLine: tRec("basisCompact", {
        matched: m.basis.matchedTotal,
        total: m.basis.needTotal,
        confirmed: m.basis.matchedConfirmed,
      }),
      isNew: m.isNew,
    };
  });

  return {
    matches,
    matchLabels: {
      title: tCard("title"),
      newBadge: tRec("newBadge"),
      viewAll: tCard("viewAll"),
      boardRoute: "/dashboard/opportunities",
    },
  };
}

/** How many opportunities the conversation shows before deferring to the
 *  board. Kept small on purpose: the conversation is the primary work journal,
 *  not a listing screen. */
const CONVERSATION_MATCH_LIMIT = 3;

/** Load the worker's incoming PROPOSED booking offers + their localized labels.
 *  Empty (and labels null) for non-workers or on any read issue — honest empty. */
async function loadBookingOffers(
  activeRole: Role,
  heldRoles: ReadonlySet<Role>,
): Promise<{ offers: BookingOffer[]; labels: BookingActionLabels | null }> {
  if (!heldRoles.has("worker") || activeRole !== "worker") {
    return { offers: [], labels: null };
  }
  let offers: BookingOffer[] = [];
  try {
    const res = await listMyBookings();
    if (res.kind === "ok") {
      offers = res.incoming
        .filter((b) => b.status === "proposed")
        .slice(0, 5)
        .map((b) => {
          const period =
            b.startDate || b.expectedEndDate
              ? [b.startDate, b.expectedEndDate].filter(Boolean).join(" — ")
              : null;
          return {
            bookingId: b.id,
            title: b.roleText ?? "",
            subtitle: period,
          };
        });
    }
  } catch {
    return { offers: [], labels: null };
  }
  if (offers.length === 0) return { offers: [], labels: null };

  const tB = await getTranslations("bookings.actions");
  const tC = await getTranslations("conversation.booking");
  const labels: BookingActionLabels = {
    offerFrom: tC("offerTitle"),
    period: "{start} — {end}",
    accept: tB("accept"),
    decline: tB("decline"),
    confirmAcceptTitle: tC("confirmAcceptTitle"),
    confirmAcceptBody: tC("confirmAcceptBody"),
    confirmDeclineTitle: tC("confirmDeclineTitle"),
    confirmCta: tC("confirmCta"),
    cancelCta: tC("cancelCta"),
    working: tC("working"),
    acceptedResult: tB("accepted"),
    declinedResult: tB("declined"),
    errorGeneric: tB("error"),
    errorStale: tC("errorStale"),
    errorConflict: tB("conflict"),
  };
  return { offers, labels };
}

/** Sort key: the active role's own actions first, reads before writes within. */
function rank(a: ConversationActionDescriptor, active: Role): number {
  const subjectRank = a.subject === active ? 0 : 1;
  const tierRank =
    a.confirmation === "read" ? 0 : a.confirmation === "reversible_write" ? 1 : 2;
  return subjectRank * 10 + tierRank;
}

/** Best-effort derivation of the canonical next step. Everything is wrapped so a
 *  read failure degrades to "no continue card" rather than an error page. */
async function deriveContinue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  activeRole: Role,
): Promise<{ href: string | null; label: string | null }> {
  let action: NextAction | null = null;
  try {
    if (activeRole === "worker") {
      const { data: worker } = await supabase
        .from("workers")
        .select("id")
        .eq("profile_id", userId)
        .maybeSingle();
      const hasProfile = !!worker?.id;
      let entriesTotal = 0;
      if (worker?.id) {
        const { count } = await supabase
          .from("journal_entries")
          .select("id", { count: "exact", head: true })
          .eq("worker_id", worker.id);
        entriesTotal = count ?? 0;
      }
      // confirmedCount defaults to entriesTotal so we never falsely show a
      // "waiting for a human" step from this lightweight surface.
      action = workerNextAction({ hasProfile, entriesTotal, confirmedCount: entriesTotal });
    } else if (activeRole === "company" || activeRole === "agency") {
      action = managerNextAction(activeRole, 0);
    } else {
      action = customerNextAction();
    }
  } catch {
    return { href: null, label: null };
  }
  if (!action) return { href: null, label: null };
  try {
    const t = await getTranslations("auth.dashboard.nextAction");
    return { href: action.href, label: t(`${action.key}.title`) };
  } catch {
    return { href: action.href, label: null };
  }
}
