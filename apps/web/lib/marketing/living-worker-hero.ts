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
  /** An intermediate frame (the previous place, the next pose): it carries
   *  the change of pose so the next change of world finds the person already
   *  standing as they will. Not a moment of the story — no caption, no step. */
  readonly bridge: boolean;
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
  /** The living professional identity the card reveals in layers. */
  readonly identity: HeroIdentity;
};

/** What the sample person's real work has made them — all translation copy
 *  of a labelled sample, never a record, a score or a verification. */
export type HeroIdentity = {
  /** Where they work now ("Bergen, Norway"). */
  readonly place: string;
  /** REAL WORK: figure + unit ("2 yrs" / "of work"), each from the journal story. */
  readonly stats: readonly { readonly figure: string; readonly unit: string }[];
  /** WORK HISTORY: what they did where, oldest first. */
  readonly history: readonly { readonly when: string; readonly where: string; readonly what: string }[];
  /** PROGRESSION: every step of their path; `current` is where they stand. */
  readonly progression: readonly string[];
  readonly current: number;
  /** MOBILITY: where they can go next. */
  readonly next: string;
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
  readonly cardSections: {
    readonly work: string;
    readonly capability: string;
    readonly mobility: string;
    readonly path: string;
    readonly history: string;
    readonly now: string;
    readonly next: string;
    readonly more: string;
  };
  readonly stories: readonly HeroStory[];
};

type ManifestStage = {
  key: string;
  stem: string;
  width: number;
  height: number;
  face?: HeroMoment["face"];
  figure?: HeroMoment["figure"];
  bridge?: boolean;
};
type Manifest = {
  personas: Record<string, { name: string; stages: ManifestStage[]; portrait?: { stem: string; width: number; height: number } }>;
};

/** A photograph not yet located: the person is framed in the centre third. */
const CENTRED = { face: { x: 0.5, y: 0.25, h: 0.1 }, figure: { x0: 0.38, y0: 0.12, x1: 0.62, y1: 1 } } as const;

const items = (s: string) => s.split(" · ").map((x) => x.trim()).filter(Boolean);

function identityOf(t: Awaited<ReturnType<typeof getTranslations>>, id: string, profession: string): HeroIdentity {
  const k = `personas.${id}.identity`;
  const progression = items(t(`${k}.progression`));
  return {
    place: t(`${k}.place`),
    stats: items(t(`${k}.stats`)).map((s) => {
      const [figure = "", unit = ""] = s.split("|");
      return { figure, unit };
    }),
    history: items(t(`${k}.history`)).map((s) => {
      const [when = "", where = "", what = ""] = s.split("|");
      return { when, where, what };
    }),
    progression,
    // where they stand is the card's own profession on that path
    current: Math.max(0, progression.indexOf(profession)),
    next: t(`${k}.next`),
  };
}

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
      // a bridge shows the previous moment's place: it speaks with its words
      const k = `personas.${id}.stages.${s.bridge ? s.key.split("~")[0] : s.key}`;
      const cardKey = `${k}.card`;
      const card: HeroCard | null = !s.bridge && t.has(`${cardKey}.profession`)
        ? {
            name: persona.name,
            profession: t(`${cardKey}.profession`),
            country: t(`${cardKey}.country`),
            facts: [t(`${cardKey}.experience`), t(`${cardKey}.places`)],
            skills: t(`${cardKey}.skills`).split(" · "),
            path: t(`${cardKey}.path`).split(/\s*→\s*/),
            identity: identityOf(t, id, t(`${cardKey}.profession`)),
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
        team: !s.bridge && t.has(`${k}.team`) ? t(`${k}.team`).split(" · ") : null,
        bridge: s.bridge === true,
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
    cardSections: {
      work: t("cardSections.work"),
      capability: t("cardSections.capability"),
      mobility: t("cardSections.mobility"),
      path: t("cardSections.path"),
      history: t("cardSections.history"),
      now: t("cardSections.now"),
      next: t("cardSections.next"),
      more: t("cardSections.more"),
    },
    stories,
  };
}
