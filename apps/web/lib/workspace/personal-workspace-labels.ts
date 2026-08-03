import type { getTranslations } from "next-intl/server";

import type { ReadinessPillarKey } from "@/lib/player-card/readiness";

type T = Awaited<ReturnType<typeof getTranslations>>;

/**
 * The flat label bag for "Mano erdvė" (S2) — resolved on the SERVER, exactly
 * like `resolveChatLabels` / `resolveWorkLogLabels` next to it.
 *
 * WHY A BAG AND NOT `useTranslations` IN THE BLOCK: the conversation shell
 * ships an allowlisted SUBSET of the message catalog to the client
 * (`lib/i18n/client-messages.ts`). Reading `playerCard.*` from a client
 * component would have forced that whole namespace into the bundle just to
 * render six words. Resolving here keeps the payload unchanged AND keeps ONE
 * set of words for one set of signals: the pillar names below are the very
 * strings the Player Card and the chat's profile summary render.
 */
export type PersonalWorkspaceLabels = {
  readonly title: string;
  readonly intro: string;
  readonly workProfile: string;
  /** The honesty line the deleted MyZone surface carried and this block keeps:
   *  everything named above is SELF-DECLARED and not human-reviewed. The block
   *  claims no verification anywhere, so this says out loud what "Jau nurodyta"
   *  means — the platform knows it because the person said it. */
  readonly unverifiedNote: string;
  /** The active space's own name ("Asmeninė erdvė") — the workspace chip's word. */
  readonly spaceKind: string;
  /** The six plain-language dimensions, in product order. */
  readonly dimensions: readonly string[];
  readonly readinessLabel: string;
  readonly readinessKnown: string;
  readonly readinessNext: string;
  readonly readinessComplete: string;
  readonly readinessUnavailable: string;
  /** Canonical readiness pillar names (`playerCard.readinessSteps.pillar.*`). */
  readonly pillar: Readonly<Record<ReadinessPillarKey, string>>;
  /** Action wording keyed by the model's `labelKey`. */
  readonly action: Readonly<Record<string, string>>;
};

const DIMENSION_KEYS = [
  "whatICanDo",
  "whatIAmLookingFor",
  "whenICanWork",
  "whereICanWork",
  "whatPayIExpect",
  "howIProveExperience",
] as const;

const PILLAR_KEYS: readonly ReadinessPillarKey[] = [
  "profession",
  "availability",
  "skills",
  "journal",
  "evidence",
  "workCard",
];

const ACTION_KEYS = [
  "startWithYourself",
  "whenICanWork",
  "whereICanWork",
  "addSkills",
  "addExperienceEvidence",
  "viewWorkProfile",
  "completeWorkProfile",
] as const;

/**
 * @param t      scoped to `personalWorkspace`
 * @param tPillar scoped to `playerCard.readinessSteps.pillar`
 * @param tChat  scoped to `conversation.chat`
 */
export function resolvePersonalWorkspaceLabels(
  t: T,
  tPillar: T,
  tChat: T,
): PersonalWorkspaceLabels {
  const pillar = {} as Record<ReadinessPillarKey, string>;
  for (const k of PILLAR_KEYS) pillar[k] = tPillar(k);
  const action: Record<string, string> = {};
  for (const k of ACTION_KEYS) action[k] = t(`action.${k}`);
  return {
    title: t("title"),
    intro: t("intro"),
    workProfile: t("workProfile"),
    unverifiedNote: t("unverifiedNote"),
    spaceKind: tChat("workspacePersonal"),
    dimensions: DIMENSION_KEYS.map((k) => t(`dimension.${k}`)),
    readinessLabel: t("readiness.label"),
    readinessKnown: t("readiness.known"),
    readinessNext: t("readiness.next"),
    readinessComplete: t("readiness.complete"),
    readinessUnavailable: t("readiness.unavailable"),
    pillar,
    action,
  };
}
