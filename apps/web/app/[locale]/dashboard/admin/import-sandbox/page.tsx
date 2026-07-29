import { setRequestLocale, getTranslations } from "next-intl/server";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import { isInspectorEnabled } from "@/lib/intelligence/observation-inspector-model";
import {
  ManualImportSandboxForm,
  type SandboxLabels,
} from "@/components/intelligence/manual-import-sandbox-form";
import { runSandboxValidationAction } from "./actions";

/**
 * MANUAL IMPORT SANDBOX workspace (Manual Import Sandbox v1) — the
 * completely isolated dry-run surface where the owner validates a future
 * data source from a LOCAL file before any production activation.
 *
 * Gates (fail-closed, and re-checked inside the server action):
 *  1. requireSuperadmin — admin layout + per-page defense in depth;
 *  2. INTELLIGENCE_SANDBOX_ENABLED flag — off by default; when off the
 *     page renders an honest "switched off" note and exposes no form.
 *
 * Isolation guarantees: the whole chain (parsers → validation pipeline →
 * session/report builders) is pure — no supabase import, no persistence
 * path exists (guard-pinned); every completed run displays the
 * unconditional "NO DATA WAS IMPORTED" banner. Display-only until the
 * owner explicitly starts a validation session via the one form.
 */

export const dynamic = "force-dynamic";

/** Leaf keys under intelligence.sandbox.* passed to the client shell. */
const SANDBOX_LABEL_KEYS = [
  "form.file",
  "form.format",
  "form.mode",
  "form.modePreview",
  "form.modeValidateOnly",
  "form.run",
  "form.running",
  "form.note",
  "refused.title",
  "noDataImported",
  "parse.failed",
  "parse.row",
  "counts.detected",
  "counts.valid",
  "counts.invalid",
  "counts.validAfterActivation",
  "tallies.title",
  "tallies.missingFields",
  "tallies.unsupportedSchema",
  "tallies.unknownCountries",
  "tallies.unknownLanguages",
  "tallies.salaryFormat",
  "tallies.duplicateHashes",
  "tallies.sourceNotActive",
  "tallies.unknownMetrics",
  "tallies.metricPolicy",
  "tallies.dateIssues",
  "tallies.hashMismatches",
  "preview.title",
  "preview.row",
  "preview.valid",
  "preview.invalid",
  "preview.hash",
  "preview.source",
  "preview.timestamp",
  "preview.country",
  "preview.language",
  "preview.salaryBasis",
  "preview.notSalaryMetric",
  "preview.confidence",
  "preview.provenance",
  "preview.reasonCodes",
  "salaryBasis.gross",
  "salaryBasis.net",
  "salaryBasis.unknown",
  "report.title",
  "report.status",
  "report.duplicates",
  "report.errors",
  "report.warnings",
  "report.privacy",
  "report.rollbackRef",
  "report.simulated",
  "report.skipped",
  "report.finalStatus.success",
  "report.finalStatus.partial",
  "report.finalStatus.failed",
  "report.finalStatus.blocked",
  "value.unknown",
  "value.none",
] as const;

export default async function ManualImportSandboxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("intelligence");
  const enabled = isInspectorEnabled(
    process.env.INTELLIGENCE_SANDBOX_ENABLED,
  );

  const labels: SandboxLabels = {
    ...Object.fromEntries(
      SANDBOX_LABEL_KEYS.map((key) => [key, t(`sandbox.${key}` as never) as string]),
    ),
    // Confidence labels reuse the ONE existing trust vocabulary.
    "confidence.low": t("confidence.low"),
    "confidence.medium": t("confidence.medium"),
    "confidence.high": t("confidence.high"),
    "confidence.unknown": t("confidence.unknown"),
  };

  return (
    <div className="flex flex-col gap-6" data-testid="import-sandbox-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {t("sandbox.eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("sandbox.title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("sandbox.intro")}</p>
        <p className="text-xs text-text-muted">{t("sandbox.isolationNote")}</p>
      </header>

      {!enabled ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
          data-testid="sandbox-disabled"
        >
          {t("sandbox.disabled")}
        </p>
      ) : (
        <ManualImportSandboxForm
          action={runSandboxValidationAction}
          labels={labels}
        />
      )}
    </div>
  );
}
