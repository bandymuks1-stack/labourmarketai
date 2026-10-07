import { getTranslations } from "next-intl/server";

import { playerInitials } from "@/lib/identity/player-identity";

import { CinematicStory, type CinemaCopy, type CinemaWorld } from "./cinematic-story";

/**
 * Server wrapper: resolves the `publicCinema` copy (plus the strings it shares
 * with the rest of the public slice) into plain props, so the client component
 * needs no message provider and ships no extra namespace.
 *
 * TWO WORLDS, ONE SCRIPT. The homepage and /for-workers follow a scaffolder on a
 * facade (construction); /for-companies follows a cook and the restaurant that
 * employs her (hospitality). The scenes, the camera moves and the entities are
 * identical; only the photographs and the sample facts differ. The people and
 * the project are labelled sample fixtures (public-imagery.ts): the stage always
 * carries the "Example" mark.
 */
export async function CinematicStorySection({
  world = "construction",
  audience,
}: {
  world?: CinemaWorld;
  audience: "home" | "workers" | "companies";
}) {
  const t = await getTranslations("publicCinema");
  const ts = await getTranslations("publicSlice");
  const tw = await getTranslations("publicSlice.world");
  const tt = await getTranslations("publicSlice.transition");
  const tc = await getTranslations("publicSlice.companies");
  const th = await getTranslations("publicSlice.workers.history");
  const td = await getTranslations("publicSlice.workers.day");
  const tCards = await getTranslations("playercards");

  const construction = world === "construction";
  const name = construction ? "Tomas K." : tCards("sample.name");
  const project = construction ? "Nemunas Residences" : tt("co.project");
  const common = {
    name,
    initials: playerInitials(name),
    recordMeta: tw("workers.recordMeta"),
    hours: t("hours"),
    msgOut: t("msgOut"),
    teamMeta: t("teamMeta"),
    plan: t("plan"),
    nextTitle: th("nextTitle"),
    nextMeta: t("nextMeta", { name }),
    hEarlier: [t("addedBy", { name }), th("earlierMeta")] as const,
    project,
  };
  const w: CinemaCopy["w"] = construction
    ? {
        ...common,
        role: tw("home.personRole"),
        trade: t("construction.trade"),
        org: "Nemunas Build",
        orgInitials: "NB",
        needTitle: t("construction.needTitle"),
        needMeta: tc("need.needMeta"),
        projectMeta: tw("home.projectMeta"),
        managerName: "Mindaugas V.",
        managerInitials: "MV",
        managerRole: t("construction.managerRole"),
        msgIn: t("construction.msgIn"),
        instruction: t("construction.instruction"),
        workTitle: tw("home.workTitle"),
        photoAlt: t("construction.photoAlt"),
        hNow: [t("construction.hNowT", { project }), t("construction.hNowM")],
        hRecent: [t("construction.hRecentT"), th("recentMeta")],
        nextNeed: t("construction.nextNeed"),
      }
    : {
        ...common,
        role: tt("pro.role"),
        trade: t("hospitality.trade"),
        org: tCards("sample.organization"),
        orgInitials: playerInitials(tCards("sample.organization")),
        needTitle: tc("need.needTitle"),
        needMeta: tc("need.needMeta"),
        projectMeta: tc("project.people"),
        managerName: "Ieva K.",
        managerInitials: "IK",
        managerRole: t("hospitality.managerRole"),
        msgIn: t("hospitality.msgIn"),
        instruction: t("hospitality.instruction"),
        workTitle: td("task"),
        photoAlt: tt("pro.photoAlt"),
        hNow: [th("nowTitle"), th("nowMeta")],
        hRecent: [th("recentTitle"), th("recentMeta")],
        nextNeed: tt("co.nextNeed"),
      };

  const labelKeys = ["person", "need", "company", "project", "team", "instruction", "work", "hours", "photo", "record", "manager", "history", "next"] as const;
  const copy: CinemaCopy = {
    title: t("title"),
    sub: t("sub"),
    skip: t("skip"),
    railLabel: t("railLabel"),
    sample: ts("sample"),
    privacy: t("privacy"),
    chapters: t.raw("chapters") as string[],
    scenes: t.raw("scenes") as { title: string; body: string }[],
    labels: Object.fromEntries(labelKeys.map((k) => [k, t(`labels.${k}`)])) as CinemaCopy["labels"],
    chain: {
      project: t("chain.project"),
      people: t("chain.people"),
      need: t("chain.need"),
      plan: t("chain.plan"),
    },
    kinds: t.raw("kinds") as string[],
    kindsNote: t("kindsNote"),
    translateTag: t("translateTag"),
    states: { own: ts("states.own"), waiting: ts("states.waiting"), confirmed: ts("states.confirmed"), unknown: ts("states.unknown") },
    co: { waiting: tt("co.waiting"), done: tt("co.done") },
    end: { nextCta: tt("co.nextCta") },
    w,
  };
  return <CinematicStory copy={copy} world={world} audience={audience} />;
}
