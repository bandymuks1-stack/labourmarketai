/**
 * A REQUEST THAT BELONGS TO THE OTHER SPACE (decision 0034 rule 3, owner P0
 * 2026-11-24).
 *
 * The router reads a sentence's SHAPE and knows nothing of the workspace it is
 * typed in; each handler then branches on the speaker identity. For the
 * person's own things that branch fell through to the organization's generic
 * menu: "mano cv" typed while acting for an organization was answered with
 * "Galiu padėti su klientais … Ką norėtumėte daryti?" and three unrelated
 * doors. "My journal" opened the ORGANIZATION's journal and "my profile" the
 * company's next step, a different object from the one asked for.
 *
 * This reader decides, from the routed intent, the sentence and the active
 * identity, whether the request belongs to the OTHER space, before any
 * handler runs. The chat then says so in one line and offers ONE action that
 * switches (the existing, server-validated workspace switch) and opens the
 * target. When it cannot tell whose thing is meant, it asks ONE question with
 * the real options. It never chooses for the person, writes nothing, and
 * leaves every in-space request on its existing route.
 *
 * Pure: no IO, no React. The intent catalogue and the router stay the only
 * vocabulary; this file adds no second router.
 */
import { ORGANIZATION_WORKSPACE_ONLY_INTENTS } from "./intent-catalogue";
import { fold, type ConversationIntent } from "./intent-router";

/** The person's own things a sentence can name from inside an organization. */
export type PersonalTarget = "cv" | "journal" | "profile" | "calendar";

/** Where each target opens in the personal space. Existing routes only. */
export const PERSONAL_TARGET_PATH: Readonly<Record<PersonalTarget, string>> = {
  cv: "/cv",
  journal: "/dashboard/journal",
  profile: "/dashboard/profile",
  calendar: "/dashboard/planning",
};

const CV_INTENTS: ReadonlySet<ConversationIntent> = new Set<ConversationIntent>([
  "cv",
  "cv-view",
  "cv-export",
  "cv-choose",
]);

/** Intents an organization ALSO answers (its journal, its overview, its
 *  calendar): personal only when the sentence says "my". */
const SHARED_TARGET: Readonly<Partial<Record<ConversationIntent, PersonalTarget>>> = {
  "journal-recent": "journal",
  profile: "profile",
  "calendar-view": "calendar",
};

/** First person SINGULAR possessives, folded (fold() strips diacritics and
 *  lower-cases), in the product's locales. */
const MY = new Set([
  // lt (savo = one's own, said of oneself in a request)
  "mano", "savo",
  // en
  "my", "mine",
  // pl
  "moj", "moje", "moja", "mojego", "mojej", "moim",
  // ru
  "мой", "мое", "моя", "мою", "моего", "моем", "моей",
  // de
  "mein", "meine", "meinen", "meinem", "meiner", "meines",
  // nl
  "mijn",
  // sv / no / da
  "mitt", "min", "mina", "mit",
  // et / lv
  "minu", "mans", "mana", "manu",
]);

/** Words that put the thing in the ORGANIZATION: "our", "the team's", "the
 *  workers'". Folded stems, matched as a token prefix. */
const ORG_STEMS = [
  // our
  "musu", "our", "nasz", "наш", "unser", "onze", "vart", "meie",
  // team / staff / workers / company / organization
  "komand", "darbuotoj", "imon", "organizacij", "brigad", "kandidat",
  "team", "staff", "worker", "employee", "company", "organi", "candidate",
  "zespol", "pracowni", "firm", "kandydat",
  "команд", "сотрудни", "работник", "компани", "организац", "кандидат",
  "mitarbeiter", "unternehmen",
  "werknemer", "medewerker", "bedrijf",
  "anstalld", "foretag",
];

/** A candidate's CV is read on the candidates route, never redirected. */
const CANDIDATE_STEMS = ["kandidat", "candidate", "kandydat", "кандидат"];

/** Where the organization's own record opens. */
export const ORGANIZATION_HISTORY_PATH = "/dashboard/company/history";

function tokens(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

function saysMy(words: readonly string[]): boolean {
  return words.some((w) => MY.has(w));
}

function saysOrganization(words: readonly string[]): boolean {
  return words.some((w) => ORG_STEMS.some((s) => w.startsWith(s)));
}

export type CrossSpaceDecision =
  /** Acting for an organization; the sentence asks for the person's own thing. */
  | { readonly kind: "to-personal"; readonly target: PersonalTarget }
  /** Acting for an organization; "CV" with no owner: the person's or a candidate's? */
  | { readonly kind: "ask-whose-cv" }
  /** Acting for an organization; the ORGANIZATION's own record ("our company's
   *  CV"): its work history, in this same space. */
  | { readonly kind: "organization-history" }
  /** In the personal space; the sentence asks for an organization action. */
  | { readonly kind: "to-organization" }
  | null;

/**
 * Whether a routed request belongs to the OTHER space.
 *
 * `hasOrganization`: the person belongs to at least one organization
 * workspace, so an organization request can be taken there. Without one,
 * `null`: the existing handler keeps its own honest answer.
 */
export function crossSpaceRequest(input: {
  readonly intent: ConversationIntent;
  readonly text: string;
  readonly identity: "person" | "company";
  readonly hasOrganization: boolean;
}): CrossSpaceDecision {
  const { intent, text, identity } = input;
  if (identity === "company") {
    const words = tokens(text);
    if (CV_INTENTS.has(intent)) {
      if (saysOrganization(words)) {
        // "Kandidato CV" is a candidate's: the candidates route answers it.
        if (words.some((w) => CANDIDATE_STEMS.some((c) => w.startsWith(c)))) return null;
        return { kind: "organization-history" };
      }
      return saysMy(words) ? { kind: "to-personal", target: "cv" } : { kind: "ask-whose-cv" };
    }
    const target = SHARED_TARGET[intent];
    if (target && saysMy(words) && !saysOrganization(words)) return { kind: "to-personal", target };
    return null;
  }
  if (input.hasOrganization && (ORGANIZATION_WORKSPACE_ONLY_INTENTS as readonly string[]).includes(intent)) {
    return { kind: "to-organization" };
  }
  return null;
}
