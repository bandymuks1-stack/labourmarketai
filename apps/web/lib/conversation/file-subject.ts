/**
 * WHOSE FILE IS THIS? — the subject/owner dimension the product never had.
 * Pure: no server-only import, no IO, no env.
 *
 * ── The defect ────────────────────────────────────────────────────────────
 * The conversation's file vocabulary encodes WHICH SURFACE a document belongs
 * to and never WHOSE DOCUMENT IT IS. Measured on the real router:
 *
 *     "Įkeliu 20 kandidatų CV."          -> cv          (the person's OWN import)
 *     "I am uploading 20 candidate CVs." -> candidates  (the demand surface)
 *
 * Two different wrong answers in two languages, and the Lithuanian one is the
 * dangerous kind: a bulk candidate import aimed straight at the uploader's own
 * professional history. Every CV confirm action in
 * `lib/profile/cv-section-import-actions.ts` takes NO subject parameter — the
 * subject is always the caller, resolved server-side. That is a good safety
 * property and it is also why a mis-read sentence writes other people's
 * careers into the uploader's own record.
 *
 * ── What this module does ─────────────────────────────────────────────────
 * It reads TWO things a human states plainly and the product never listened
 * for: whose the file is, and what kind of file it is. It then says which
 * EXISTING capability serves that combination — or, honestly, that none does.
 *
 * It does NOT parse, store, upload, resolve a person, or name a row. Subject
 * RESOLUTION (which candidate, which worker) belongs to
 * `lib/organization-evidence/person-matching.ts`, which already refuses to
 * invent a person; this module only decides which door the file is standing
 * at, and whether that door exists.
 *
 * ── The safety rule ───────────────────────────────────────────────────────
 * A file may never be attached to the wrong person. So the DEFAULT is not
 * "self" — it is `unstated`, which asks. Only an explicit first-person
 * possessive makes a file the speaker's own.
 */
import { fold } from "@/lib/conversation/intent-router";
import { guessDocumentType } from "@/lib/conversation/document-type-guess";

/** Whose the file is. `unstated` is a question, never an assumption. */
export type FileSubject =
  | "self"
  | "another_person"
  | "many_people"
  | "organization"
  | "cohort"
  | "unstated";

/**
 * What kind of file it is, in the product's own terms. `document` covers the
 * whole certificate/permit/ID family — `guessDocumentType` already owns that
 * taxonomy and is reused rather than restated.
 */
export type FileKind = "cv" | "document" | "work_evidence" | "workforce_table" | "unstated";

export interface FileIntent {
  readonly subject: FileSubject;
  readonly kind: FileKind;
  /** The document type slug when the sentence named one (reused taxonomy). */
  readonly documentTypeSlug: string | null;
}

/**
 * A DEPOSIT SIGNAL — the person is HANDING something over, not asking about
 * it. Without one this module returns null and the ordinary intent path runs.
 *
 * This is what keeps slice D safe: "Noriu pamatyti savo CV" and "rodyk CV"
 * carry no deposit signal, so they stay reads.
 */
const DEPOSIT = [
  // lt — "čia mano CV", "įkeliu", "prisegu", "siunčiu", "pridedu"
  "cia ", "stai ", "ikeliu", "ikelsiu", "ikelk", "prisegu", "prisegiau",
  "siunciu", "pridedu", "pridesiu", "imetu", "uzkeliu",
  // en
  "here is", "here are", "here's", "attaching", "attached", "i am uploading",
  "i'm uploading", "uploading", "upload", "sending you", "this is my",
  "this is the", "these are",
  // ru
  "вот ", "это мо", "это резюме", "загружаю", "прикрепляю", "отправляю", "прилагаю",
  // nl
  "hierbij", "dit is mijn", "dit zijn", "ik upload", "bijgevoegd",
  // de
  "hier ist", "hier sind", "anbei", "ich lade", "beigefugt", "das ist mein",
] as const;

/** First-person possessive — the ONLY thing that makes a file the speaker's. */
const SELF = [
  "mano ", "savo ", "my ", "mijn ", "mein ", "meine ", "moj", "мой", "моя",
  "мое", "моё", "мои", "свое", "своё", "свой", "своя",
] as const;

/** Another single human, named by role rather than by name. */
const ANOTHER_PERSON = [
  "kandidato ", "kandidata ", "darbuotojo ", "zmogaus ", "asmens ",
  "candidate", "applicant", "worker's", "employee's", "person's",
  "кандидата", "соискателя", "работника", "сотрудника",
  "kandidaat", "sollicitant", "medewerker", "bewerber", "mitarbeiter",
] as const;

/** Several humans. Plural role nouns, and any of them beside a number. */
const MANY_PEOPLE = [
  "kandidatu", "darbuotoju", "zmoniu", "asmenu",
  "candidates", "applicants", "workers", "employees", "people",
  "кандидатов", "соискателей", "работников", "сотрудников",
  "kandidaten", "sollicitanten", "medewerkers", "bewerber", "mitarbeiter",
] as const;

/** The organization itself is the owner ("mūsų darbuotojų", "įmonės"). */
const ORGANIZATION = [
  "imones ", "imone ", "musu ", "kompanijos ", "organizacijos ",
  "our ", "company's ", "the company", "of the company",
  "нашей компании", "наших", "компании", "организации",
  "ons bedrijf", "onze ", "unser", "unsere", "der firma", "firmen",
] as const;

/** Learners — an institution's cohort. */
const COHORT = [
  "studentu", "studento", "mokiniu", "mokinio", "besimokanciu", "grupes ",
  "students", "student's", "learners", "cohort", "class list",
  "студентов", "учащихся", "группы",
  "studenten", "leerlingen", "schuler", "kursteilnehmer",
] as const;

/** Photographs / images of finished work. */
const WORK_EVIDENCE = [
  "nuotrauk", "foto", "photo", "picture", "image", "фото", "снимк",
  "afbeelding", "bild", "bilder",
] as const;

/** A table of people rather than one person's document. */
const TABLE = ["excel", "xlsx", ".csv", "csv", "lentel", "sarasas", "sąrašas", "spreadsheet", "tabel", "tabelle", "таблиц", "список"] as const;

const hasAny = (hay: string, needles: readonly string[]): boolean =>
  needles.some((n) => hay.includes(n));

/**
 * A READBACK, NOT A DEPOSIT (issue #1689, defect G).
 *
 * "Parodyk įkeltą nuotrauką", "show the photo I just uploaded", "покажи
 * загруженное фото", "zeig das hochgeladene Foto", "laat de geüploade foto
 * zien" — every one of these carries the upload verb in a PAST form: the
 * person is asking about a file already handed over, not handing one over.
 * The English one used to trip the DEPOSIT list on the bare stem "upload",
 * which read a question about a stored photo as a new file with no stated
 * owner — and asked whose it was.
 *
 * These forms are blanked before the deposit test, so the sentence falls
 * through to the ordinary intent path (where the `evidence-photos` rule
 * answers it) unless it ALSO carries a genuine present deposit signal
 * ("čia mano įkeltas CV" is still a deposit — "čia" says so).
 */
// Written in already-FOLDED form (the query is folded before it is tested):
// "įkeltą" → "ikelta", "geüpload" → "geupload".
const READBACK_FORMS =
  /(?<!\p{L})(ikelt\p{L}*|uploaded|загружен\p{L}*|hochgeladen\p{L}*|geupload\p{L}*)(?!\p{L})/giu;

/** The sentence with its past upload forms removed — what the deposit test sees. */
export function withoutReadbackForms(folded: string): string {
  return folded.replace(READBACK_FORMS, " ");
}

/**
 * Read the file intent out of a sentence, or `null` when the sentence is not
 * handing a file over at all.
 *
 * Order matters and encodes the safety rule. The widest, most dangerous
 * subject wins: if a sentence mentions many people AND says "mano", the
 * plural reading is taken, because "mano kandidatų CV" is the agency's
 * candidates, not the agency owner's own history.
 */
export function readFileIntent(text: string): FileIntent | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const q = ` ${fold(raw)} `;
  if (!hasAny(withoutReadbackForms(q), DEPOSIT)) return null;

  const documentTypeSlug = guessDocumentType(raw);
  const evidence = hasAny(q, WORK_EVIDENCE);
  const table = hasAny(q, TABLE);

  // ── SUBJECT ─────────────────────────────────────────────────────────────
  //
  // Order encodes the safety rule, and it is NOT simply "widest first". An
  // explicit OWNER outranks a plural role noun, because "įmonės darbuotojų
  // Excel" states both ("the company's employees") and the organization is
  // the one that actually owns the file — and the organization door is the
  // one with person matching, explicit resolution and an atomic commit.
  //
  // What the order must never do is let a non-self sentence reach `self`.
  // `self` is last before `unstated` for exactly that reason, and a guard
  // pins that no subject except `self` can reach the self CV importer.
  const numbered = /\d/.test(q);
  let subject: FileSubject;
  if (hasAny(q, COHORT)) subject = "cohort";
  else if (hasAny(q, ORGANIZATION)) subject = "organization";
  else if (hasAny(q, MANY_PEOPLE) || (numbered && hasAny(q, ANOTHER_PERSON)))
    subject = "many_people";
  else if (hasAny(q, ANOTHER_PERSON)) subject = "another_person";
  else if (hasAny(q, SELF)) subject = "self";
  else subject = "unstated";

  // ── KIND ────────────────────────────────────────────────────────────────
  let kind: FileKind;
  if (evidence) kind = "work_evidence";
  else if (table) kind = "workforce_table";
  else if (documentTypeSlug === "cv") kind = "cv";
  else if (documentTypeSlug) kind = "document";
  else kind = "unstated";

  return { subject, kind, documentTypeSlug };
}

// ── Which EXISTING capability serves this file? ─────────────────────────────

/** The actor's current context, as the chat already knows it. */
export interface FileActorContext {
  /** The ACTIVE workspace, not who the person is. */
  readonly identity: "person" | "company";
  /** True when the active organization holds the education capability. */
  readonly educationWorkspace: boolean;
}

/**
 * `capability` names a door that EXISTS today; `unavailable` names a subject
 * the product understood and cannot yet serve. The distinction is the whole
 * point: an honest "we cannot do that yet" is what stops a candidate's CV
 * being written into the uploader's own history.
 */
export type FileRoute =
  | { readonly kind: "capability"; readonly capability: FileCapability }
  | { readonly kind: "ask_subject" }
  | { readonly kind: "needs_organization" }
  | { readonly kind: "unavailable"; readonly subject: FileSubject };

/** Doors that exist in the product today. Nothing here is new. */
export type FileCapability =
  /** `worker-cv-flow` → `cv-section-import-actions` (self, confirmed row by row). */
  | "self_cv_import"
  /** `worker.add-document` → `upsert_worker_document` (self). */
  | "self_document"
  /** `lib/organization-evidence/import-core` — sessions, person matching,
   *  preview, explicit resolve, one atomic commit, withdraw/reinstate. */
  | "organization_evidence_import";

export function routeFileIntent(
  intent: FileIntent,
  actor: FileActorContext,
): FileRoute {
  switch (intent.subject) {
    case "unstated":
      // NEVER default to self. Ask whose it is.
      return { kind: "ask_subject" };

    case "self":
      if (intent.kind === "cv") return { kind: "capability", capability: "self_cv_import" };
      if (intent.kind === "document") return { kind: "capability", capability: "self_document" };
      // A person's own work photos have no import door yet — the journal
      // takes work entries, not a standalone photo drop.
      return { kind: "unavailable", subject: "self" };

    case "another_person":
    case "many_people":
      // THE DEFECT THIS CLOSES. There is no candidate-CV import: every CV
      // confirm action binds to the caller. Saying so is the only safe
      // answer; routing to the self importer is what used to happen.
      return { kind: "unavailable", subject: intent.subject };

    case "organization":
      if (actor.identity !== "company") return { kind: "needs_organization" };
      // A table of the organization's people, or evidence about their work,
      // is exactly what the organization evidence import takes.
      if (intent.kind === "workforce_table" || intent.kind === "work_evidence") {
        return { kind: "capability", capability: "organization_evidence_import" };
      }
      return { kind: "unavailable", subject: "organization" };

    case "cohort":
      if (actor.identity !== "company" || !actor.educationWorkspace) {
        return { kind: "needs_organization" };
      }
      // Learners join by invitation today; there is no cohort FILE import.
      return { kind: "unavailable", subject: "cohort" };
  }
}
