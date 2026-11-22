import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE PRESET INVITE IS ONE LINE (UX_GAPS 2026-11-18 I-4).
 *
 * The institution's "Invite students" door already names the type, the
 * organization and the relationship, yet the panel showed eight controls,
 * three of them asking again what the door had said, at 36 px.
 *
 * When the URL presets all three, they render as ONE read-only line with the
 * existing labels, the link is the default channel, and the fields are 44 px.
 * Any other address keeps the full panel exactly as it was.
 */
const ROOT = join(__dirname, "..", "..");
const panel = readFileSync(join(ROOT, "components/app/invite-panel.tsx"), "utf8");
const spec = (f: string) => readFileSync(join(ROOT, "tests/e2e", f), "utf8");

describe("I-4 — a preset invitation reads as one line", () => {
  it("preset means: an organization type, one of the caller's organizations, a closed-list relationship", () => {
    expect(panel).toMatch(
      /const preset =\s*\(ORG_INVITATION_TYPES as readonly string\[\]\)\.includes\(defaultType \?\? ""\) &&\s*organizations\.some\(\(o\) => o\.id === defaultOrganizationId\) &&\s*RELATIONSHIP_INVITE_CHOICES\.some\(\(c\) => c\.slug === defaultRelationshipSlug\);/,
    );
  });

  it("the three choices render as one read-only line with existing labels only", () => {
    const line = panel.match(/<p\s+data-testid="invite-preset"[\s\S]*?<\/p>/)?.[0] ?? "";
    expect(line).toMatch(/data-type=\{type\}/);
    expect(line).toMatch(/data-organization=\{organizationId\}/);
    expect(line).toMatch(/data-relationship=\{relationshipSlug\}/);
    expect(line).toMatch(
      /\{t\(`types\.\$\{type\}`\)\} · \{presetOrganizationName\} · \{tRelationships\(relationshipSlug\)\}/,
    );
    // No helper text joins the line: no new key is read inside it.
    expect(line.match(/\bt\(/g)).toHaveLength(1);
  });

  it("the selects hide only under the preset; the full panel keeps them", () => {
    expect(panel).toMatch(/\{preset \? \(\s*<p/);
    expect(panel).toMatch(/data-testid="invite-type"/);
    expect(panel.match(/\{needsOrg && !preset && \(/g)).toHaveLength(2);
    expect(panel).toMatch(/data-testid="invite-organization"/);
    expect(panel).toMatch(/data-testid="invite-capacity"/);
    // What the chosen capacity still needs is said under the preset too.
    expect(panel).toMatch(/\{preset && blockedChoice && capacityBlockedNotice\}/);
  });

  it("the link is the default channel and the fields are 44 px only under the preset", () => {
    expect(panel).toMatch(/useState<"email" \| "link">\(preset \? "link" : "email"\)/);
    expect(panel).toMatch(/const fieldHeight = preset \? "min-h-11" : "min-h-9";/);
    const form = panel.slice(panel.indexOf("<form onSubmit"), panel.indexOf("</form>"));
    for (const id of ["invite-recipient-language", "invite-seats", "invite-name", "invite-role"]) {
      const at = form.indexOf(`data-testid="${id}"`);
      expect(at, id).toBeGreaterThan(0);
      expect(form.slice(at, at + 200), id).toContain("${fieldHeight}");
    }
    // The send button is a 44 px touch target on every screen (acceptance matrix 2026-11-21:
    // it measured 40 px on a touch tablet and phone).
    const submit = form.slice(form.indexOf('data-testid="invite-submit"'), form.indexOf('data-testid="invite-submit"') + 200);
    expect(submit).toMatch(/className="[^"]*\bmin-h-11\b/);
    expect(submit).not.toMatch(/\bmin-h-10\b/);
    // The mode switch stays, so a person can still choose e-mail.
    expect(panel).toMatch(/data-testid=\{`invite-mode-\$\{m\}`\}/);
  });

  it("the learner-invite specs read the line instead of the hidden select", () => {
    for (const f of [
      "signup-isolated.spec.ts",
      "recognition-chain-isolated.spec.ts",
      "phone-journeys-isolated.spec.ts",
      "prod-learning-practice.spec.ts",
      "prod-recognition-chain.spec.ts",
    ]) {
      expect(spec(f), f).toMatch(/getByTestId\("invite-preset"\)/);
      expect(spec(f), f).toMatch(/toHaveAttribute\("data-relationship", "(student|intern)"/);
    }
  });
});
