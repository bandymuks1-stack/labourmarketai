"use server";

import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import type {
  ConsentLegalTexts,
  DiscoverabilityConsentLabels,
  PreviewField,
} from "@/components/app/discoverability-consent";
import { readWorkerCoreRow } from "@/lib/data/worker-core";
import { PROFILE_DISCOVERABILITY_V1 } from "@/lib/privacy/consent-definitions";
import {
  getMyDiscoverabilityState,
  type DiscoverabilityState,
} from "@/lib/privacy/discoverability-actions";
import { buildOwnDiscoverabilityPreview } from "@/lib/privacy/discoverability-preview";
import {
  discoverabilityConsentLabels,
  discoverabilityPreviewFields,
  toConsentLocale,
} from "@/lib/privacy/discoverability-view";
import {
  employerVisibilityOf,
  type EmployerVisibility,
} from "@/lib/privacy/employer-visibility";
import { createClient } from "@/lib/supabase/server";

/**
 * "KAS MATO MANO PROFILĮ?" / "make me visible to employers" — the
 * conversation's door to the profile-discoverability consent.
 *
 * A THIN ADAPTER, NOT A SECOND CONSENT PATH. It composes the reads the privacy
 * screen already runs — the consent state (`getMyDiscoverabilityState`), the
 * own-row employer preview (`buildOwnDiscoverabilityPreview`), the hashed
 * legal text from the versioned registry — and the ONE label map
 * (`discoverabilityConsentLabels`). The chat then renders the SAME
 * `DiscoverabilityConsent` component inline. Every write stays that
 * component's: equal grant / decline buttons behind the full legal text, one
 * click to withdraw. This module writes nothing.
 *
 * HONEST STATE FIRST. The line the chat says before the consent is the
 * current state, read — on, off, or unknown:
 *  - `unknown` (failed read, model not applied, no reader) embeds NOTHING: the
 *    consent's choice screen would claim "not visible" from a failed query
 *    (SEP-7). The person gets the line and the chip to the canonical screen.
 *  - `no-worker` — the account holds no worker profile, so there is nothing an
 *    employer could find; said plainly, no consent is offered for nothing. A
 *    FAILED worker read is not "no worker": it falls through to the state.
 */

export type EmployerVisibilityChatConsent = {
  readonly state: DiscoverabilityState;
  readonly legal: ConsentLegalTexts;
  readonly preview: PreviewField[];
  readonly labels: DiscoverabilityConsentLabels;
};

export type EmployerVisibilityChatResult =
  | { readonly kind: "no-worker"; readonly line: string; readonly chipLabel: string }
  | {
      readonly kind: "state";
      readonly visibility: EmployerVisibility;
      readonly line: string;
      readonly chipLabel: string;
      /** Null exactly when the state is unknown — nothing to decide on. */
      readonly consent: EmployerVisibilityChatConsent | null;
    };

export async function loadEmployerVisibilityForChat(): Promise<EmployerVisibilityChatResult> {
  const [t, tc, locale] = await Promise.all([
    getTranslations("privacyConsent.employerVisibility"),
    getTranslations("privacyConsent"),
    getLocale(),
  ]);
  const chipLabel = t("title");
  const unknown: EmployerVisibilityChatResult = {
    kind: "state",
    visibility: "unknown",
    line: t("chat.unknown"),
    chipLabel,
    consent: null,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unknown;

  const [worker, state, preview] = await Promise.all([
    readWorkerCoreRow({ supabase, userId: user.id }),
    getMyDiscoverabilityState(),
    buildOwnDiscoverabilityPreview(),
  ]);
  if (worker.ok && worker.value === null) {
    return { kind: "no-worker", line: t("chat.noWorker"), chipLabel };
  }

  const visibility = employerVisibilityOf(state);
  if (visibility === "unknown") return unknown;

  return {
    kind: "state",
    visibility,
    line: t(`chat.${visibility}`),
    chipLabel,
    consent: {
      state,
      legal: PROFILE_DISCOVERABILITY_V1.texts[toConsentLocale(locale)],
      preview: discoverabilityPreviewFields(preview, tc),
      labels: discoverabilityConsentLabels(tc),
    },
  };
}
