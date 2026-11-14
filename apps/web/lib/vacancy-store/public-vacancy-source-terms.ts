/**
 * A TYPED JOB WORD THE CATALOGUE HAS NO PROFESSION FOR (owner P0.1, 2026-11-14).
 *
 * The catalogue names 49 professions; a word that is one of them becomes the
 * profession filter (public-vacancy-profession-match.ts). About two thirds of
 * the live ads carry no catalogue profession, and the free-text search matches
 * the publisher's own words. So `slaugytoja`, `Krankenschwester`, `бухгалтер`
 * answered "0 vacancies" on a board holding thousands of nursing and accounting
 * ads (production, 2026-11-14: 2,385 for `sjuksköterska`, 921 for `sykepleier`).
 *
 * The search takes ONE term and the supply is published in more than one
 * language, so no single redirect is right and none is made. The board offers
 * the same job as it is written by each publisher, every language side by side,
 * each a normal search link. No country or language is preferred: the order is
 * the order of the language codes.
 *
 * Every publisher term here returned ads on production on 2026-11-14. A term
 * that stops matching is a plain search with an honest zero, never an error.
 *
 * PURE: no fs / net / env.
 */
import { foldForMatch, matchProfessionByLabel } from "./public-vacancy-profession-match";

/** Publisher terms by the language the ads are written in (ISO 639-1). */
type PublisherTerms = Readonly<Record<string, readonly string[]>>;

interface Occupation {
  /** What people type, in any language the site is read in. */
  readonly typed: readonly string[];
  readonly publisher: PublisherTerms;
}

const OCCUPATIONS: Readonly<Record<string, Occupation>> = {
  nurse: {
    typed: ["nurse", "registered nurse", "slaugytoja", "slaugytojas", "медсестра", "медбрат", "pielęgniarka", "pielęgniarz", "krankenschwester", "krankenpfleger", "verpleegkundige", "verpleegster"],
    publisher: { nb: ["sykepleier"], sv: ["sjuksköterska"] },
  },
  doctor: {
    typed: ["doctor", "physician", "gydytojas", "gydytoja", "врач", "lekarz", "arzt", "ärztin", "dokter"],
    publisher: { nb: ["lege"], sv: ["läkare"] },
  },
  accountant: {
    typed: ["accountant", "bookkeeper", "buhalteris", "buhalterė", "бухгалтер", "księgowy", "księgowa", "buchhalter", "buchhalterin", "boekhouder"],
    publisher: { nb: ["regnskapsfører", "regnskapsmedarbeider"], sv: ["redovisningsekonom", "ekonomiassistent"] },
  },
  salesperson: {
    typed: ["salesperson", "sales representative", "pardavimų vadybininkas", "менеджер по продажам", "przedstawiciel handlowy", "handlowiec", "vertriebsmitarbeiter", "vertegenwoordiger"],
    publisher: { nb: ["selger"], sv: ["säljare"] },
  },
  dentist: {
    typed: ["dentist", "odontologas", "стоматолог", "dentysta", "stomatolog", "zahnarzt", "tandarts"],
    publisher: { nb: ["tannlege"], sv: ["tandläkare"] },
  },
  physiotherapist: {
    typed: ["physiotherapist", "kineziterapeutas", "физиотерапевт", "fizjoterapeuta", "physiotherapeut", "fysiotherapeut"],
    publisher: { nb: ["fysioterapeut"], sv: ["fysioterapeut"] },
  },
  psychologist: {
    typed: ["psychologist", "psichologas", "психолог", "psycholog", "psychologe", "psycholoog"],
    publisher: { nb: ["psykolog"], sv: ["psykolog"] },
  },
  pharmacist: {
    typed: ["pharmacist", "vaistininkas", "фармацевт", "farmaceuta", "apotheker"],
    publisher: { nb: ["farmasøyt"], sv: ["farmaceut"] },
  },
  project_manager: {
    typed: ["project manager", "projektų vadovas", "руководитель проекта", "kierownik projektu", "projektleiter", "projectleider"],
    publisher: { nb: ["prosjektleder"], sv: ["projektledare"] },
  },
  social_worker: {
    typed: ["social worker", "socialinis darbuotojas", "социальный работник", "pracownik socjalny", "sozialarbeiter", "maatschappelijk werker"],
    publisher: { nb: ["sosionom"], sv: ["socialsekreterare", "socionom"] },
  },
  preschool_teacher: {
    typed: ["preschool teacher", "kindergarten teacher", "darželio auklėtoja", "воспитатель", "nauczyciel przedszkola", "erzieher", "erzieherin", "kleuterleider"],
    publisher: { nb: ["barnehagelærer"], sv: ["förskollärare"] },
  },
};

/** The one occupation a typed word names, or null when it names none or several. Each
 *  typed form is tried on its own, so two forms of one occupation never cancel out. */
function occupationFor(query: string): string | null {
  const hits = new Set<string>();
  for (const [key, o] of Object.entries(OCCUPATIONS)) {
    if (o.typed.some((label) => matchProfessionByLabel(query, [{ slug: key, label }]) === key)) {
      hits.add(key);
    }
  }
  return hits.size === 1 ? [...hits][0]! : null;
}

export interface PublisherTermLink {
  /** ISO 639-1 code of the language the ads are written in. */
  readonly language: string;
  readonly term: string;
}

/**
 * The publisher's words for the job a visitor typed, or an empty list.
 *
 * Empty when the word names no occupation here, names more than one, or is
 * already one of the publisher's own words (that search is the answer).
 */
export function publisherTermsForTypedWord(query: string): readonly PublisherTermLink[] {
  const key = occupationFor(query);
  if (!key) return [];
  const typed = foldForMatch(query);
  const links: PublisherTermLink[] = [];
  for (const language of Object.keys(OCCUPATIONS[key]!.publisher).sort()) {
    for (const term of OCCUPATIONS[key]!.publisher[language]!) {
      if (foldForMatch(term) === typed) return [];
      links.push({ language, term });
    }
  }
  return links;
}

/** For tests: every typed word and every publisher term. */
export const __SOURCE_TERM_OCCUPATIONS = OCCUPATIONS;
