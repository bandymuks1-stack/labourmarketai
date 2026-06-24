import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Public-marketing copy sweep (fix/marketing-copy-evidence-sweep).
 *
 * The public marketing pitch (vision / journey / hero) uses the same quiet CV /
 * work-record language as the worker app — not "evidence / proof", and never a
 * confirmation / verification promise ("records are confirmed later", "a manager
 * or client confirms"). This is enforced across ALL locale files, with forbidden
 * stems for every shipped language (lt/en/ru + da/de/et/lv/nl/no/pl/sv) so a
 * regression in any locale fails the guard, not just the enforced trio.
 *
 * The product's anti-fake rejection label (`vision.controlRoom.fakeClaimsLabel`
 * = "Fake AI / matching / verified", status "Never used") is the ONE allowed
 * mention — it lists what the platform does NOT do — and is whitelisted by path.
 */

const messages = join(__dirname, "..", "..", "messages");
const MKT = ["vision", "journey", "hero"];
const FORBIDDEN = [
  // evidence / proof (noun) — public marketing must say CV / records instead
  /\bproof\b/i, /\bevidence\b/i,        // en
  /įrodym/i,                            // lt
  /доказательств/i,                     // ru
  /\bbevis/i,                           // da / no / sv (bevis, beviser)
  /dokumentation/i,                     // da (Dokumentation af færdigheder)
  /nachweis/i, /\bbeweis/i,             // de
  /tõend/i,                             // et
  /pierādīj/i,                          // lv
  /bewijs/i,                            // nl
  /dowód/i, /dowod/i,                   // pl
  // confirmation / verification stated as a promise (rejection label whitelisted by path)
  /confirm/i, /\bverif/i,               // en
  /patvirtin/i,                         // lt
  /подтвержд/i, /проверен/i,            // ru
  /bekræft/i, /verificer/i,             // da
  /bestätig/i, /geprüft/i, /verifizier/i, // de
  /kinnita/i,                           // et
  /apstiprin/i,                         // lv
  /bevestig/i, /geverif/i,              // nl
  /bekreft/i, /verifiser/i,             // no
  /potwierdz/i, /zweryfik/i,            // pl
  /bekräft/i, /verifier/i,              // sv
];

type Json = Record<string, unknown>;
const load = (rel: string): Json => JSON.parse(readFileSync(join(messages, rel), "utf8")) as Json;

function walk(o: unknown, path: string, out: Array<{ path: string; value: string }>): void {
  if (typeof o === "string") out.push({ path, value: o });
  else if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k, out);
  }
}

const LOCALES = readdirSync(messages).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));

describe("Guard: public marketing copy uses CV/records language, not evidence/proof", () => {
  for (const loc of LOCALES) {
    it(`${loc}: vision/journey/hero carry no evidence/proof/confirmer wording`, () => {
      const base = load(`${loc}.json`);
      const out: Array<{ path: string; value: string }> = [];
      for (const ns of MKT) if (base[ns]) walk(base[ns], ns, out);
      const offenders = out
        .filter((e) => !e.path.includes("fakeClaims")) // the anti-fake rejection label is allowed
        .filter((e) => FORBIDDEN.some((rx) => rx.test(e.value)))
        .map((e) => `${e.path}: ${e.value.slice(0, 70)}`);
      expect(offenders, `${loc} marketing forbidden wording:\n  ${offenders.join("\n  ")}`).toEqual([]);
    });
  }
});
