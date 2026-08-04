/**
 * VACANCY VALIDATION — the single gate every candidate passes before it can
 * be called a canonical vacancy.
 *
 * Two independent classes of refusal, kept apart on purpose:
 *
 *   DATA refusals (`VacancyRejectReason`) mean the item is malformed — no
 *   id, no title, an unparseable date, a country the provider does not serve.
 *   These are defects and stay defects however the owner configures the
 *   source.
 *
 *   GATE refusals (`VacancyGateReason`) mean the item is fine but the source
 *   is not activated, or the channel is not offered. These are the
 *   `validAfterActivation` population: the honest answer to "how much would
 *   we import if the owner said yes" — reported as a number, never imported.
 *
 * The activation gate is NOT re-implemented here. It delegates to
 * `validateExternalImport` (lib/intelligence/import-boundary.ts), the one
 * place in the codebase that reads source governance to decide whether an
 * external record may enter. One boundary, two ingest paths.
 *
 * Pure module: no IO, no env, no fetch, no Date.now.
 */
import { validateExternalImport } from "@/lib/intelligence/import-boundary";
import type {
  PublicVacancyV1,
  VacancyGateReason,
  VacancyRejectReason,
} from "./vacancy-contract";
import {
  getVacancyProvider,
  providerSupportsChannel,
} from "./vacancy-provider-registry";

export interface VacancyGateContext {
  /** Provider registry key the batch was fetched from. */
  readonly providerKey: string;
  /** Provenance id of the captured batch — required by the import boundary. */
  readonly snapshotRef: string;
  /** The exact request that produced the batch. Secret-free. */
  readonly requestRef: string;
  /** ISO timestamp of capture. */
  readonly capturedAt: string;
}

export type VacancyGateResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly VacancyGateReason[] };

/**
 * Evaluate the source-level gates once per batch (they are identical for
 * every item, so evaluating per item would be pure waste and would invite the
 * two paths to disagree).
 */
export function evaluateVacancyBatchGate(
  ctx: VacancyGateContext,
  channel: PublicVacancyV1["channel"],
): VacancyGateResult {
  const reasons: VacancyGateReason[] = [];
  const provider = getVacancyProvider(ctx.providerKey);
  if (provider === null) {
    // Nothing else is knowable about an unknown provider — stop here rather
    // than emitting a misleading pile of secondary reasons.
    return { ok: false, reasons: ["unknown_provider"] };
  }
  if (!providerSupportsChannel(provider, channel)) {
    reasons.push("channel_not_supported");
  }

  // The ONE external-entry decision, delegated to the shared boundary.
  const boundary = validateExternalImport({
    sourceKey: provider.governanceSourceKey,
    snapshotRef: ctx.snapshotRef,
    sourceUrl: ctx.requestRef,
    capturedAt: ctx.capturedAt,
    payload: null,
  });
  if (!boundary.ok) {
    switch (boundary.reasonCode) {
      case "unknown_source":
        reasons.push("unknown_provider");
        break;
      case "source_not_activated":
        reasons.push("source_not_activated");
        break;
      case "legal_status_unconfirmed":
        reasons.push("legal_status_unconfirmed");
        break;
      case "activation_off":
        reasons.push("activation_off");
        break;
    }
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/**
 * Structural validation of an already-normalized candidate. Returns the empty
 * array when the record is well-formed. Runs INDEPENDENTLY of the gate so a
 * dry run can report data quality even while the source is off — which is
 * exactly the evidence an owner needs to decide about activation.
 */
export function validateVacancyRecord(
  vacancy: PublicVacancyV1,
): readonly VacancyRejectReason[] {
  const problems: VacancyRejectReason[] = [];

  if (vacancy.externalId.trim().length === 0) {
    problems.push("missing_external_id");
  }
  // A links-channel record legitimately carries no body, but every channel
  // must carry a headline — a vacancy nobody can name is not a vacancy.
  if (vacancy.titleRaw.trim().length === 0) problems.push("missing_title");

  if (vacancy.publishedAt.trim().length === 0) {
    problems.push("missing_published_at");
  } else if (!Number.isFinite(Date.parse(vacancy.publishedAt))) {
    problems.push("invalid_published_at");
  }
  if (
    vacancy.expiresAt !== null &&
    !Number.isFinite(Date.parse(vacancy.expiresAt))
  ) {
    problems.push("invalid_expires_at");
  }
  if (
    vacancy.startDate !== null &&
    !Number.isFinite(Date.parse(vacancy.startDate))
  ) {
    problems.push("invalid_start_date");
  }
  if (
    vacancy.positions !== null &&
    (!Number.isInteger(vacancy.positions) || vacancy.positions < 1)
  ) {
    problems.push("positions_not_positive_integer");
  }
  if (
    typeof vacancy.compensation.min === "number" &&
    typeof vacancy.compensation.max === "number" &&
    vacancy.compensation.min > vacancy.compensation.max
  ) {
    problems.push("compensation_range_inverted");
  }

  const provider = getVacancyProvider(vacancy.providerKey);
  if (provider !== null && vacancy.location.country !== provider.countryIso) {
    // A Swedish provider handing back a non-Swedish country is either a
    // parsing bug or a scope surprise. Either way it must not enter silently.
    problems.push("country_not_in_provider_scope");
  }

  return problems;
}
