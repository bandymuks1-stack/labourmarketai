import type { PlayerCardMode } from "@/lib/player-card/card-modes";

/**
 * WHICH LENS DID THE PERSON ASK FOR? (owner command 2026-09-29 §21, item 4:
 * the chat opens the Player Card in the mode the sentence asks for).
 *
 * The intent router already decided THAT the card answers the sentence
 * ("mano kortelė", "kokie mano įgūdžiai patvirtinti?"). This only reads
 * WHICH part of the same card to bring forward. Pure and conservative:
 * a sentence that names no lens opens IDENTITY — the whole card — so a
 * guess can never hide anything.
 *
 * Order matters: skills before records (a question about confirmed SKILLS
 * is about skills), history before work ("kur dirbau anksčiau" is history,
 * "kur dirbu" is work).
 */
const RULES: readonly [PlayerCardMode, RegExp][] = [
  ["skills", /(igudz|gebejim|kompetencij|\bskills?\b|навык|умени|f[aä]higkeit|kompetenz|vaardighe|umiej[eę]tno)/],
  ["history", /(istorij|anksciau|dirbau|\bhistory\b|worked\b|previous\s+jobs?|истори|раньше\s+работал|verlauf|fr[uü]her|geschiedenis|historia|pracowa[lł]em)/],
  ["evidence", /(irasai|irasu|irodym|dokument|\brecords?\b|\bdocuments?\b|записи|документ|nachweis|eintr[aä]ge|bewijs|registraties|wpisy|dowod)/],
  ["next", /(galimyb|toliau|kur\s+galiu|\bnext\b|opportunit|where\s+can\s+i|дальше|возможност|weiter|m[oö]glichkeit|volgende|kansen|dalej|mo[zż]liwo[sś]c)/],
  ["work", /(kur\s+dirbu|dirbu\s+dabar|valand|\bhours\b|work\s+now|current\s+work|сейчас\s+работаю|часы|arbeite\s+jetzt|stunden|werk\s+nu|uren|pracuj[eę]\s+teraz|godzin)/],
];

export function cardModeFromText(text: string | null | undefined): PlayerCardMode {
  if (!text) return "identity";
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  for (const [mode, rx] of RULES) if (rx.test(t)) return mode;
  return "identity";
}
