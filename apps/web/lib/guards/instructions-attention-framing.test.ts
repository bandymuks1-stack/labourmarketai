import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Attention-instructions framing guard (slice instructions-attention-v2, PR F2).
 *
 * Real new work instructions are surfaced inside "Kas dabar svarbu / Mano
 * pranešimai" as attention-required project communication — not hidden on a
 * separate page. Honest by construction: shown only for genuinely-unread
 * instructions; nothing (no fake count / urgency) when there are none.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));
const att = (j: Record<string, unknown>) =>
  (j.instructions as { attention: Record<string, string> }).attention;
const comp = read("components/app/attention-instructions.tsx");
const commPage = read("app/[locale]/dashboard/communication/page.tsx");
const lib = read("lib/instructions/instructions.ts");

describe("instructions surface inside 'Kas dabar svarbu / Mano pranešimai'", () => {
  it("the messages page mounts the attention block", () => {
    expect(commPage).toMatch(/<AttentionInstructions\b/);
  });
  it("the attention block links to the full instructions page", () => {
    expect(comp).toMatch(/href="\/dashboard\/instructions"/);
    expect(comp).toMatch(/data-testid="attention-instruction-view"/);
  });
});

describe("honest — only real unread instructions, nothing when none", () => {
  it("renders null when there is nothing to attend to (no fake urgency/count)", () => {
    expect(comp).toMatch(/items\.length === 0\) return null/);
  });
  it("is driven by real unread data (last_read_at), not invented", () => {
    expect(comp).toMatch(/listAttentionInstructions/);
    expect(lib).toMatch(/last_read_at/);
    // an instruction counts as attention only when newer than last_read_at
    expect(lib).toMatch(/Date\.parse\(ins\.createdAt\)\s*>\s*Date\.parse\(lr\)/);
  });
  it("shows the ORIGINAL text (translation is not ready yet), not a fake translation", () => {
    expect(comp).toMatch(/ins\.originalText/);
    expect(comp).not.toMatch(/translatedText/);
  });
});

describe("attention copy is calm + present in LT + EN, no fake urgency", () => {
  it("LT frames it as 'Kas dabar svarbu / Reikia jūsų dėmesio'", () => {
    expect(att(lt).eyebrow).toMatch(/svarbu/i);
    expect(att(lt).title).toMatch(/dėmesio/i);
  });
  it("EN mirrors the framing", () => {
    expect(att(en).eyebrow).toMatch(/matters now/i);
    expect(att(en).title).toMatch(/attention/i);
  });
  it("both locales expose all attention keys + invent no fake signal", () => {
    for (const j of [lt, en]) {
      for (const k of ["eyebrow", "title", "subtitle", "from", "viewCta"]) {
        expect(att(j)[k], `attention.${k}`).toBeTruthy();
      }
    }
    const blob = [JSON.stringify(att(lt)), JSON.stringify(att(en))].join(" ");
    expect(blob).not.toMatch(/\d+\s+(new|unread|nauj)|someone viewed|employer is interested|skubiai|urgent now/i);
  });
});
