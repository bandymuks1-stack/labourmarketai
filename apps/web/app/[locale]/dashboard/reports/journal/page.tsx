import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import type { Role } from "@/lib/auth/actions";
import { Link } from "@/lib/i18n/navigation";
import {
  getJournalWindowReport,
  JOURNAL_WINDOW_KEYS,
  type JournalWindowKey,
} from "@/lib/journal/journal-window-report";
import { createUtcFormatter } from "@/lib/time/display";
import { createClient } from "@/lib/supabase/server";

/**
 * Windowed journal report (V8 employer daily loop, GAP 4) — per-worker counts
 * of recorded work entries over a fixed calendar window (today / week /
 * month), with review state. Manager roles only; the window switches via
 * plain links (?window=…), no client JS.
 *
 * HONESTY contract: counts and timestamps only — no entry text, no photos,
 * no rating, no score, no "productivity" framing. The basis line states what
 * is counted and that the ABSENCE of entries is not evidence of absence of
 * work — a worker with zero rows worked exactly as much as the journal does
 * not say.
 */

export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set<Role>(["company", "agency"]);

function windowKeyFrom(raw: string | undefined): JournalWindowKey {
  return (JOURNAL_WINDOW_KEYS as readonly string[]).includes(raw ?? "")
    ? (raw as JournalWindowKey)
    : "week";
}

const CELL_CLASS = "px-3 py-2 text-sm text-text-primary";
const NUM_CELL_CLASS = `${CELL_CLASS} text-right tabular-nums`;
const HEAD_CELL_CLASS =
  "px-3 py-2 text-left font-mono text-meta uppercase tracking-label text-text-muted";

export default async function JournalWindowReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ window?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("id", user.id)
    .single();
  const role = (profile?.active_role as Role) ?? "worker";
  // Manager surface only — everyone else lands on the reports hub they can use.
  if (!MANAGER_ROLES.has(role)) redirect(`/${locale}/dashboard/reports`);

  const sp = (await searchParams) ?? {};
  const windowKey = windowKeyFrom(sp.window);

  const t = await getTranslations("reports.journalWindow");
  const report = await getJournalWindowReport(windowKey);

  const dayFmt = createUtcFormatter(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-6" data-testid="journal-window-report">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
      </header>

      {/* Window switch — plain links, the server re-renders (no client state). */}
      <nav
        className="flex flex-wrap gap-2"
        aria-label={t("windowLabel")}
        data-testid="journal-window-switch"
      >
        {JOURNAL_WINDOW_KEYS.map((key) => (
          <Link
            key={key}
            href={`/dashboard/reports/journal?window=${key}` as "/dashboard"}
            aria-current={key === windowKey ? "page" : undefined}
            data-testid={`journal-window-link-${key}`}
            className={`inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
              key === windowKey
                ? "border-brand-blue bg-brand-blue/10 font-semibold text-brand-blue"
                : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary"
            }`}
          >
            {t(`window.${key}`)}
          </Link>
        ))}
      </nav>

      {!report.applied ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
          data-testid="journal-window-unavailable"
        >
          {report.reason === "no-org" ? t("noOrg") : t("unavailable")}
        </p>
      ) : (
        <>
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("windowRange", {
              start: dayFmt(report.window.startIso) ?? report.window.startIso,
              end: dayFmt(report.window.endIso) ?? report.window.endIso,
            })}
          </p>

          {report.totals.entries === 0 ? (
            <div
              className="flex flex-col gap-1 rounded-md border border-dashed border-ink-500 p-5"
              data-testid="journal-window-empty"
            >
              <p className="text-sm text-text-secondary">{t("empty")}</p>
              <p className="text-xs text-text-muted">{t("emptyNext")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-ink-500">
              <table
                className="w-full min-w-[36rem] border-collapse"
                data-testid="journal-window-table"
              >
                <thead className="border-b border-ink-500 bg-ink-800/40">
                  <tr>
                    <th scope="col" className={HEAD_CELL_CLASS}>
                      {t("table.worker")}
                    </th>
                    <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                      {t("table.entries")}
                    </th>
                    <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                      {t("table.awaitingReview")}
                    </th>
                    <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                      {t("table.confirmed")}
                    </th>
                    <th scope="col" className={HEAD_CELL_CLASS}>
                      {t("table.lastEntry")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.workers.map((w) => (
                    <tr
                      key={w.workerId}
                      className="border-b border-ink-600/60 last:border-b-0"
                      data-testid={`journal-window-worker-${w.workerId}`}
                    >
                      <td className={CELL_CLASS}>{w.name}</td>
                      <td className={NUM_CELL_CLASS}>{w.entries}</td>
                      <td className={NUM_CELL_CLASS}>{w.awaitingReview}</td>
                      <td className={NUM_CELL_CLASS}>{w.confirmed}</td>
                      <td className={`${CELL_CLASS} font-mono text-meta text-text-muted`}>
                        {dayFmt(w.lastEntryAtIso) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    className="border-t border-ink-500 bg-ink-800/40 font-semibold"
                    data-testid="journal-window-totals"
                  >
                    <td className={CELL_CLASS}>
                      {t("totals", { count: report.totals.workers })}
                    </td>
                    <td className={NUM_CELL_CLASS}>{report.totals.entries}</td>
                    <td className={NUM_CELL_CLASS}>{report.totals.awaitingReview}</td>
                    <td className={NUM_CELL_CLASS}>{report.totals.confirmed}</td>
                    <td className={CELL_CLASS} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* The calculation basis — including the "no entries ≠ no work" rule. */}
          <p
            className="rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 text-meta leading-relaxed text-text-muted"
            data-testid="journal-window-basis"
          >
            <span className="font-mono uppercase tracking-label">
              {t("basisLabel")}:
            </span>{" "}
            {t("basis")}
          </p>
        </>
      )}

      <Link
        href={"/dashboard/reports" as "/dashboard"}
        className="w-fit text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        data-testid="journal-window-back"
      >
        ← {t("back")}
      </Link>
    </div>
  );
}
