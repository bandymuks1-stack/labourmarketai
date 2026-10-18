/**
 * DOES THE SENTENCE ASK ABOUT A WEEK? (owner command 2026-09-29 §21:
 * "Parodyk, ką dirbau šią savaitę" → the calendar becomes the visual answer.)
 *
 * Pure and narrow. The chat's own reply to the sentence is unchanged; this
 * only decides whether the workspace ALSO opens the calendar panel, whose
 * first element is this week's work rhythm. Accent-insensitive, six
 * languages; anything that does not name a week keeps today's behaviour.
 */
const WEEK_RX =
  /(savait|\bweek\b|недел|woche|\bweek\b|tydzie|tygodni|tygodn)/;

export function asksAboutAWeek(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return WEEK_RX.test(t);
}
