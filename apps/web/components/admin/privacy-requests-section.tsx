import { getTranslations } from "next-intl/server";

import { listPrivacyRequestQueue } from "@/lib/admin/privacy-requests";
import { formatUtcDateTime } from "@/lib/time/display";

/**
 * Privacy requests — an admin VISIBILITY queue (V8 W4-C item 2).
 *
 * Export/deletion requests used to reach operators only inside the
 * labour-demand matching workbench, mixed with hiring needs. This section
 * lists them on the admin control room as what they are. NO processing
 * controls — the executor does not exist yet and a control that delivers
 * nowhere is a fake control; the note says processing is manual.
 *
 * Server component on the superadmin-gated admin page (the layout runs
 * requireSuperadmin for the whole subtree).
 */
export async function PrivacyRequestsSection({ locale }: { locale: string }) {
  const t = await getTranslations("admin.privacyRequests");
  const result = await listPrivacyRequestQueue();

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="admin-privacy-requests"
      aria-labelledby="admin-privacy-requests-heading"
    >
      <header className="flex flex-col gap-1">
        <h2
          id="admin-privacy-requests-heading"
          className="font-display text-xl font-bold tracking-tightest text-text-primary"
        >
          {t("title")}
        </h2>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      {result.kind === "needs-migration" ? (
        <p className="rounded-md border border-ink-500 bg-ink-800/30 p-4 text-sm text-text-secondary">
          {t("needsMigration")}
        </p>
      ) : result.kind === "error" ? (
        <p className="rounded-md border border-ink-500 bg-ink-800/30 p-4 text-sm text-text-secondary">
          {t("unavailable")}
        </p>
      ) : result.rows.length === 0 ? (
        <p
          className="rounded-md border border-ink-500 bg-ink-800/30 p-4 text-sm text-text-secondary"
          data-testid="admin-privacy-requests-empty"
        >
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border border-ink-500 bg-ink-800/30 p-3"
              data-testid={`admin-privacy-request-${r.id}`}
            >
              <span className="text-sm font-semibold text-text-primary">
                {t(
                  r.type === "data_export"
                    ? "type.dataExport"
                    : r.type === "account_deletion"
                      ? "type.accountDeletion"
                      : "type.unknown",
                )}
              </span>
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {r.status}
              </span>
              <span className="font-mono text-meta text-text-muted">
                {formatUtcDateTime(r.createdAtIso, locale)}
              </span>
              <span className="min-w-0 break-all font-mono text-meta text-text-muted">
                {r.email ?? r.profileId?.slice(0, 8) ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* The honest boundary: nothing on this list ACTS. */}
      <p className="text-meta text-text-muted" data-testid="admin-privacy-requests-note">
        {t("manualNote")}
      </p>
    </section>
  );
}
