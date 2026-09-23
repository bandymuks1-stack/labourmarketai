import type { DiscoverabilityState } from "@/lib/privacy/discoverability-actions";

/**
 * "MATOMAS DARBDAVIAMS" — the ONE reading of the profile-discoverability
 * consent that every door to it shares (profile hub, opportunities board,
 * chat, the one-time ask after a work-card save).
 *
 * WHY THIS EXISTS. Measured on production (capability matrix P0): 57 of 59
 * worker profiles are invisible to all supply matching, because the
 * `profile_discoverability` consent was reachable only through the profile
 * page's closed "More" disclosure. The consent itself, its RPCs and its
 * ledger were complete — nobody could find the switch.
 *
 * WHAT IT DELIBERATELY IS NOT. Not a second consent path: every door opens
 * the EXISTING `DiscoverabilityConsent` (equal grant / decline buttons, the
 * full versioned legal text, one-click withdrawal) or links to its canonical
 * home. Not a default opt-in: nothing here grants anything. Not a nag: the
 * ask is asked once.
 *
 * SEP-7 — UNKNOWN ≠ OFF. A failed or unavailable read is `unknown`, never
 * `off`: telling a person "employers cannot see you" because a query failed
 * would be a claim about their profile made from a fact about the network.
 *
 * Pure module: no IO, no server-only import (the state type is type-only),
 * safe on client and server and trivially unit-testable.
 */

export type EmployerVisibility = "on" | "off" | "unknown";

/** The canonical home of the consent — the privacy screen's first section. */
export const EMPLOYER_VISIBILITY_HREF = "/dashboard/privacy#visibility";

/**
 * WHERE a grant or withdrawal was made — the ledger's `source` column. A
 * CLOSED set: the consent component names its surface, the server action maps
 * anything else to the canonical screen. Before the conversation could embed
 * the consent, every event said `dashboard_privacy_screen`; a grant made in
 * the chat recorded as the privacy screen would be a false provenance in the
 * one record that has to prove how consent was obtained (GDPR Art. 7(1)).
 */
export const DISCOVERABILITY_CONSENT_SOURCES = [
  "dashboard_privacy_screen",
  "conversation",
] as const;
export type DiscoverabilityConsentSource =
  (typeof DISCOVERABILITY_CONSENT_SOURCES)[number];

export function discoverabilityConsentSourceOf(
  raw: unknown,
): DiscoverabilityConsentSource {
  return typeof raw === "string" &&
    (DISCOVERABILITY_CONSENT_SOURCES as readonly string[]).includes(raw)
    ? (raw as DiscoverabilityConsentSource)
    : "dashboard_privacy_screen";
}

type StateLike = Pick<DiscoverabilityState, "kind" | "status">;

/**
 * The three honest states.
 *  - `on`      — a CURRENT-version grant is the newest ledger row (the RLS
 *                predicate `worker_profile_discoverable` reads exactly that);
 *  - `off`     — never decided, withdrawn, or granted under a superseded
 *                text version (the predicate rejects a stale version, so the
 *                person is not discoverable — fail closed, same as SQL);
 *  - `unknown` — the read failed, the model is not applied, or there is no
 *                signed-in reader. Never collapsed into `off`.
 */
export function employerVisibilityOf(
  state: StateLike | null | undefined,
): EmployerVisibility {
  if (!state || state.kind !== "ok") return "unknown";
  return state.status === "granted" ? "on" : "off";
}

// ── THE ONE-TIME ASK AFTER A WORK-CARD SAVE ────────────────────────────────

/**
 * Device-local record of the ask, versioned so it can be re-asked if the ask
 * is ever materially rewritten. Same idiom as the profession recovery prompt
 * (`lm.professionRecoveryPrompt.v1.dismissed`): one key, no row, no table.
 * Holds one of `VISIBILITY_ASK_OUTCOMES` and nothing else — no id, no data.
 */
export const VISIBILITY_ASK_KEY = "lm.employerVisibilityAsk.v1";

/** `opened` — the person followed the door to the consent (the consent screen
 *  owns the decision from there); `dismissed` — "not now". Either ends the ask. */
export const VISIBILITY_ASK_OUTCOMES = ["opened", "dismissed"] as const;
export type VisibilityAskOutcome = (typeof VISIBILITY_ASK_OUTCOMES)[number];

/** Has this device already ended the ask? Only a recognised outcome counts —
 *  a stray value in storage is not an answer. */
export function visibilityAskEnded(askRecord: string | null | undefined): boolean {
  return (
    typeof askRecord === "string" &&
    (VISIBILITY_ASK_OUTCOMES as readonly string[]).includes(askRecord)
  );
}

/**
 * Should the one-time ask show after a work-card save?
 *
 * ANSWERED lives in two places, both honoured:
 *  - the consent LEDGER (server, every device): any decision the person ever
 *    recorded — a grant, a withdrawal, or a grant under an older text — means
 *    the question was already answered, so only `not_set` is askable;
 *  - the device-local record: a dismissal ("not now") or a click through to
 *    the consent. Declining the consent itself writes nothing server-side by
 *    GDPR design, which is exactly why the local record exists.
 *
 * "FIRST SAVE" is enforced by the once-only record, not by the card's
 * history: most workers saved a card before this ask existed, and a strict
 * first-ever rule would never reach the very people it is for.
 *
 * Unknown state never asks — asking someone to turn on what may already be
 * on is a question built on a failed read.
 */
export function shouldAskEmployerVisibility(input: {
  readonly justSaved: boolean;
  readonly consent: StateLike | null | undefined;
  readonly askRecord: string | null | undefined;
}): boolean {
  if (!input.justSaved) return false;
  if (visibilityAskEnded(input.askRecord)) return false;
  if (!input.consent || input.consent.kind !== "ok") return false;
  return input.consent.status === "not_set";
}

/** Read the device-local record. Storage may be unavailable (private mode,
 *  blocked) — then nothing is recorded and the ask may show. */
export function readVisibilityAskRecord(): string | null {
  try {
    return window.localStorage.getItem(VISIBILITY_ASK_KEY);
  } catch {
    return null;
  }
}

/** Record the outcome. A storage failure hides the ask for this view only. */
export function writeVisibilityAskRecord(outcome: VisibilityAskOutcome): void {
  try {
    window.localStorage.setItem(VISIBILITY_ASK_KEY, outcome);
  } catch {
    /* storage unavailable — the ask is still hidden for this render */
  }
}
