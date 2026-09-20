import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listImportSessions } from "@/lib/organization-evidence/import-core";
import { formatUtcDate } from "@/lib/time/display";

/**
 * "YOUR IMPORTS" — the list the history door was missing (2026-09-20).
 *
 * A staged or committed import used to be reachable only by its
 * `?evidenceSession=` bookmark; the door showed the upload form and nothing
 * else. This lists the acting organization's sessions (newest 20, RLS-
 * scoped, through the one core read) with the source's name, when it was
 * read and its derived status — each a link back into the same section.
 * No row contents, no people: a list of sources, not a second history view.
 *
 * Honest states: a failed read is said (`unavailable`), never an empty
 * list; an organization that has not imported yet reads an honest empty
 * line. The list is bounded and says nothing about what lies past it.
 */
export async function EvidenceImportSessions({
  locale,
  activeSessionId = null,
}: {
  locale: string;
  /** The session the door is currently showing (marked, not repeated). */
  activeSessionId?: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const t = await getTranslations("organizationDoors.pages.history.imports");
  const tKind = await getTranslations("evidenceImport.sourceKind");
  const res = await listImportSessions({ supabase, userId: user.id, locale });

  if (res.kind !== "ok") {
    // Not a member of any organization here is not a list to show; every
    // other failure is a failed READ and is said as one.
    if (res.kind === "choice-required" || res.kind === "not-authorized") return null;
    return (
      <p
        className="text-meta leading-relaxed text-text-muted"
        data-testid="company-history-imports-unavailable"
      >
        {t("unavailable")}
      </p>
    );
  }

  return (
    <section
      className="flex flex-col gap-2"
      aria-label={t("title")}
      data-testid="company-history-imports"
      data-count={res.sessions.length}
    >
      <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t("title")}
      </h2>
      {res.sessions.length === 0 ? (
        <p className="text-sm text-text-muted" data-testid="company-history-imports-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {res.sessions.map((s) => {
            const name =
              s.sourceFilename ??
              s.sourceReference ??
              (tKind.has(s.sourceKind as never) ? tKind(s.sourceKind as never) : s.sourceKind);
            const when = formatUtcDate(s.createdAt, locale);
            const active = s.id === activeSessionId;
            return (
              <li key={s.id}>
                <Link
                  href={`/dashboard/company/history?evidenceSession=${s.id}#evidence-import-zone` as "/dashboard"}
                  data-testid="company-history-import"
                  data-session={s.id}
                  data-status={s.status}
                  aria-current={active ? "true" : undefined}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                    active
                      ? "border-brand-blue bg-brand-blue/10"
                      : "border-ink-600 bg-ink-800/40 hover:border-brand-blue"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{name}</span>
                  {when ? (
                    <span className="font-mono text-meta text-text-muted">{when}</span>
                  ) : null}
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${
                      s.status === "committed"
                        ? "border-brand-cyan/40 text-brand-cyan"
                        : s.status === "failed"
                          ? "border-state-warning/40 text-state-warning"
                          : "border-ink-500 text-text-secondary"
                    }`}
                  >
                    {t(`status.${s.status}`)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
