import "server-only";

import type {
  DiscoverabilityConsentLabels,
  PreviewField,
} from "@/components/app/discoverability-consent";
import {
  CONSENT_LOCALES,
  PROFILE_DISCOVERABILITY_DEFAULT_NOTICE_V1,
  type ConsentLocale,
  type ConsentTextBlocks,
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
type ConsentTranslator = (key: string, values?: Record<string, string>) => string;

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
    // The status line reads the SAME words as the readiness item on the
    // opportunities board ("Visible to employers · On / Off").
    headline: tc("employerVisibility.title"),
    stateOn: tc("employerVisibility.state.on"),
    stateOff: tc("employerVisibility.state.off"),
    statusHidden: tc("status.hidden"),
    statusHiddenBody: tc("status.hiddenBody"),
    statusVisible: tc("status.visible"),
    statusVisibleBody: tc("status.visibleBody"),
    statusWithdrawn: tc("status.withdrawn"),
    statusStale: tc("status.stale"),
    privateLine: tc("switch.privateLine"),
    grant: tc("actions.grant"),
    decline: tc("actions.decline"),
    turnOn: tc("switch.turnOn"),
    withdraw: tc("actions.withdraw"),
    details: tc("switch.details"),
    grantedNote: tc("switch.grantedNote"),
    withdrawnNote: tc("switch.withdrawnNote"),
    defaultOnNote: tc("switch.defaultOnNote"),
    defaultPendingNote: tc("switch.defaultPendingNote", { date: "{date}" }),
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
  return preview.map((f) => ({
    label: tc(`preview.${f.key}`),
    value:
      f.value === "__yes"
        ? tc("preview.yes")
        : f.value === "__no"
          ? tc("preview.no")
          : f.key === "anonymousLabel"
            ? // The anonymous name in the reader's own language, never English.
              tc("preview.anonymousValue", { token: f.value })
            : f.value,
  }));
}

/** The free-worker default notice (20261025100000) in the reader's consent
 *  locale — the exact hashed text the ledger records as shown. */
export function defaultVisibilityNotice(locale: string): ConsentTextBlocks {
  return PROFILE_DISCOVERABILITY_DEFAULT_NOTICE_V1.texts[toConsentLocale(locale)];
}
