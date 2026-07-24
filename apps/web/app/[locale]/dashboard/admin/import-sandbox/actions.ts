"use server";

import { isSuperadmin } from "@/lib/auth/superadmin";
import { isInspectorEnabled } from "@/lib/intelligence/observation-inspector-model";
import {
  MANUAL_IMPORT_FORMATS,
  MANUAL_IMPORT_MAX_BYTES,
  type ManualImportFormat,
} from "@/lib/intelligence/manual-import-parsers";
import {
  runManualImportSandbox,
  type SandboxActionState,
  type SandboxMode,
} from "@/lib/intelligence/manual-import-sandbox";

/**
 * Manual Import SANDBOX action (Manual Import Sandbox v1) — the ONE
 * explicit "start a validation session" entry point. Everything else on
 * the workspace is display.
 *
 * Guarantees:
 *  - fail-closed gates INSIDE the action (server actions are endpoints):
 *    superadmin + INTELLIGENCE_SANDBOX_ENABLED flag — same gates as the
 *    page, re-checked here;
 *  - owner-supplied LOCAL file only (multipart form file) — no URL input
 *    exists, nothing is downloaded;
 *  - the pure dry-run engine performs NO writes of any kind (no supabase
 *    import anywhere in the chain — guard-pinned); the result's
 *    `persisted` field is literally `false`;
 *  - diagnostics are deterministic reason codes — never a stack trace.
 */

export type { SandboxActionState };

const FORMATS: ReadonlySet<string> = new Set(MANUAL_IMPORT_FORMATS);

export async function runSandboxValidationAction(
  _previous: SandboxActionState,
  formData: FormData,
): Promise<SandboxActionState> {
  // Fail-closed gates — re-checked inside the endpoint itself.
  if (!isInspectorEnabled(process.env.INTELLIGENCE_SANDBOX_ENABLED)) {
    return { kind: "refused", reasonCode: "sandbox_disabled" };
  }
  if (!(await isSuperadmin())) {
    return { kind: "refused", reasonCode: "not_authorized" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { kind: "refused", reasonCode: "no_file_supplied" };
  }
  if (file.size > MANUAL_IMPORT_MAX_BYTES) {
    return { kind: "refused", reasonCode: "file_too_large" };
  }
  const formatRaw = String(formData.get("format") ?? "");
  if (!FORMATS.has(formatRaw)) {
    return { kind: "refused", reasonCode: "unknown_format" };
  }
  const mode: SandboxMode =
    String(formData.get("mode")) === "validate_only"
      ? "validate_only"
      : "preview";

  let content: string;
  try {
    content = await file.text();
  } catch {
    // Reason code only — never an exception surface.
    return { kind: "refused", reasonCode: "file_unreadable" };
  }

  const run = runManualImportSandbox({
    fileName: file.name || "unnamed-file",
    format: formatRaw as ManualImportFormat,
    content,
    mode,
    nowMs: Date.now(),
  });
  return { kind: "ran", run };
}
