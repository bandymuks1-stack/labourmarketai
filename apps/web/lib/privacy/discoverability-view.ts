import "server-only";

import type {
  DiscoverabilityConsentLabels,
  PreviewField,
} from "@/components/app/discoverability-consent";
import {
  CONSENT_LOCALES,
  type ConsentLocale,
} from "@/lib/privacy/consent-definitions";
import type { DiscoverabilityPreviewField } from "@/lib/privacy/discoverability-preview";

/**
 * THE ONE server-side view of the profile-discoverability consent — shared by
 * every surface that renders `DiscoverabilityConsent`: the privacy screen (its
 * canonical home) and the conversation, which embeds the SAME component when a
 * person asks "kas mato mano profilį?".
 *
 * Before the conversation door existed the privacy page built these labels
 * inline. A second surface copying that block would have been two lists that
 * must agree forever; the label map, the preview-field labels and the consent
 * locale now live here, once.
 *
 * Server-only because the consent legal texts (and their locale set) come from
 * the hashed registry, which is server-only by design.
 */

/** A translator over the `privacyConsent` namespace. */
type ConsentTranslator = (key: string) => string;

/** 2026-09-20: PL is an active UI locale; a locale WITHOUT its own consent
 *  blocks falls back to English — never Lithuanian (lib/i18n/unsupported-language.ts). */
export function toConsentLocale(locale: string): ConsentLocale {
  return (CONSENT_LOCALES as readonly string[]).includes(locale)
    ? (locale as ConsentLocale)
    : "en";
}

/** The consent component's chrome, from the `privacyConsent` catalogue. */
export function discoverabilityConsentLabels(
  tc: ConsentTranslator,
): DiscoverabilityConsentLabels {
  return {
    statusHidden: tc("status.hidden"),
    statusHiddenBody: tc("status.hiddenBody"),
    statusVisible: tc("status.visible"),
    statusWithdrawn: tc("status.withdrawn"),
    statusStale: tc("status.stale"),
    grant: tc("actions.grant"),
    decline: tc("actions.decline"),
    manage: tc("actions.manage"),
    withdraw: tc("actions.withdraw"),
    previewTitle: tc("preview.title"),
    previewEmpty: tc("preview.empty"),
    decidedAtLabel: tc("labels.decidedAt"),
    versionLabel: tc("labels.version"),
    needsMigration: tc("labels.needsMigration"),
    errorGeneric: tc("labels.error"),
    declinedNote: tc("labels.declinedNote"),
    readFailed: tc("labels.readFailed"),
  };
}

/** "Taip jūsų profilį matys įmonės" — each own-row preview field under its
 *  localized label. The values are the builder's (own RLS-scoped rows only). */
export function discoverabilityPreviewFields(
  preview: readonly DiscoverabilityPreviewField[],
  tc: ConsentTranslator,
): PreviewField[] {
  return preview.map((f) => ({ label: tc(`preview.${f.key}`), value: f.value }));
}
