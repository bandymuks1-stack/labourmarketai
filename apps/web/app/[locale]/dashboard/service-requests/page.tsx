import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { ArrowRight } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  listDiscoverableOfferings,
  listOutgoingRequests,
  listIncomingRequests,
} from "@/lib/marketplace/service-requests";
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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    redirect(`/${locale}/auth/login?next=/${locale}/dashboard/service-requests`);

  const t = await getTranslations("marketplace");
  const [disc, out, inc] = await Promise.all([
    listDiscoverableOfferings(),
    listOutgoingRequests(),
    listIncomingRequests(),
  ]);
  const needsMigration =
    disc.kind === "needs-migration" ||
    out.kind === "needs-migration" ||
    inc.kind === "needs-migration";

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
    accept: t("accept"),
    decline: t("decline"),
    withdraw: t("withdraw"),
    errorGeneric: t("errorGeneric"),
    duplicate: t("duplicate"),
    requesterMessage: t("requesterMessage"),
    providerNote: t("providerNote"),
    responded: t("responded"),
    requestedBy: t("requestedBy"),
    requesterFallback: t("requesterFallback"),
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
        discoverable={disc.kind === "ok" ? disc.rows : []}
        outgoing={out.kind === "ok" ? out.rows : []}
        incoming={inc.kind === "ok" ? inc.rows : []}
        needsMigration={needsMigration}
        labels={labels}
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

      {/* Marketplace connections (§8.4): a request/order is not a dead end — it
          flows to matching (find the right people), calendar (a confirmed order
          becomes a booking), map (where), and the diary (completed work as
          fact). Reuses existing canonical routes; navigation only, no fake data. */}
      <MarketplaceConnections t={t} />
    </div>
  );
}

/** Compact, mobile-first bridge from the order loop to the rest of the system
 *  (matching / calendar / map / diary). Existing routes only — no duplicates. */
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
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("connections.title")}
      </span>
      <p className="text-xs text-text-secondary">{t("connections.intro")}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {links.map((l) => (
          <Link
            key={l.key}
            href={l.href as "/dashboard"}
            data-testid={`marketplace-connection-${l.key}`}
            className="flex min-h-[3.25rem] flex-col rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-sm text-text-primary transition-colors hover:border-brand-blue"
          >
            <span className="font-semibold">{l.label}</span>
            <span className="text-xs text-text-muted">{l.note}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
