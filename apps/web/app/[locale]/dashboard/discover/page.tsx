import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PublicJobPostingsList } from "@/components/app/public-job-postings-list";
import { listOpenPublicJobPostings } from "@/lib/job-postings/job-postings-public";
import { createClient } from "@/lib/supabase/server";

/**
 * Worker job discovery v1 (Sprint A2).
 *
 * Lists the most recent open + public job_demands. The job_demands
 * SELECT RLS policy gates the rows to status='open' AND
 * visibility='public' for any non-owner authenticated user, so a
 * worker session sees exactly the postings companies have made
 * publicly browseable.
 *
 * Honest framing: ranking is purely chronological (no fabricated
 * relevance score), there is no "send your CV" affordance yet, and
 * the empty state says so explicitly. Match-action UI lives in a
 * later sprint behind the cleanroom-gated approval bridge.
 */
export default async function DiscoverPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Server-side auth check before any DB read — mirrors the pattern
  // the other dashboard pages use. Unauthenticated visits redirect
  // to login rather than render an empty placeholder.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations("auth.dashboard");
  const td = await getTranslations("jobDiscovery");

  const result = await listOpenPublicJobPostings({ limit: 12 });
  const rows = result.ok ? result.data : [];
  const errorMsg = result.ok ? null : result.message;

  return (
    <div className="flex flex-col gap-6" data-testid="discover-page">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("tabs.discover")}
        </h1>
        <p className="text-sm text-text-secondary">{td("page.subtitle")}</p>
      </header>

      <section
        className="card-border flex flex-col gap-4 p-6"
        data-testid="discover-public-postings"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {td("list.title")}
          </h2>
          <p className="text-sm text-text-secondary">{td("list.body")}</p>
        </header>
        {errorMsg && (
          <p
            className="rounded border border-state-error bg-state-error/10 px-3 py-2 text-sm text-state-error"
            role="alert"
            data-testid="discover-public-postings-error"
          >
            {errorMsg}
          </p>
        )}
        <PublicJobPostingsList rows={rows} />
      </section>
    </div>
  );
}
