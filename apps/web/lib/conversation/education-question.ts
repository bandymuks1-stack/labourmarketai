/**
 * THE INSTITUTION'S QUESTIONS ABOUT ITS STUDENTS (window 6, lane C) — PURE.
 *
 * ── THE DEFECT THIS EXISTS TO FIX ──────────────────────────────────────────
 * Prod walk 2026-09-06 (ca96605b), college staff acting for their
 * institution, four sentences a lecturer types on the first day:
 *   "rodyk programos rezultatus"           → the programme LIST (outcomes exist
 *                                            only on the company page block);
 *   "kokių įgūdžių trūksta mano studentams?" → the OWNER'S OWN worker skill gap
 *                                            ("Nieko netrūksta: turi visus…");
 *   "kurie studentai tinka šiam darbdaviui?" → "write to the employer from an
 *                                            offer" — the worker's answer;
 *   "kur mano studentai gali atlikti praktiką?" → the owner's own internship
 *                                            search ("tau nieko nematoma").
 * Wrong actor every time: the institution asked, the worker was answered.
 *
 * ── WHAT THIS MODULE IS ────────────────────────────────────────────────────
 * Given the sentence the router already classified as `programmes` (the
 * institution's family), it names WHICH question about students it is, so the
 * chat can answer from the institution's real reads (outcomes — the ONE
 * aggregate the k-anonymous RPC returns) or state the privacy boundary
 * honestly (an institution never reads a student's skills, documents or
 * journal — owner ruling 2026-08-27). `null` = not a question; the existing
 * command modes (create / cohort / assign / list) apply.
 *
 * Folded, ASCII `\w` avoided on purpose (Lithuanian letters), five+ locales.
 */

export type EducationQuestionKind =
  | "outcomes" // what did my students achieve → the aggregate outcomes read
  | "students-fit" // which students fit an employer → privacy boundary
  | "students-skills" // what skills do my students lack → privacy boundary
  | "students-practice"; // where can my students do practice → how internships reach them

export const EDUCATION_QUESTION_KINDS: readonly EducationQuestionKind[] = [
  "outcomes",
  "students-fit",
  "students-skills",
  "students-practice",
];

export function isEducationQuestionKind(v: unknown): v is EducationQuestionKind {
  return typeof v === "string" && (EDUCATION_QUESTION_KINDS as readonly string[]).includes(v);
}

const STUDENTS = /(student|mokin|besimokan|learner|absolvent|schüler|leerling|студент|учащ)/;
const OUTCOMES = /(rezultat|outcome|result|ergebnis|resultat|uitkomst|результат)/;
const PRACTICE = /(praktik|stažuot|stazuot|internship|apprentice|trainee|praktikum|\bstage\b|stagiair|стажир|практик)/;
const SKILLS = /(įgūd|igud|gebėjim|gebejim|skill|kompeten|fähigkeit|faehigkeit|vaardighe|навык|умени|trūksta|truksta|missing|lack|fehl|ontbre|не\s*хват)/;
const FIT = /(tinka|tinkam|suit|fit|match|passen|passt|geschikt|подход|darbdav|employer|arbeitgeber|werkgever|работодат)/;

/** Which question about students the sentence asks, else `null`. */
export function educationQuestionKind(text: string): EducationQuestionKind | null {
  const q = (text ?? "").toLowerCase();
  if (OUTCOMES.test(q)) return "outcomes";
  if (!STUDENTS.test(q)) return null;
  if (PRACTICE.test(q)) return "students-practice";
  if (SKILLS.test(q)) return "students-skills";
  if (FIT.test(q)) return "students-fit";
  return null;
}
