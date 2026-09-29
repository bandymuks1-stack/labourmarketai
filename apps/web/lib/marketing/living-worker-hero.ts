import "server-only";
import { getTranslations } from "next-intl/server";

import manifest from "./living-worker-hero.manifest.json";

/**
 * THE LIVING WORKER HERO — two sample people, each through their own
 * working life (owner 2026-09-29): the same person at the centre while the
 * tool, the workwear, the place, the country and the responsibility change.
 *
 * The media are photographs produced by `scripts/hero/generate-living-worker-
 * hero.mjs` (identity-anchored edits of ONE base photo per person) and listed
 * in the manifest the script writes. Only stages that exist on disk are
 * returned; with no media at all the landing keeps its current hero — never
 * an abstract stand-in.
 *
 * SAMPLE, NOT A RECORD. The people are fictional sample personas, every
 * string is translation copy, the stage wears the sample label, and nothing
 * is read from the database.
 */

export type HeroMoment = {
  readonly src: string;
  readonly srcSmall: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly caption: string;
  /** The Player Card opens from the person on this moment. */
  readonly card: HeroCard | null;
  /** On the owner moment: the people and work they now run. */
  readonly team: readonly string[] | null;
};

export type HeroCard = {
  readonly name: string;
  readonly profession: string;
  readonly country: string;
  /** Two short facts, each one localized phrase ("3 sites"). */
  readonly facts: readonly string[];
  readonly skills: readonly string[];
  readonly path: string;
};

export type HeroStory = {
  readonly id: string;
  readonly name: string;
  readonly moments: readonly HeroMoment[];
};

export type LivingWorkerHeroData = {
  readonly sampleLabel: string;
  readonly controls: { readonly pause: string; readonly play: string; readonly next: string; readonly previous: string };
  readonly cardLabel: string;
  readonly stories: readonly HeroStory[];
};

type ManifestStage = { key: string; stem: string; width: number; height: number };
type Manifest = { personas: Record<string, { name: string; stages: ManifestStage[] }> };

/** The order the two stories alternate in. */
const STORY_ORDER = ["tomas", "rasa"] as const;

export async function buildLivingWorkerHero(): Promise<LivingWorkerHeroData | null> {
  const t = await getTranslations("livingWorkerHero");
  const data = manifest as Manifest;
  const stories: HeroStory[] = [];
  for (const id of STORY_ORDER) {
    const persona = data.personas[id];
    if (!persona || persona.stages.length === 0) continue;
    const moments = persona.stages.map((s): HeroMoment => {
      const k = `personas.${id}.stages.${s.key}`;
      const cardKey = `${k}.card`;
      const card: HeroCard | null = t.has(`${cardKey}.profession`)
        ? {
            name: persona.name,
            profession: t(`${cardKey}.profession`),
            country: t(`${cardKey}.country`),
            facts: [t(`${cardKey}.experience`), t(`${cardKey}.places`)],
            skills: t(`${cardKey}.skills`).split(" · "),
            path: t(`${cardKey}.path`),
          }
        : null;
      return {
        src: `/hero/${id}/${s.stem}-1920.webp`,
        srcSmall: `/hero/${id}/${s.stem}-960.webp`,
        width: s.width,
        height: s.height,
        alt: t(`${k}.alt`),
        caption: t(`${k}.caption`),
        card,
        team: t.has(`${k}.team`) ? t(`${k}.team`).split(" · ") : null,
      };
    });
    stories.push({ id, name: persona.name, moments });
  }
  if (stories.length === 0) return null;
  return {
    sampleLabel: t("sampleLabel"),
    controls: { pause: t("pause"), play: t("play"), next: t("next"), previous: t("previous") },
    cardLabel: t("cardLabel"),
    stories,
  };
}
