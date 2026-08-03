import { CHIP_FOR_STEP } from "@/lib/conversation/worker-activity-chips";
import type {
  ReadinessPillarKey,
  WorkerReadiness,
} from "@/lib/player-card/readiness";

/**
 * "Mano erdvė" — the PURE decision model behind the personal-workspace intro
 * (AI-native visual system S2).
 *
 * WHAT THIS IS NOT: it is not a second readiness model, not a completeness
 * score and not a profile hub. It computes NOTHING about the person. The
 * caller hands in a `WorkerReadiness` produced by the ONE canonical deriver
 * (`deriveWorkerReadiness(getWorkerPlayerCard())`) and this module only
 * decides what the first screen should SAY and OFFER about it:
 *
 *   - is the personal intro shown at all (identity / workspace / worker row),
 *   - which readiness signals are already met (their canonical keys),
 *   - which single unmet signal matters most,
 *   - which ONE action genuinely closes it, plus at most two real extras.
 *
 * PRIORITY ORDER: there is no separate priority list here either. The order is
 * `readiness.pillars` — the same order the Player Card renders and the chat's
 * profile summary reports. "Most important missing part" = the FIRST unmet
 * pillar in that canonical order, nothing more clever.
 *
 * Pure, deterministic, no I/O, no `Date`, no locale — so every role/state
 * combination is unit-testable.
 */

/** A chip id the conversation's existing dispatcher already understands
 *  (`handleChip`): a named starter, an `f:<actionId>` inline form, or a
 *  `link:<route>` to a REAL existing screen. Never a new route, never a
 *  new action. */
export type IntroActionId = string;

export type IntroAction = {
  /** Dispatched verbatim into the conversation's own chip handler. */
  readonly id: IntroActionId;
  /** i18n key under `personalWorkspace.action.*`. */
  readonly labelKey: string;
};

export type PersonalWorkspaceIntro =
  /** Nothing personal is shown — the reason is explicit so tests (and the PR)
   *  can assert WHY, and so an organization context can never accidentally
   *  fall through to worker copy. */
  | { readonly kind: "hidden"; readonly reason: HiddenReason }
  /** The person HAS a work profile but its readiness could not be read. The
   *  block still says where the person is; it claims nothing about readiness
   *  and offers no readiness CTA. Never a raw error string. */
  | { readonly kind: "unavailable"; readonly displayName: string | null }
  | {
      readonly kind: "intro";
      readonly displayName: string | null;
      /** Canonical pillar keys already met (labelled from the SAME i18n
       *  namespace the Player Card uses — no second copy of the names). */
      readonly met: readonly ReadinessPillarKey[];
      /** The one signal that matters most right now; null = nothing missing. */
      readonly nextMissing: ReadinessPillarKey | null;
      readonly primary: IntroAction;
      /** At most two, never a repeat of the primary. */
      readonly secondary: readonly IntroAction[];
    };

export type HiddenReason =
  | "signed-out"
  | "organization-workspace"
  | "not-person-identity"
  | "no-worker-profile";

/**
 * Which REAL action closes which readiness pillar.
 *
 * `CHIP_FOR_STEP` is the canonical map and always wins — this module can never
 * disagree with the chat's own recommendation, because it does not carry its
 * own answer for the keys that map already covers. The fallbacks below fill in
 * ONLY the pillars `CHIP_FOR_STEP` deliberately leaves out, and each one is the
 * path that genuinely closes that pillar today:
 *
 *   profession → the profile screen is where a profession is set;
 *   skills     → skills are recognised from a CV import or from logged work;
 *   journal    → a work-journal entry IS the evidence;
 *   evidence   → journal-supported skills grow from the same logged work.
 */
const PILLAR_FALLBACK_ACTION: Record<ReadinessPillarKey, IntroActionId> = {
  profession: "link:/dashboard/profile",
  availability: "f:worker.save-work-card",
  skills: "cv",
  journal: "logwork",
  evidence: "logwork",
  workCard: "f:worker.save-work-card",
};

/**
 * The CTA wording for each pillar (i18n keys under `personalWorkspace.action.*`).
 *
 * Keyed by PILLAR, not by chip id, because one form can close two different
 * gaps and the sentence must name the gap the person actually has: the work
 * card holds both availability and location, so an unmet `availability` asks
 * "when can I work" while an unmet `workCard` asks "where can I work" — same
 * real form underneath, two honest questions.
 */
const PILLAR_ACTION_LABEL_KEY: Record<ReadinessPillarKey, string> = {
  profession: "startWithYourself",
  availability: "whenICanWork",
  skills: "addSkills",
  journal: "addExperienceEvidence",
  evidence: "addExperienceEvidence",
  workCard: "whereICanWork",
};

/** Wording for the actions that are NOT tied to a specific gap (the complete
 *  state's primary and the secondary row). */
const STANDALONE_ACTION_LABEL_KEY: Record<IntroActionId, string> = {
  "link:/dashboard/profile": "viewWorkProfile",
  profile: "completeWorkProfile",
  logwork: "addExperienceEvidence",
};

/** The action that closes a pillar. `CHIP_FOR_STEP` first, fallback second. */
export function actionForPillar(key: ReadinessPillarKey): IntroAction {
  const id = CHIP_FOR_STEP[key] ?? PILLAR_FALLBACK_ACTION[key];
  return { id, labelKey: PILLAR_ACTION_LABEL_KEY[key] };
}

/** What a person with a COMPLETE work profile is offered instead of a
 *  "finish your profile" CTA that would be a lie (§8 rule 1). */
const COMPLETE_PRIMARY_ID: IntroActionId = "link:/dashboard/profile";

/**
 * Secondary candidates, in fixed product order. The primary is removed and the
 * first two survivors are kept — so a secondary never repeats the primary and
 * the set is fully deterministic (asserted in the guard test).
 *
 * `profile` ("papildyti") is dropped when nothing is missing: offering to
 * complete a complete profile is exactly the dishonest CTA §8 forbids.
 */
const SECONDARY_CANDIDATES: readonly IntroActionId[] = [
  "profile",
  "logwork",
  "link:/dashboard/profile",
];

export function derivePersonalWorkspaceIntro(input: {
  /** Base identity of the ACTIVE role (`baseIdentityForRole`). */
  readonly identity: "person" | "company" | null;
  /** The ACTIVE workspace's kind, from the canonical workspace resolver. */
  readonly workspaceKind: "personal" | "organization";
  readonly signedIn: boolean;
  /** False when this account has no worker row at all (company-only, agency,
   *  customer) — the canonical `WorkerActivity.hasWorkerProfile`. */
  readonly hasWorkerProfile: boolean;
  /** Null when the canonical readiness read did not produce a card. */
  readonly readiness: WorkerReadiness | null;
  readonly displayName: string | null;
}): PersonalWorkspaceIntro {
  if (!input.signedIn) return { kind: "hidden", reason: "signed-out" };
  // §9 Variant A: an organization workspace never renders the personal space.
  // Checked BEFORE the identity, so a person whose active role is `worker`
  // but who is currently acting inside an organization still gets nothing
  // personal here.
  if (input.workspaceKind === "organization") {
    return { kind: "hidden", reason: "organization-workspace" };
  }
  // company / agency / customer all resolve to the `company` base identity —
  // none of them may see worker-only copy.
  if (input.identity !== "person") {
    return { kind: "hidden", reason: "not-person-identity" };
  }
  if (!input.hasWorkerProfile) {
    return { kind: "hidden", reason: "no-worker-profile" };
  }
  if (!input.readiness) {
    return { kind: "unavailable", displayName: input.displayName };
  }

  const met = input.readiness.pillars.filter((p) => p.met).map((p) => p.key);
  const nextMissing =
    input.readiness.pillars.find((p) => !p.met)?.key ?? null;

  const primary: IntroAction =
    nextMissing === null
      ? {
          id: COMPLETE_PRIMARY_ID,
          labelKey: STANDALONE_ACTION_LABEL_KEY[COMPLETE_PRIMARY_ID],
        }
      : actionForPillar(nextMissing);

  const candidates =
    nextMissing === null
      ? SECONDARY_CANDIDATES.filter((id) => id !== "profile")
      : SECONDARY_CANDIDATES;
  const secondary = candidates
    .filter((id) => id !== primary.id)
    .slice(0, 2)
    .map((id) => ({ id, labelKey: STANDALONE_ACTION_LABEL_KEY[id] }));

  return {
    kind: "intro",
    displayName: input.displayName,
    met,
    nextMissing,
    primary,
    secondary,
  };
}

/** Every chip id this block can ever emit — the guard walks it to prove each
 *  one is a real conversation action or a real existing route, so a dead CTA
 *  cannot ship. */
export const INTRO_ACTION_IDS: readonly IntroActionId[] = [
  ...new Set([
    ...Object.keys(STANDALONE_ACTION_LABEL_KEY),
    ...Object.values(PILLAR_FALLBACK_ACTION),
    ...Object.values(CHIP_FOR_STEP).filter((v): v is string => Boolean(v)),
  ]),
];

/** Every i18n key under `personalWorkspace.action.*` this block can render —
 *  the guard proves each one exists in all 11 locale catalogs. */
export const INTRO_ACTION_LABEL_KEYS: readonly string[] = [
  ...new Set([
    ...Object.values(PILLAR_ACTION_LABEL_KEY),
    ...Object.values(STANDALONE_ACTION_LABEL_KEY),
  ]),
];
