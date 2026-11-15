import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * USERS NEVER SEE INTERNAL DEVELOPMENT OR LEGAL-PROCESS NOTES
 * (owner order P0, 2026-11-15).
 *
 * The product shows a person what they can do and the plain state of a
 * feature ("Not available yet", "Online payment is not available yet").
 * It never shows how the team is building, testing or approving it:
 * "Ruošiama" / "being prepared" / "in preparation" / "coming soon",
 * "Peržiūri teisininkai" / "under legal review" / "awaiting lawyers",
 * "test version" / "test mode (internal testing)", "confirmed by the owner",
 * "owner activation". Those sentences are process notes, not product facts.
 *
 * WHAT STAYS (and is NOT matched here):
 *  · the honest user-facing state of a feature that is off — doctrine §7/§18
 *    forbid pretending it works;
 *  · the doctrine-required "preview" / "concept" / "example" label on
 *    illustrative data (lib/guards/product-copy-forbidden-terms.test.ts);
 *  · legal provisions and disclaimers themselves (their meaning is pinned by
 *    the legal guards — legal-pages-public-clean, legal-entity-truth);
 *  · real workflow states: a request "in review", a draft the person saves,
 *    "will be confirmed" as the preview of the person's own confirm action.
 *
 * Scope: every catalogue under messages/ (base files and sub-catalogues, all
 * locales) plus the hard-coded UI strings of the public pricing / legal
 * surfaces and the lib/legal, lib/marketing and answer-engine chrome modules.
 */

const WEB = join(__dirname, "..", "..");
const MESSAGES = join(WEB, "messages");

/** Internal-process phrases, per language. Tight on purpose: each one names
 *  the development, testing or approval process, never a product fact. */
const INTERNAL_NOTE: ReadonlyArray<RegExp> = [
  // lt
  /(?<![\p{L}])ruošiam(a|as|i|os)(?![\p{L}])/iu,
  /teisinink\p{L}* (peržiūr|tikrin|derin|rengi)/iu,
  /(peržiūr|tikrin)\p{L}* teisinink/iu,
  /laukiama teisinink/iu,
  /testinė versija/iu,
  /testin\p{L}* (apmokėjim|režim|versij)/iu,
  /testavimo režim/iu,
  /vidiniam testavimui/iu,
  /patvirtint\p{L}* savinink/iu,
  /baigiame ruošti/iu,
  // en
  /being prepared/i,
  /\bin preparation\b/i,
  /\bunder preparation\b/i,
  /coming soon/i,
  /coming later/i,
  /legal review/i,
  /awaiting (legal|lawyers?|owner)/i,
  /lawyers? (are )?review/i,
  /\btest version/i,
  /test[- ]mode/i,
  /internal testing/i,
  /owner (sign-off|signs off|activation|activates)/i,
  /confirmed by the owner/i,
  /finishing the [\p{L} /]* functionality/iu,
  // ru
  /(?<!не )готовится/iu,
  /(?<!не )готовятся/iu,
  /в подготовке/iu,
  /тестов\p{L}* (режим|верси|оплат|оформлен)/iu,
  /внутреннего тестирования/iu,
  /юрист\p{L}* (провер|рассматр|изуча)/iu,
  /(утверждены|подтверждены) владельцем/iu,
  // pl
  /w przygotowaniu/iu,
  /(jest|są|jeszcze|wciąż) przygotowywan(?!\p{L}* z pliku)/iu,
  /wersj\p{L}* testow/iu,
  /tryb\p{L}* testow/iu,
  /testowy zakup/iu,
  /prawni\p{L}* (sprawdz|weryfik|analiz)/iu,
  /potwierdzone przez właściciela/iu,
  // de
  /(?<![\p{L}])in vorbereitung(?![\p{L}])/iu,
  /(werden|noch) vorbereitet/iu,
  /testversion/iu,
  /testmodus/iu,
  /test-checkout/iu,
  /vom (inhaber|eigentümer) bestätigt/iu,
  /aktivierung durch den inhaber/iu,
  // nl
  /in voorbereiding/iu,
  /(wordt|worden) (nog )?voorbereid(?! op)/iu,
  /testversie/iu,
  /door de eigenaar bevestigd/iu,
  /activering door de eigenaar/iu,
  // sv
  /(?<![\p{L}])förbereds(?! från| utifrån)/iu,
  /under förberedelse/iu,
  /håller på att förberedas/iu,
  /testläge/iu,
  /testköp/iu,
  /kommer snart/iu,
  /granskas av jurist/iu,
  /bekräftade av ägaren/iu,
  // da / no / et / lv / fi (partial catalogues)
  /under forberedelse/iu,
  /bekræftet af ejeren/iu,
  /bekreftet av eieren/iu,
  /ettevalmistamisel/iu,
  /omaniku kinnitatud/iu,
  /tiek gatavots/iu,
  /apstiprinājis īpašnieks/iu,
  /tulossa pian/iu,
];

/** A bare roadmap badge ("Netrukus", "Скоро", "Wkrótce" …) as a whole value. */
const BARE_SOON = /^(netrukus|скоро|wkrótce|demnächst|binnenkort|snart|soon)\.?$/iu;

/**
 * Key paths that may keep a matching phrase, each with the reason.
 * Prefix entries end with ".".
 */
const EXEMPT: ReadonlyArray<{ key: string; why: string }> = [
  // Internal staff tooling — admin / superadmin routes only, never a user surface.
  { key: "admin.", why: "admin console (requireAdmin)" },
  { key: "adminBilling.", why: "admin billing console" },
  { key: "adminPilots.", why: "admin console" },
  { key: "adminMetrics.", why: "admin console" },
  { key: "billingTest.", why: "rendered only by BillingTestCheckout on /dashboard/admin/billing" },
  { key: "talentPreview.", why: "superadmin-only owner review surface" },
  { key: "vacancySources.admin.", why: "admin console" },
  { key: "intelligence.inspector.", why: "admin intelligence-observations page" },
  { key: "intelligence.activation.", why: "admin activation checklist" },
  { key: "intelligence.sandbox.", why: "admin import sandbox" },
  { key: "languageFeedback.admin.", why: "admin console" },
  { key: "agentOs.", why: "admin agent-os page" },
  // Loading states: the system is preparing THIS result for the person right now.
  { key: "profileAvatar.preparing", why: "upload progress label" },
  { key: "photo.preparing", why: "upload progress label" },
  { key: "conversation.results.pendingInline", why: "loading state of a requested result" },
  // Legal disclaimer — its meaning is legal and must not be reworded here.
  { key: "documents.disclaimer", why: "legal disclaimer (who checks final conformity)" },
];

const isExempt = (key: string) =>
  EXEMPT.some(({ key: e }) => (e.endsWith(".") ? key.startsWith(e) : key === e));

function catalogueFiles(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(abs).isDirectory()) out.push(...catalogueFiles(abs, r));
    else if (name.endsWith(".json")) out.push(r);
  }
  return out;
}

function strings(node: unknown, path: string, out: [string, string][]): [string, string][] {
  if (typeof node === "string") out.push([path, node]);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) strings(v, path ? `${path}.${k}` : k, out);
  return out;
}

const hits = (value: string) =>
  INTERNAL_NOTE.filter((re) => re.test(value)).map(String).concat(BARE_SOON.test(value.trim()) ? [String(BARE_SOON)] : []);

describe("the internal-note pattern", () => {
  it("catches the process notes the owner named, in every language", () => {
    for (const bad of [
      "Ruošiama",
      "Kainos ruošiamos — nieko įsigyti dar negalima.",
      "Sąlygas peržiūri teisininkai.",
      "Laukiama teisininkų patvirtinimo.",
      "Testinė versija",
      "Prices are being prepared — nothing can be bought yet.",
      "Final wording is under legal review.",
      "Awaiting lawyers.",
      "Test checkout (internal testing)",
      "Prices are confirmed by the owner and in force.",
      "Coming soon",
      "Цены готовятся — купить пока ничего нельзя.",
      "W przygotowaniu",
      "Die Preise werden vorbereitet",
      "In voorbereiding",
      "Priserna förbereds – inget kan köpas ännu.",
      "Netrukus",
    ])
      expect(hits(bad), bad).not.toEqual([]);
  });

  it("lets the honest user-facing state and real workflow wording through", () => {
    for (const fine of [
      "Not available yet",
      "Dar neprieinama",
      "Online payment is not available yet; contact us.",
      "Payments are not enabled. Nothing is purchasable here and no payment method is needed.",
      "Your request is in review.",
      "Save draft",
      "Example — not a real person or real data",
      "Pavyzdys",
      "Netrukus baigsis dokumento galiojimas.",
      "Автоматическое предложение сейчас не готовится.",
      "Ladda upp historiska arbetsdata – personer, arbetsplatser, datum och timmar förbereds från filen; du bekräftar.",
      "Informational only — not legal advice.",
    ])
      expect(hits(fine), fine).toEqual([]);
  });
});

describe("catalogues carry no internal development or legal-process notes", () => {
  const files = catalogueFiles(MESSAGES);
  it("scans the base catalogues of the seven active locales", () => {
    for (const l of ["lt", "en", "ru", "pl", "de", "nl", "sv"]) expect(files).toContain(`${l}.json`);
  });
  for (const file of files) {
    it(`${file}: no internal note in any user-facing value`, () => {
      const json = JSON.parse(readFileSync(join(MESSAGES, file), "utf8"));
      const offenders = strings(json, "", [])
        .filter(([key]) => !isExempt(key))
        .flatMap(([key, value]) => {
          const h = hits(value);
          return h.length ? [`${key} = ${JSON.stringify(value)} (${h.join(", ")})`] : [];
        });
      expect(offenders).toEqual([]);
    });
  }
});

/** Hard-coded UI strings: comments are stripped, the rest must be clean. */
const SOURCE_DIRS = ["lib/legal", "lib/marketing", "app/[locale]/(marketing)/pricing", "app/[locale]/(marketing)/legal"];
const SOURCE_FILES = ["lib/answer-engine/chrome.ts"];

function sources(): string[] {
  const out = [...SOURCE_FILES];
  const walk = (rel: string) => {
    const abs = join(WEB, rel);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs)) {
      const r = `${rel}/${name}`;
      if (statSync(join(WEB, r)).isDirectory()) walk(r);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(r);
    }
  };
  SOURCE_DIRS.forEach(walk);
  return out;
}

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("hard-coded UI strings on pricing, legal and marketing surfaces carry no internal notes", () => {
  for (const rel of sources()) {
    it(rel, () => {
      const code = stripComments(readFileSync(join(WEB, rel), "utf8"));
      const found = INTERNAL_NOTE.filter((re) => re.test(code)).map(String);
      expect(found).toEqual([]);
    });
  }
});
