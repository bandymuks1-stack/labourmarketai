import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { ArrowRight } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { ActionCard } from "@/components/app/action-card";
import { createClient } from "@/lib/supabase/server";
import {
  listDiscoverableOfferings,
  listOutgoingRequests,
  listIncomingRequests,
} from "@/lib/marketplace/service-requests";
import {
  filterByCategory,
  normalizeDiscoveryCategory,
  normalizeDiscoveryCountry,
} from "@/lib/marketplace/service-requests-shared";
import { listOwnServiceOfferings } from "@/lib/services/service-offerings";
import {
  MarketplaceLoopSection,
  type MarketplaceLabels,
} from "@/components/app/marketplace-loop-section";
import { MarkServiceRequestsSeen } from "@/components/app/mark-service-requests-seen";

/**
 * Service requests — P0 marketplace request loop (Phase 1). Authenticated
 * surface: a buyer discovers active service offerings and requests one; sees
 * their outgoing request status; and (as a provider) responds to incoming
 * requests for their own offerings. RLS scopes every row to the caller.
 *
 * NOTE: this is the service-offering request loop, NOT the doctrine-killed
 * job-matching "discover" browse (see matching-ui-neutralized.test.ts). It lives
 * at /dashboard/service-requests and never reintroduces the removed matching UI.
 *
 * Honest degradation: until the owner applies the service_offering_requests
 * migration, the actions return `needs-migration` and the section shows a calm
 * "not available yet" state — never an error, never a fake offering/request.
 */
export default async function ServiceRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  /** Discovery filter (G-E1): `?country=LT&category=buhalterija` — plain GET
   *  params so the URL is the truth and the filter survives a reload. */
  searchParams?: Promise<{ country?: string; category?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    redirect(`/${locale}/auth/login?next=/${locale}/dashboard/service-requests`);

  const sp = (await searchParams) ?? {};
  const country = normalizeDiscoveryCountry(sp.country);
  const category = normalizeDiscoveryCategory(sp.category);

  const t = await getTranslations("marketplace");
  // The caller's OWN offerings are read alongside the loop (RLS-scoped, own
  // rows only) so the provider inbox's empty state can tell the truth: no
  // active service → no request can arrive; N active → nobody asked yet.
  const [disc, out, inc, own] = await Promise.all([
    listDiscoverableOfferings({ country }),
    listOutgoingRequests(),
    listIncomingRequests(),
    listOwnServiceOfferings(),
  ]);
  const needsMigration =
    disc.kind === "needs-migration" ||
    out.kind === "needs-migration" ||
    inc.kind === "needs-migration";
  const ownActive =
    own.kind === "ok" ? own.rows.filter((r) => r.status === "active").length : 0;
  const discoverable = filterByCategory(disc.kind === "ok" ? disc.rows : [], category);
  const filter = {
    country: country ?? "",
    category: category ?? "",
    active: country !== null || category !== null,
  };

  const labels: MarketplaceLabels = {
    notAvailable: t("notAvailable"),
    discoverHeading: t("discoverHeading"),
    discoverEmpty: t("discoverEmpty"),
    request: t("request"),
    requested: t("requested"),
    remoteBadge: t("remoteBadge"),
    outgoingHeading: t("outgoingHeading"),
    outgoingEmpty: t("outgoingEmpty"),
    incomingHeading: t("incomingHeading"),
    incomingEmpty: t("incomingEmpty"),
    // Reuses the existing linkToServices affordance inside the empty state
    // (audit finding F-E2) — no new copy key needed.
    discoverEmptyCta: t("linkToServices"),
    discoverEmptyWhy: t("discoverEmptyWhy"),
    discoverEmptyNext: t("discoverEmptyNext"),
    discoverFilteredEmpty: t("discoverFilteredEmpty"),
    discoverFilteredEmptyCta: t("filterClear"),
    outgoingEmptyWhy: t("outgoingEmptyWhy"),
    incomingEmptyWhy:
      ownActive === 0
        ? t("incomingEmptyNoActive")
        : t("incomingEmptyHasActive", { count: ownActive }),
    incomingEmptyCta: ownActive === 0 ? t("linkToServices") : null,
    filterCountry: t("filterCountry"),
    filterCategory: t("filterCategory"),
    filterApply: t("filterApply"),
    filterClear: t("filterClear"),
    responseNoteLabel: t("responseNoteLabel"),
    responseNotePlaceholder: t("responseNotePlaceholder"),
    accept: t("accept"),
    decline: t("decline"),
    withdraw: t("withdraw"),
    messageCta: t("messageCta"),
    errorGeneric: t("errorGeneric"),
    duplicate: t("duplicate"),
    requesterMessage: t("requesterMessage"),
    providerNote: t("providerNote"),
    responded: t("responded"),
    requestedBy: t("requestedBy"),
    requesterFallback: t("requesterFallback"),
    // Repeat action (Capability G, PR 6b): re-request a concluded outgoing
    // request — a NEW request via the same RPC, previous message prefilled.
    requestAgain: t("requestAgain"),
    requestAgainNote: t("requestAgainNote"),
    cancel: t("cancel"),
    offeringInactive: t("offeringInactive"),
    status: {
      sent: t("status.sent"),
      accepted: t("status.accepted"),
      declined: t("status.declined"),
      withdrawn: t("status.withdrawn"),
    },
  };

  return (
    <div className="flex flex-col gap-4" data-testid="service-requests-page">
      <TelemetryView
        event={FUNNEL_EVENTS.marketplaceOrOpportunitiesViewed}
        metadata={{ surface: "service_requests" }}
      />
      {/* Visiting the loop marks it seen → clears the dashboard "new" markers. */}
      <MarkServiceRequestsSeen />
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{t("pageLead")}</p>
      </header>
      <MarketplaceLoopSection
        discoverable={discoverable}
        outgoing={out.kind === "ok" ? out.rows : []}
        incoming={inc.kind === "ok" ? inc.rows : []}
        needsMigration={needsMigration}
        labels={labels}
        filter={filter}
      />
      {/* Cross-link to the other half of the loop — manage / activate the
          services that make you discoverable here. Quiet, secondary affordance. */}
      <Link
        href={"/dashboard/services" as "/dashboard"}
        data-testid="requests-to-services-link"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-text-muted transition-colors hover:text-brand-blue"
      >
        {t("linkToServices")}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </Link>

      {/* Marketplace connections (§8.4): a request is not a dead end — it links
          onward to matching (find the right people), planning (bookings live
          there; NO automatic accepted-request → booking bridge exists, so the
          copy must never claim one — concept cleanup PR7), map (where), and
          the diary (completed work as fact). Reuses existing canonical routes;
          navigation only, no fake data. */}
      <MarketplaceConnections t={t} />
    </div>
  );
}

/** Compact, mobile-first bridge from the request loop to the rest of the system
 *  (matching / planning / map / diary). Existing routes only — no duplicates. */
function MarketplaceConnections({
  t,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const links = [
    {
      key: "matching",
      href: "/dashboard/opportunities",
      label: t("connections.matching"),
      note: t("connections.matchingNote"),
    },
    {
      key: "calendar",
      href: "/dashboard/bookings",
      label: t("connections.calendar"),
      note: t("connections.calendarNote"),
    },
    {
      key: "map",
      href: "/dashboard/market-map",
      label: t("connections.map"),
      note: t("connections.mapNote"),
    },
    {
      key: "diary",
      href: "/dashboard/journal",
      label: t("connections.diary"),
      note: t("connections.diaryNote"),
    },
  ];
  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid="marketplace-connections"
    >
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t("connections.title")}
      </span>
      <p className="text-xs text-text-secondary">{t("connections.intro")}</p>
      {/* Shared ActionCard pattern (audit PR8) — one visual grammar for
          navigation cards across the app. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {links.map((l) => (
          <ActionCard
            key={l.key}
            href={l.href}
            testid={`marketplace-connection-${l.key}`}
            title={l.label}
            description={l.note}
          />
        ))}
      </div>
    </section>
  );
}
