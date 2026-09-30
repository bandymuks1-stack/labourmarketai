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
  /** Where the person stands in this photograph (0–1 of the frame): the
   *  camera moves around them and the next moment grows out of them. */
  readonly face: { readonly x: number; readonly y: number; readonly h: number };
  readonly figure: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
};

export type HeroCard = {
  readonly name: string;
  readonly profession: string;
  readonly country: string;
  /** Two short facts, each one localized phrase ("3 sites"). */
  readonly facts: readonly string[];
  readonly skills: readonly string[];
  /** The places the work has taken them, in order ("Vilnius", "Bergen"). */
  readonly path: readonly string[];
};

export type HeroStory = {
  readonly id: string;
  readonly name: string;
  /** The Player Card portrait: the same person, head and shoulders. */
  readonly portrait: { readonly src: string; readonly srcSmall: string; readonly width: number; readonly height: number } | null;
  readonly moments: readonly HeroMoment[];
};

export type LivingWorkerHeroData = {
  readonly sampleLabel: string;
  readonly controls: { readonly pause: string; readonly play: string; readonly next: string; readonly previous: string };
  readonly cardLabel: string;
  /** One line under the card: the record travels with the person. */
  readonly cardNote: string;
  readonly stories: readonly HeroStory[];
};

type ManifestStage = {
  key: string;
  stem: string;
  width: number;
  height: number;
  face?: HeroMoment["face"];
  figure?: HeroMoment["figure"];
};
type Manifest = {
  personas: Record<string, { name: string; stages: ManifestStage[]; portrait?: { stem: string; width: number; height: number } }>;
};

/** A photograph not yet located: the person is framed in the centre third. */
const CENTRED = { face: { x: 0.5, y: 0.25, h: 0.1 }, figure: { x0: 0.38, y0: 0.12, x1: 0.62, y1: 1 } } as const;

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
            path: t(`${cardKey}.path`).split(/\s*→\s*/),
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
        face: s.face ?? CENTRED.face,
        figure: s.figure ?? CENTRED.figure,
      };
    });
    const p = persona.portrait;
    const portrait = p
      ? { src: `/hero/${id}/${p.stem}-800.webp`, srcSmall: `/hero/${id}/${p.stem}-400.webp`, width: p.width, height: p.height }
      : null;
    stories.push({ id, name: persona.name, portrait, moments });
  }
  if (stories.length === 0) return null;
  return {
    sampleLabel: t("sampleLabel"),
    controls: { pause: t("pause"), play: t("play"), next: t("next"), previous: t("previous") },
    cardLabel: t("cardLabel"),
    cardNote: t("cardNote"),
    stories,
  };
}
