/**
 * WHICH PROJECT DID THE SENTENCE NAME? (COMPANY Chat ↔ visual loop walk,
 * production 2026-09-29). "Pridėk užduotį projektui Testinis projektas: …"
 * left the task form's project empty: the chat required the WHOLE stored title
 * ("[QA-SYNTHETIC] Testinis projektas - NEREAGUOTI") inside the sentence, so a
 * task the person tied to a project would have been saved without it.
 *
 * A title's CORE is its words without bracketed tags or a " - " suffix. A
 * project is named when every core word appears in the sentence as the start
 * of one of its words (Lithuanian case endings: "Testiniam projektui"). The
 * answer is a project only when EXACTLY ONE matches — otherwise nothing is
 * guessed and the person picks. Pure.
 */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function coreWords(title: string): string[] {
  const core = title.replace(/\[[^\]]*\]/g, " ").split(/\s[-–—]\s/u)[0] ?? "";
  return fold(core)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);
}

function stem(w: string): string {
  return w.length >= 5 ? w.slice(0, -2) : w.length === 4 ? w.slice(0, -1) : w;
}

export function projectNamedInSentence<P extends { readonly value: string; readonly label: string }>(
  sentence: string,
  projects: readonly P[],
): P | null {
  const words = fold(sentence ?? "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const hits = projects.filter((p) => {
    const core = coreWords(p.label);
    return core.length > 0 && core.every((c) => words.some((w) => w.startsWith(stem(c))));
  });
  return hits.length === 1 ? hits[0]! : null;
}
