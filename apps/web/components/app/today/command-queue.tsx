import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileWarning, CalendarRange } from "lucide-react";

import { DOCUMENTS_READINESS_ENABLED } from "@/lib/config/documents";
import {
  deriveDocumentStatus,
  listMyDocuments,
} from "@/lib/documents/readiness";
import {
  deriveCommandQueue,
  type CommandSignals,
} from "@/lib/worker/next-action-engine";

/**
 * S9 — command-center queue strip. Renders ONLY the engine items the big
 * today-action card does NOT already own (document expiries + week gaps) —
 * zero duplication (DESIGN_SOUL §1); fill_today lives in the action card,
 * grow_skill lives in the path card. Every chip is a real signal with one
 * real route; a clear day renders nothing at all (Ramybės testas).
 */
export async function CommandQueue({
  locale,
  signals,
}: {
  locale: string;
  signals: Omit<CommandSignals, "expiringDocs">;
}) {
  const t = await getTranslations("todayScreen.queue");
  const tDocs = await getTranslations("documents");

  // Real expiring/blocked documents (worker-own RLS; flag-off → none).
  let expiringDocs: CommandSignals["expiringDocs"] = [];
  if (DOCUMENTS_READINESS_ENABLED) {
    const res = await listMyDocuments();
    if (res.kind === "ok") {
      const now = new Date();
      expiringDocs = res.documents
        .map((d) => ({ d, status: deriveDocumentStatus(d, now) }))
        .filter((x) => x.status === "expiring" || x.status === "blocked")
        .map((x) => ({
          slug: x.d.documentTypeSlug,
          validUntil: x.d.validUntil,
        }));
    }
  }

  const queue = deriveCommandQueue({ ...signals, expiringDocs }).filter(
    (a) => a.kind === "renew_document" || a.kind === "fill_week_gaps",
  );
  if (queue.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5" data-testid="command-queue">
      {queue.map((a, i) =>
        a.kind === "renew_document" ? (
          <li key={`doc-${a.docSlug}-${i}`}>
            <Link
              href={`/${locale}/dashboard/documents`}
              data-testid="queue-renew-document"
              className="flex min-h-11 items-center gap-2 rounded-md border border-state-warning/40 bg-state-warning/10 px-3 py-2 text-xs leading-relaxed text-state-warning transition-colors duration-fast hover:bg-state-warning/15"
            >
              <FileWarning className="h-4 w-4 shrink-0" aria-hidden />
              {t("renewDocument", {
                doc: tDocs.has(`types.${a.docSlug}`)
                  ? tDocs(`types.${a.docSlug}` as never)
                  : a.docSlug.replace(/-/g, " "),
                date: a.validUntil ?? "—",
              })}{" "}
              →
            </Link>
          </li>
        ) : a.kind === "fill_week_gaps" ? (
          <li key="week-gaps">
            <Link
              href={`/${locale}/dashboard/journal`}
              data-testid="queue-week-gaps"
              className="flex min-h-11 items-center gap-2 rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-xs leading-relaxed text-text-secondary transition-colors duration-fast hover:border-brand-blue hover:text-brand-blue"
            >
              <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />
              {t("weekGaps", { n: a.missingDays })} →
            </Link>
          </li>
        ) : null,
      )}
    </ul>
  );
}
