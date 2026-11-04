import { parseCvDate, TRAINING_TYPE_SLUG, type CvDatePart } from "./structured-parse";

/**
 * THE PERSON'S CORRECTIONS BEFORE A CV PROPOSAL IS SAVED (owner 2026-11-04, UF-3).
 *
 * The parser proposes; the person may change any field before confirming. These
 * rules turn what they typed into the input of the SAME confirm actions a
 * proposal uses, so a corrected fact is stored exactly like an uncorrected one
 * and reaches the Living CV the same way. It stays self-declared either way:
 * nothing here confirms or verifies anything.
 *
 * `null` means the typed value cannot be saved; the row says so and nothing is
 * sent. An empty date or year is "not stated", never a guess.
 */
export type CvFieldEdits = Readonly<Record<string, string>>;

/** A date as the person sees it, at the precision that was stated. */
export function cvDateText(part: CvDatePart | null | undefined): string {
  if (!part) return "";
  const mm = part.month !== null ? `-${String(part.month).padStart(2, "0")}` : "";
  const dd = part.day !== null ? `-${String(part.day).padStart(2, "0")}` : "";
  return `${part.year}${mm}${dd}`;
}

function typedDate(text: string): { readonly part: CvDatePart | null } | null {
  const t = text.trim();
  if (t === "") return { part: null };
  const part = parseCvDate(t);
  return part ? { part } : null;
}

function typedYear(text: string): { readonly year: number | null } | null {
  const t = text.trim();
  if (t === "") return { year: null };
  return /^(?:19|20)\d{2}$/.test(t) ? { year: Number.parseInt(t, 10) } : null;
}

function typedText(text: string, max: number): string | null {
  const t = text.trim();
  return t.length >= 3 && t.length <= max ? t : null;
}

export function workHistoryInput(
  w: {
    readonly title: string;
    readonly startYear: number | null;
    readonly endYear: number | null;
    readonly start?: CvDatePart | null;
    readonly end?: CvDatePart | null;
    readonly isCurrent: boolean;
  },
  edits: CvFieldEdits,
) {
  const title = typedText(edits.title ?? w.title, 200);
  const start = typedDate(edits.start ?? cvDateText(w.start ?? (w.startYear ? { year: w.startYear, month: null, day: null } : null)));
  const end = typedDate(edits.end ?? cvDateText(w.end ?? (w.endYear ? { year: w.endYear, month: null, day: null } : null)));
  if (!title || !start || !end) return null;
  // An end typed in closes an entry the CV called current.
  const isCurrent = w.isCurrent && end.part === null;
  const earliest = (p: CvDatePart) => p.year * 10000 + (p.month ?? 1) * 100 + (p.day ?? 1);
  const latest = (p: CvDatePart) => p.year * 10000 + (p.month ?? 12) * 100 + (p.day ?? 31);
  if (start.part && end.part && latest(end.part) < earliest(start.part)) return null;
  return {
    title,
    startYear: start.part?.year ?? null,
    endYear: end.part?.year ?? null,
    start: start.part,
    end: end.part,
    isCurrent,
  };
}

/** Training and education are one record type told apart by the type slug. */
export type CvLearningKind = "education" | "training";

export function learningKind(educationTypeSlug: string): CvLearningKind {
  return educationTypeSlug === TRAINING_TYPE_SLUG ? "training" : "education";
}

export function educationInput(
  e: {
    readonly institution: string;
    readonly program: string | null;
    readonly educationTypeSlug: string;
    readonly startYear: number | null;
    readonly endYear: number | null;
  },
  edits: CvFieldEdits,
) {
  const institution = typedText(edits.institution ?? e.institution, 200);
  const programText = (edits.program ?? e.program ?? "").trim();
  const start = typedYear(edits.startYear ?? (e.startYear ? String(e.startYear) : ""));
  const end = typedYear(edits.endYear ?? (e.endYear ? String(e.endYear) : ""));
  if (!institution || programText.length > 200 || !start || !end) return null;
  if (start.year !== null && end.year !== null && end.year < start.year) return null;
  const kind = (edits.kind as CvLearningKind | undefined) ?? learningKind(e.educationTypeSlug);
  // Changing the kind drops a type the person has just said is wrong; keeping
  // it leaves the parser's better guess (college, vocational…) in place.
  const educationTypeSlug =
    kind === learningKind(e.educationTypeSlug)
      ? e.educationTypeSlug
      : kind === "training"
        ? TRAINING_TYPE_SLUG
        : "other";
  return {
    institution,
    program: programText === "" ? null : programText,
    educationTypeSlug,
    startYear: start.year,
    endYear: end.year,
  };
}

export function certificateInput(c: { readonly title: string; readonly year: number | null }, edits: CvFieldEdits) {
  const title = typedText(edits.title ?? c.title, 160);
  const year = typedYear(edits.year ?? (c.year ? String(c.year) : ""));
  return title && year ? { title, year: year.year } : null;
}

export function achievementInput(a: { readonly title: string }, edits: CvFieldEdits) {
  const title = typedText(edits.title ?? a.title, 160);
  return title ? { title } : null;
}

/** What a line the parser could not place becomes, in the section the person chose. */
export function editedText(original: string, edits: CvFieldEdits): string | null {
  return typedText(edits.text ?? original, 200);
}
