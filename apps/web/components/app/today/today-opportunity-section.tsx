import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { FIT_BAND_ORDER } from "@/lib/opportunities/fit-band";
import { deriveTodayOpportunity } from "@/lib/today/today-model";
import { loadTodayOpportunities } from "@/lib/today/today-server";

/**
 * ŠIANDIEN · one opportunity sentence.
 *
 * The rows are the SAME projection the conversation's opportunities result
 * renders (`loadOpportunitiesResultAction`); the band of every row is the
 * engine's own verdict (`deriveFitBand`, lane D). This section counts them
 * per band and says so in one sentence — the destination with the rows and
 * their WHY is PASAULIS (`/dashboard/opportunities`).
 *
 * DISCOVERY-ONLY (nothing assessed as a fit) heads itself with the same
 * "found postings (not yet assessed)" title the result panel uses, never
 * "jobs that fit you" over unassessed rows. The three ways the read can be
 * absent — no worker row, the board unavailable, a failed read — are three
 * distinct sentences, never an empty line.
 */
export async function TodayOpportunitySection() {
  const [t, tResults, view] = await Promise.all([
    getTranslations("todayScreen.home"),
    getTranslations("conversation.results"),
    loadTodayOpportunities(),
  ]);
  const o = deriveTodayOpportunity(view);

  let line: string;
  switch (o.kind) {
    case "bands": {
      const parts = FIT_BAND_ORDER.filter((band) => o.counts[band] > 0).map((band) =>
        t(`opportunity.band.${band}`, { n: o.counts[band] }),
      );
      if (o.more > 0) parts.push(t("opportunity.more", { n: o.more }));
      line = parts.join(" · ");
      break;
    }
    case "none":
      line = t("opportunity.none");
      break;
    case "no-worker":
      line = t("opportunity.noWorker");
      break;
    case "unavailable":
      line = t("opportunity.unavailable");
      break;
    case "unknown":
      line = t("opportunity.unknown");
      break;
  }

  return (
    <section
      aria-labelledby="today-opportunity-title"
      data-testid="today-opportunity"
      data-state={o.kind}
      data-discovery-only={o.kind === "bands" && o.discoveryOnly ? "true" : undefined}
      className="flex flex-col gap-2"
    >
      <h2
        id="today-opportunity-title"
        className="font-mono text-meta uppercase tracking-label text-text-muted"
      >
        {o.kind === "bands" && o.discoveryOnly
          ? tResults("opportunities.titleDiscovery")
          : t("opportunity.title")}
      </h2>
      <p className="text-body text-text-primary" data-testid="today-opportunity-line">
        {line}
      </p>
      <Link
        href="/dashboard/opportunities"
        data-testid="today-opportunity-open"
        className="inline-flex min-h-11 items-center self-start text-support font-medium text-brand-blue underline-offset-4 hover:underline"
      >
        {t("opportunity.open")} →
      </Link>
    </section>
  );
}
