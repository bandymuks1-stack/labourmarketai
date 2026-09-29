import { readProfessionStatement, type ProfessionStatementReading } from "@/lib/structuring/role-label";

/**
 * EVERY PROFESSION A SENTENCE STATES — 0, 1 or N (owner continuation
 * 2026-09-29: "Esu pastolininkas", "Dar dirbu ir stogdengiu", "Esu
 * pastolininkas ir stogdengys"). The one reader (`readProfessionStatement`)
 * answers one phrase; a list joined by "ir / and / , …" is read clause by
 * clause, each clause carrying the sentence's own verb. Nothing is inferred —
 * a clause the reader cannot read adds nothing. Pure.
 */
const VERB = /(?:^|[^\p{L}])(esu|dirbu|dirbau|i am|i'm|i work as|я|работаю|ich bin|ik ben|jestem)(?![\p{L}])/iu;
const JOIN = /\s*,\s*|\s+(?:ir|and|и|und|en|oraz|i)\s+/iu;

export function readStatedProfessions(text: string): ProfessionStatementReading[] {
  const out: ProfessionStatementReading[] = [];
  const seen = new Set<string>();
  const add = (r: ProfessionStatementReading | null) => {
    if (!r) return;
    const key = (r.professionSlug ?? r.label).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };
  for (const sentence of (text ?? "").split(/(?<=[.!?])\s+/u)) {
    add(readProfessionStatement(sentence));
    const verb = VERB.exec(sentence)?.[1] ?? null;
    if (!verb) continue;
    const parts = sentence.split(JOIN).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    for (const part of parts) {
      add(readProfessionStatement(part) ?? readProfessionStatement(`${verb} ${part}`));
    }
  }
  return out;
}
