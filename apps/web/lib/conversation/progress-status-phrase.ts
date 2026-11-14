import { looksSwedish } from "@/lib/structuring/looks-swedish";
import { foldText } from "@/lib/structuring/normalize";

/**
 * WHICH STATE A SENTENCE PUTS A TASK OR A STAGE IN (pure).
 *
 * The chat's two status handlers (task, stage) each carried their own regex
 * and the same last line: anything that was not "blocked" or "started" was
 * DONE. Two wrong facts came out of that fallback:
 *
 *   • a BLOCKED task or stage in a language the regex did not know was written
 *     down as finished ("Uppgiften montera ställningen är blockerad"; the
 *     Polish "Etap fundamenty zablokowany" on the stage copy, which had
 *     drifted from the task copy);
 *   • a sentence that states NO state at all was written down as finished. The
 *     German question "Erkläre die Etappe Fundament" reached the stage handler
 *     through an unanchored Swedish `klar` (inside "erKLÄRe") and a company
 *     with one open stage of that name would have had it marked done by a
 *     question (independent review of PR 3261, finding 4).
 *
 * So there is ONE reader, and it has no fallback: it returns the state the
 * sentence SAYS — blocked, started, done — or `null` when it says none. A
 * handler that gets `null` writes nothing.
 *
 * Vocabulary. The words of the six earlier languages are exactly the ones the
 * two handlers and the router's `task-status` / `stage-status` rules already
 * read; the completion words were implicit (the fallback) and are spelled out
 * here from the router's own lists. The stage handler never read the Polish
 * `rozpocz…` (started) — that is kept as it was: a started Polish stage states
 * no state this reader knows, so nothing is written (before, it was written as
 * done). Swedish words are read only in a sentence `looksSwedish` reads as
 * Swedish, whole words only, and never from a question.
 */
export type StatedProgress = "blocked" | "in_progress" | "done";

/** Which handler asks — the two never shared one "started" list (see above). */
export type ProgressSubject = "task" | "stage";

// lt · en · de · nl · ru · pl — matched on the lower-cased sentence.
const BLOCKED_RE = /u[zž]strig|blokuot|sustoj|blocked|stuck|blockiert|geblokkeerd|vastgelopen|заблок|застрял|zablok/u;
const STARTED_RE: Readonly<Record<ProgressSubject, RegExp>> = {
  task: /prad[eė]|prasid[eė]|start|begonnen|angefangen|начал|rozpocz/u,
  stage: /prad[eė]|prasid[eė]|start|begonnen|angefangen|начал/u,
};
/** The completion words of the router's `task-status` / `stage-status` rules. */
const DONE_RE =
  /baigt|baigiau|atlikt|atlikau|u[zž]baig|padaryt|padariau|done|finished|complet|fertig|abgeschlossen|erledigt|klaar|afgerond|заверш|готов|сделан|сделал|выполн|wykonan|wykonał|zako[nń]cz|uko[nń]cz|skończył|skonczyl|gotow/u;

// sv — matched on the FOLDED sentence ("påbörjad" → "paborjad"), whole words.
// A bare `fast` is not read: it is an English word; "är / sitter / står fast" is.
const SV_BLOCKED_RE =
  /(?<![\p{L}])(?:blockerad|blockerat|blockerade|stoppad|stoppat|fastnat)(?![\p{L}])|(?<![\p{L}])(?:ar|sitter|star|blev|kor)\s+fast(?![\p{L}])/u;
const SV_STARTED_RE =
  /(?<![\p{L}])(?:paborjad|paborjat|paborjade|borjat|borjade|startad|startat|startade|igang|pagar)(?![\p{L}])/u;
const SV_DONE_RE =
  /(?<![\p{L}])(?:klar|klart|klara|fardig|fardigt|fardiga|gjord|gjort|avslutad|avslutat|avslutade|utford|utfort|slutford|slutfort|slutforde)(?![\p{L}])/u;

export function readStatedProgress(sentence: string, subject: ProgressSubject): StatedProgress | null {
  const raw = sentence ?? "";
  const lower = raw.toLowerCase();
  if (BLOCKED_RE.test(lower)) return "blocked";
  // A Swedish QUESTION states nothing ("Är etappen grund klar?").
  const swedish = looksSwedish(raw) && !/\?\s*$/u.test(raw);
  const folded = swedish ? foldText(lower) : "";
  if (swedish && SV_BLOCKED_RE.test(folded)) return "blocked";
  if (STARTED_RE[subject].test(lower)) return "in_progress";
  if (swedish && SV_STARTED_RE.test(folded)) return "in_progress";
  if (DONE_RE.test(lower)) return "done";
  if (swedish && SV_DONE_RE.test(folded)) return "done";
  return null;
}
