import "server-only";

import { getTranslations } from "next-intl/server";

import { buildPlayerCardLabels } from "@/lib/player-card/labels";
import { buildSampleAllTime, buildSampleWorkerPlayerCard } from "@/lib/player-card/sample-card";
import type { SkillEvidenceLabels } from "@/components/app/player-card/skill-evidence-chart";
import type { WorkerPlayerCard } from "@/lib/player-card/player-card";
import type { CalendarResultWeek } from "@/lib/planning/calendar-result";

/**
 * THE PUBLIC ENTRY'S SAMPLE STORY (owner decision 2026-09-29: the landing
 * entry tells the product story with the SAME components the product uses).
 *
 * WHAT THIS IS. The landing's existing, legitimate sample mechanism — the
 * sample persona `buildSampleWorkerPlayerCard` already shows on the landing
 * and /for-workers — carried through one working journey:
 *   identity → profession → direction → opportunities → conversation →
 *   project → hours → manager confirmation → capability → Living CV → next.
 *
 * WHAT IT IS NOT. A real person, a real employer or a production fact. Every
 * string is translation copy under `landingJourney`, the persona is the
 * sample persona, and the stage says "Pavyzdys" on every step. Nothing is
 * read from the database; nothing here can be mistaken for a live record.
 */

export const JOURNEY_STEPS = [
  "identity",
  "profession",
  "direction",
  "opportunities",
  "conversation",
  "project",
  "hours",
  "confirmation",
  "capability",
  "cv",
  "next",
] as const;
export type JourneyStepKey = (typeof JOURNEY_STEPS)[number];

export interface SampleJourney {
  readonly sampleLabel: string;
  readonly title: string;
  readonly person: { readonly name: string; readonly initials: string; readonly profession: string; readonly nextProfession: string };
  readonly steps: readonly { readonly key: JourneyStepKey; readonly label: string; readonly caption: string }[];
  readonly direction: { readonly country: string; readonly pay: string };
  readonly opportunities: readonly { readonly role: string; readonly place: string; readonly fits: readonly string[] }[];
  readonly conversation: readonly { readonly from: "employer" | "person"; readonly text: string }[];
  readonly project: { readonly name: string; readonly place: string; readonly team: string };
  readonly week: CalendarResultWeek;
  readonly weekLabel: string;
  readonly confirmedBy: string;
  readonly facts: { readonly recorded: string; readonly confirmed: string; readonly days: string };
  readonly skills: WorkerPlayerCard["skillEvidence"];
  readonly skillLabels: SkillEvidenceLabels;
  readonly cv: readonly { readonly org: string; readonly period: string; readonly standing: string; readonly confirmed: boolean }[];
  readonly next: { readonly role: string; readonly place: string; readonly why: string };
  readonly controls: { readonly play: string; readonly pause: string; readonly stepsLabel: string };
  readonly currentWorkLabel: string;
}

export async function buildSampleJourney(now: Date = new Date()): Promise<SampleJourney> {
  const t = await getTranslations("landingJourney");
  const tCards = await getTranslations("playercards");
  const card = buildSampleWorkerPlayerCard({
    sampleName: tCards("sample.name"),
    sampleOrganization: tCards("sample.organization"),
    now,
  });
  const labels = await buildPlayerCardLabels(card, { allTime: buildSampleAllTime(now) });
  const name = card.displayName ?? tCards("sample.name");
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  // A sample working week: five eight-hour days, the weekend free.
  const weekdays = t.raw("week.days") as string[];
  const week: CalendarResultWeek = {
    totalLabel: t("week.total"),
    scaleMinutes: 8 * 60,
    days: weekdays.map((weekday, i) => ({
      day: `sample-${i}`,
      weekday,
      minutes: i < 5 ? 8 * 60 : 0,
      hoursLabel: i < 5 ? "8" : null,
      confirmed: "none",
      isToday: false,
      isFuture: false,
    })),
  };

  return {
    sampleLabel: t("sampleLabel"),
    title: t("title"),
    person: {
      name,
      initials,
      // The story's own word (it is told in the persona's voice and grammatical
      // gender); the registry label is the catalogue's generic form.
      profession: t("person.profession"),
      nextProfession: t("person.nextProfession"),
    },
    steps: JOURNEY_STEPS.map((key) => ({
      key,
      label: t(`steps.${key}.label`),
      caption: t(`steps.${key}.caption`),
    })),
    direction: { country: t("direction.country"), pay: t("direction.pay") },
    opportunities: [0, 1].map((i) => ({
      role: t(`opportunities.${i}.role`),
      place: t(`opportunities.${i}.place`),
      fits: t.raw(`opportunities.${i}.fits`) as string[],
    })),
    conversation: [
      { from: "employer", text: t("conversation.employer") },
      { from: "person", text: t("conversation.person") },
    ],
    project: { name: t("project.name"), place: t("project.place"), team: t("project.team") },
    week,
    weekLabel: t("week.label"),
    confirmedBy: t("confirmedBy"),
    facts: { recorded: t("facts.recorded"), confirmed: t("facts.confirmed"), days: t("facts.days") },
    skills: card.skillEvidence,
    skillLabels: labels.visuals.skills,
    cv: [0, 1].map((i) => ({
      org: t(`cv.${i}.org`),
      period: t(`cv.${i}.period`),
      standing: t(`cv.${i}.standing`),
      confirmed: i === 0,
    })),
    next: { role: t("next.role"), place: t("next.place"), why: t("next.why") },
    controls: { play: t("controls.play"), pause: t("controls.pause"), stepsLabel: t("controls.steps") },
    currentWorkLabel: t("currentWork"),
  };
}
