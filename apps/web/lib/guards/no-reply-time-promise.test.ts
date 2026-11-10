import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * NO REPLY-TIME PROMISE (owner decision 2026-11-10): "Nežadėti atsakymo per 24
 * valandas, kol nėra garantuoto aptarnavimo termino. Vietoje to nurodyti, kad
 * užklausa gauta ir komanda susisieks ją išnagrinėjusi."
 *
 * The request doors promised "we will contact you within 24 hours" in every
 * language while nothing guaranteed that term. No message in any catalog may
 * promise that we reply, contact or get back to someone within a time; saying
 * the request was received and the team gets in touch after reviewing it is
 * the honest form.
 *
 * Matched: a contact / reply verb near "within / in / per" + a number or a
 * word like "hour", "day", "business day", in every catalog language that
 * carries the namespace. Other uses of time ("last 24 h" telemetry, "more than
 * 24 h in one record") are not a promise and are not matched.
 */
const MESSAGES = join(__dirname, "..", "..", "messages");

const PROMISE = new RegExp(
  [
    // en
    String.raw`(contact|reply|respond|get back|hear from us|be in touch)[^.!?]{0,40}\b(within|in)\s+(\d+|one|a|two|24|48)\s*(h|hours?|days?|business days?|working days?)\b`,
    // de
    String.raw`(melden|antworten|kontaktieren|Rückmeldung)[^.!?]{0,40}\binnerhalb\s+(von\s+)?(\d+|einem|eines|zwei)\s*(Stunden?|Tag(en)?|Werktag(en)?)`,
    String.raw`innerhalb\s+(von\s+)?\d+\s*Stunden[^.!?]{0,40}(melden|antworten)`,
    // nl
    String.raw`binnen\s+(\d+|één|een|twee)\s*(uur|uren|dag(en)?|werkdag(en)?)[^.!?]{0,30}(contact|reageren|antwoord)`,
    String.raw`(contact|reageren|antwoorden)[^.!?]{0,40}binnen\s+(\d+|één|een|twee)\s*(uur|dag|werkdag)`,
    // lt
    String.raw`(susisieksime|atsakysime|susisiek\w*)[^.!?]{0,30}\bper\s+(\d+|vieną|dvi|parą)\s*(val\w*|dien\w*|darbo dien\w*|parą)?`,
    // pl
    String.raw`(skontaktujemy|odpowiemy|odezwiemy)[^.!?]{0,40}w ciągu\s+(\d+|jednego|dwóch)\s*(godzin\w*|dni|dnia)`,
    // ru
    String.raw`(свяжемся|ответим)[^.!?]{0,40}в течение\s+(\d+|одного|двух|суток)`,
  ].join("|"),
  "i",
);

function catalogs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) catalogs(p, out);
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

function strings(node: unknown, path: string, out: [string, string][]): [string, string][] {
  if (typeof node === "string") out.push([path, node]);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) strings(v, path ? `${path}.${k}` : k, out);
  return out;
}

describe("no message promises a reply time", () => {
  it("the pattern catches the promises it replaced", () => {
    for (const old of [
      "Send your request – we will contact you within 24 hours.",
      "Senden Sie Ihre Anfrage – wir melden uns innerhalb von 24 Stunden bei Ihnen.",
      "Stuur je aanvraag – we nemen binnen 24 uur contact met je op.",
      "Pateikite užklausą – susisieksime per 24 valandas.",
      "Wyślij zapytanie – skontaktujemy się z tobą w ciągu 24 godzin.",
      "Отправьте запрос – мы свяжемся с вами в течение 24 часов.",
    ])
      expect(old, old).toMatch(PROMISE);
    for (const fine of [
      "Operations telemetry recording (last 24h)",
      "{day}: {hours} h across 3 records — more than a day.",
      "Every working day is recorded in the work journal.",
    ])
      expect(fine, fine).not.toMatch(PROMISE);
  });

  it("every catalog in every language", () => {
    const offenders = catalogs(MESSAGES).flatMap((file) =>
      strings(JSON.parse(readFileSync(file, "utf8")), "", [])
        .filter(([, v]) => PROMISE.test(v))
        .map(([k]) => `${file.slice(MESSAGES.length + 1)}:${k}`),
    );
    expect(offenders).toEqual([]);
  });
});
