import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Public legal pages are clean: they carry the policy text and nothing about
 * the document's drafting state.
 *
 * History: audit P1 replaced draft-note placeholders; CR train WAGON 2 then
 * added a visible "final wording pending owner and legal review" notice,
 * "still waiting for final legal wording" lists, a "being prepared" note on
 * terms, a review note on the marketplace rules and an "informational only"
 * disclaimer. Owner order 2026-10-23 (Meta Platform Term 4.a review of the
 * privacy policy): that meta-text is removed from every public legal page in
 * every served locale, and must not come back — in the page code or in the
 * served `legal` catalog namespace. The legal provisions themselves are
 * pinned elsewhere (legal-entity-truth, compliance-explanation-pack).
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const LEGAL = "app/[locale]/(marketing)/legal";
const LOCALES = ["lt", "en", "ru", "de", "pl", "nl"] as const;
const PAGES = [
  "privacy",
  "terms",
  "cookies",
  "data-protection",
  "data-access",
  "data-deletion",
  "marketplace-rules",
  "legal-notice",
] as const;

/** Drafting-state meta-text, per language. Tight phrases on purpose: honest
 *  product facts ("prepared but switched off", "honest history") stay legal. */
const META_TEXT: ReadonlyArray<RegExp> = [
  // en
  /pending (owner|legal|review)/i,
  /legal review/i,
  /not the final/i,
  /final (legal )?wording/i,
  /being prepared/i,
  /\bdraft\b/i,
  /\btemplate\b/i,
  /lawyer/i,
  /informational only/i,
  /not legal advice/i,
  /before payments are active/i,
  /payments are not active/i,
  // lt
  /galutin\w* teisin/i,
  /teisinink/i,
  /dar ruošiam/i,
  /juodrašt/i,
  /kol mokėjimai neaktyv/i,
  /mokėjimai dar neaktyv/i,
  /teisinė konsultacija|teisinių konsultacijų/i,
  // ru
  /окончательн\w* юридическ/i,
  /юрист/i,
  /ещё готовится/i,
  /черновик/i,
  /пока платежи не активны/i,
  /платежи пока не активны/i,
  /юридической консультаци/i,
  // de
  /endgültig\w* rechtlich/i,
  /anwalt/i,
  /noch vorbereitet/i,
  /entwurf/i,
  /bevor zahlungen aktiv/i,
  /zahlungen sind noch nicht aktiv/i,
  /keine rechtsberatung/i,
  // pl
  /ostateczn\w* brzmieni\w* prawn/i,
  /prawnik/i,
  /wciąż przygotowywan/i,
  /przed uruchomieniem płatności/i,
  /płatności nie są jeszcze aktywne/i,
  /porad\w* prawn/i,
  // nl
  /definitiev\w* juridisch/i,
  /advocaat/i,
  /nog wordt voorbereid/i,
  /voordat betalingen actief/i,
  /betalingen zijn nog niet actief/i,
  /juridisch advies/i,
];

function stringValues(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((v) => stringValues(v, out));
  else if (node && typeof node === "object")
    for (const v of Object.values(node as Record<string, unknown>)) stringValues(v, out);
  return out;
}

describe("legal pages render content, not drafting-state blocks", () => {
  for (const page of PAGES) {
    const src = read(`${LEGAL}/${page}/page.tsx`);
    it(`${page}: no Placeholder, no pending notice, no pending list, no disclaimer, no review note`, () => {
      expect(src).not.toMatch(/<Placeholder/);
      expect(src).not.toMatch(/t\("draftNote"\)/);
      expect(src).not.toMatch(/PendingLegal(Notice|Items)/);
      expect(src).not.toMatch(/LegalDisclaimer/);
      expect(src).not.toMatch(/pendingItems|pendingTitle|reviewNote|preparing\.body/);
    });
  }
  it("privacy, cookies and marketplace rules still render their real content", () => {
    expect(read(`${LEGAL}/privacy/page.tsx`)).toMatch(/privacy\.sections/);
    expect(read(`${LEGAL}/cookies/page.tsx`)).toMatch(/cookies\.items/);
    expect(read(`${LEGAL}/marketplace-rules/page.tsx`)).toMatch(/t\.raw\("rules"\)/);
    expect(read(`${LEGAL}/terms/page.tsx`)).toMatch(/terms\.sections/);
  });
  it("the shared legal-notes module no longer exports the drafting-state blocks", () => {
    const notes = read("components/marketing/legal-notes.tsx");
    expect(notes).not.toMatch(/export (async )?function (PendingLegalNotice|PendingLegalItems|LegalDisclaimer)/);
  });
});

describe("served legal catalogs carry no drafting-state meta-text", () => {
  for (const loc of LOCALES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legal = JSON.parse(read(`messages/${loc}.json`)).legal as any;
    it(`${loc}: the meta-text keys are gone`, () => {
      expect(legal.draftNote).toBeUndefined();
      expect(legal.pendingLegal).toBeUndefined();
      expect(legal.disclaimer).toBeUndefined();
      expect(legal.preparing?.body).toBeUndefined();
      expect(legal.marketplaceRules.reviewNote).toBeUndefined();
      expect(legal.privacy.pendingTitle).toBeUndefined();
      expect(legal.privacy.pendingItems).toBeUndefined();
      expect(legal.dataProtection.pendingTitle).toBeUndefined();
      expect(legal.dataProtection.pendingItems).toBeUndefined();
    });
    it(`${loc}: terms keeps its contact line`, () => {
      expect(typeof legal.preparing?.contact === "string" && legal.preparing.contact.length > 0).toBe(true);
    });
    it(`${loc}: no drafting-state phrase anywhere in the legal namespace`, () => {
      const values = stringValues(legal);
      for (const re of META_TEXT) {
        const hits = values.filter((v) => re.test(v));
        expect(hits, `${re}: ${hits.join(" | ")}`).toEqual([]);
      }
    });
  }
});

describe("the privacy policy names social sign-in and its recipients", () => {
  for (const loc of LOCALES) {
    const privacy = JSON.parse(read(`messages/${loc}.json`)).legal.privacy as {
      sections: { heading: string; items: string[] }[];
    };
    const blob = JSON.stringify(privacy.sections);
    it(`${loc}: Facebook, Google and LinkedIn sign-in are described`, () => {
      const social = privacy.sections.find((s) => /Facebook/.test(s.heading));
      expect(social, `${loc}: no sign-in section`).toBeTruthy();
      expect(social!.heading).toMatch(/Google/);
      expect(social!.heading).toMatch(/LinkedIn/);
    });
    it(`${loc}: the processors verifiable from code are named`, () => {
      for (const name of ["Supabase", "Stripe", "Cloudflare"]) expect(blob, name).toContain(name);
    });
  }
  it("the privacy page links the data-deletion page", () => {
    expect(read(`${LEGAL}/privacy/page.tsx`)).toContain('href="/legal/data-deletion"');
  });
});
