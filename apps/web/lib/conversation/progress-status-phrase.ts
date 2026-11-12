import { foldText } from "@/lib/structuring/normalize";

/**
 * WHICH STATE A SENTENCE PUTS A TASK OR A STAGE IN (pure).
 *
 * "Uppgiften montera ställningen är blockerad" routed to `task-status` and
 * was then recorded as DONE: the chat handler read the state with a regex
 * that knew six languages and no Swedish, and "done" is the fallback. A
 * blocked task written down as finished is a wrong fact on a project, not a
 * missing convenience.
 *
 * The regex also lived TWICE inside the chat component — once for tasks, once
 * for stages — and the copies had already drifted (Polish `zablok` /
 * `rozpocz` in the first, absent from the second). One reader now; both
 * handlers call it.
 *
 * `done` stays the fallback on purpose: the router only sends a sentence here
 * once it has read a completion / start / block word, and the handler shows
 * the task and the new state for the person to see before anything else.
 */
export type StatedProgress = "blocked" | "in_progress" | "done";

// lt · en · de · nl · ru · pl — matched on the lower-cased sentence.
const BLOCKED_RE = /u[zž]strig|blokuot|sustoj|blocked|stuck|blockiert|geblokkeerd|vastgelopen|заблок|застрял|zablok/u;
const STARTED_RE = /prad[eė]|prasid[eė]|start|begonnen|angefangen|начал|rozpocz/u;
// sv — matched on the FOLDED sentence ("påbörjad" → "paborjad"). A bare
// `fast` is not read: it is an English word; "är / sitter / står fast" is.
const BLOCKED_SV_RE = /blockerad|stoppad|fastnat|(?:^|[^\p{L}])(?:ar|sitter|star|blev|kor)\s+fast(?![\p{L}])/u;
const STARTED_SV_RE = /paborja|borjat|borjade|(?:^|[^\p{L}])igang(?![\p{L}])|(?:^|[^\p{L}])pagar(?![\p{L}])/u;

export function readStatedProgress(sentence: string): StatedProgress {
  const lower = (sentence ?? "").toLowerCase();
  const folded = foldText(lower);
  if (BLOCKED_RE.test(lower) || BLOCKED_SV_RE.test(folded)) return "blocked";
  if (STARTED_RE.test(lower) || STARTED_SV_RE.test(folded)) return "in_progress";
  return "done";
}
