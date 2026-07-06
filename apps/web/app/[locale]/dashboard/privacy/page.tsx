import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PrivacyDeletionRequest } from "@/components/app/privacy-deletion-request";
import { listMyPrivacyRequests } from "@/lib/privacy/actions";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Privacy self-service v1 (quality-train PR G — gdpr-readiness-v1 §2/§6).
 *
 * Two rights, two honest mechanics:
 * - DATA EXPORT: a real, immediate download of the caller's OWN data
 *   (RLS-scoped reads only — see lib/privacy/export-data.ts). No request
 *   queue needed; the file is generated live from what the user already
 *   owns.
 * - ACCOUNT DELETION: a REQUEST a person reviews — nothing is deleted by
 *   this page, and the copy says so. Until the DRAFT intake migration is
 *   applied the form degrades to a truthful "not available yet".
 */
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacySelfService");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const myRequests = await listMyPrivacyRequests();

  return (
    <div className="flex flex-col gap-5" data-testid="privacy-page">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{t("intro")}</p>
      </header>

      {/* Data export — REAL and immediate: the link streams the caller's own
          data as JSON (RLS-scoped reads, no service role, no other-user data).
          A plain anchor (not Link) because the target is a file download. */}
      <section className="card-border p-5" data-testid="privacy-export">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("export.title")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text-primary">
          {t("export.body")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          {t("export.includes")}
        </p>
        <a
          href={`/${locale}/dashboard/privacy/export`}
          data-testid="privacy-export-download"
          className="mt-3 inline-flex min-h-11 w-fit items-center rounded-md border border-brand-blue/40 px-4 text-sm font-medium text-brand-blue hover:border-brand-blue"
        >
          {t("export.download")}
        </a>
      </section>

      {/* Account deletion — a reviewed REQUEST, never an instant destructive
          action. The honest mechanics are stated in the copy. */}
      <section className="card-border p-5" data-testid="privacy-deletion">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("deletion.title")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text-primary">
          {t("deletion.body")}
        </p>
        <div className="mt-3">
          <PrivacyDeletionRequest
            labels={{
              confirmLabel: t("deletion.confirmLabel"),
              noteLabel: t("deletion.noteLabel"),
              submit: t("deletion.submit"),
              submitted: t("deletion.submitted"),
              submittedBody: t("deletion.submittedBody"),
              unavailable: t("deletion.unavailable"),
              tooManyOpen: t("deletion.tooManyOpen"),
              error: t("deletion.error"),
            }}
          />
        </div>
      </section>

      {/* The caller's own privacy requests — real rows or nothing. */}
      {myRequests.length > 0 && (
        <section className="card-border p-5" data-testid="privacy-requests-list">
          <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
            {t("requests.title")}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {myRequests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-500 px-3 py-2 text-sm"
              >
                <span className="text-text-primary">
                  {r.type === "data_export"
                    ? t("requests.type.data_export")
                    : r.type === "account_deletion"
                      ? t("requests.type.account_deletion")
                      : r.type}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {r.createdAt.slice(0, 10)}
                  </span>
                  <span className="rounded-sm border border-ink-500 bg-ink-800/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-text-secondary">
                    {t.has(`requests.status.${r.status}` as never)
                      ? t(`requests.status.${r.status}` as never)
                      : r.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/dashboard/account"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-text-muted transition-colors hover:text-brand-blue"
      >
        ← {t("backToAccount")}
      </Link>
    </div>
  );
}
