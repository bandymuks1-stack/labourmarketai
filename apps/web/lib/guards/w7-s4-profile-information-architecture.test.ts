import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W7-S4 — profile information architecture.
 *
 * Two blocks left `/dashboard/profile` for the surface that already owned
 * their subject matter, and the last two unnamed perceivable inputs on the
 * page were given accessible names.
 *
 *   `#managed-companies`  →  `/dashboard/network`  (network-organizations)
 *   `MessageButton`       →  `/dashboard/network`  (network-relationships)
 *
 * A move is only honest if the capability survives it. Every row of the
 * old→new map in `docs/audits/W7_S4_PROFILE_INFORMATION_ARCHITECTURE.md` §3 is
 * asserted here: gone from the old page, PRESENT on the new one, same data
 * source, same destination, and — for the organizations block — the three
 * things the destination did not previously have.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * A move this deliberate leaves prose behind explaining WHY the block left —
 * and that prose necessarily names the thing that moved. Asserting absence
 * against raw source would therefore fail on the explanation itself, and the
 * only way to make it pass would be to delete the reasoning. Absence is
 * asserted against CODE, so a comment can document the move without either
 * weakening the guard or being censored by it.
 */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const PROFILE = code("app/[locale]/dashboard/profile/page.tsx");
const NETWORK = code("app/[locale]/dashboard/network/page.tsx");
const COMM_LIST = code("app/[locale]/dashboard/communication/page.tsx");
const COMM_DETAIL = code(
  "app/[locale]/dashboard/communication/[conversationId]/page.tsx",
);

describe("W7-S4 — the profile no longer carries the moved blocks", () => {
  it("the managed-companies section is gone", () => {
    expect(PROFILE).not.toMatch(/id="managed-companies"/);
    expect(PROFILE).not.toMatch(/data-testid="profile-managed-companies"/);
    expect(PROFILE).not.toMatch(/data-testid="profile-add-company"/);
  });

  it("no quick-nav chip points at the removed anchor", () => {
    // A jump chip whose target left the page is a dead control — worse than
    // no chip, because it silently does nothing when tapped.
    expect(PROFILE).not.toMatch(/#managed-companies/);
  });

  it("the message-company button is gone", () => {
    expect(PROFILE).not.toMatch(/<MessageButton/);
    expect(PROFILE).not.toMatch(/labelKey="messageCompany"/);
  });

  it("both moved reads left with their blocks", () => {
    expect(PROFILE).not.toMatch(/getOwnedOrganizations\(/);
    expect(PROFILE).not.toMatch(/getEmployerOwnerProfileId\(/);
  });

  it("the destination stays reachable from the page that lost the block", () => {
    // The move is allowed to relocate a capability, not to hide it. The
    // handoff lives in the EXISTING header action row — no replacement card.
    expect(PROFILE).toMatch(/data-testid="profile-network-link"/);
    expect(PROFILE).toMatch(/\/dashboard\/network/);
  });
});

describe("W7-S4 — organizations: capability preserved on /dashboard/network", () => {
  it("the canonical section still lists the owned organizations", () => {
    expect(NETWORK).toMatch(/data-testid="network-organizations"/);
    expect(NETWORK).toMatch(/getOwnedOrganizations\(/);
    expect(NETWORK).toMatch(/network-org-\$\{o\.id\}/);
  });

  it("the destination of an organization row is unchanged", () => {
    expect(NETWORK).toMatch(/\/dashboard\/company/);
  });

  it("the add-company action came with the block", () => {
    // The profile was the ONLY place a one-company owner could start a
    // second organization: the header role-switcher offers "add Įmonė" only
    // to a profile holding no company identity at all.
    expect(NETWORK).toMatch(/data-testid="network-add-company"/);
    expect(NETWORK).toMatch(/\/dashboard\/start\/company/);
    expect(NETWORK).toMatch(/company\.noCompanyCta/);
  });

  it("the zero-company state came with the block", () => {
    // The section used to render only when `organizations.length > 0`, so a
    // person with no company would have been shown nothing at all.
    expect(NETWORK).toMatch(/company\.noCompanyDesc/);
    expect(NETWORK).not.toMatch(/\{organizations\.length > 0 && \(/);
  });

  it("the individual-activity note came with the block", () => {
    expect(NETWORK).toMatch(/individual\.desc/);
  });

  it("the copy is the same keys, not a retranslation", () => {
    // Reusing the exact `marketplaceHub.*` keys the profile rendered is what
    // makes this a move rather than a rewrite: no new key, no new string, no
    // locale left behind.
    expect(NETWORK).toMatch(/getTranslations\("marketplaceHub"\)/);
    expect(PROFILE).not.toMatch(/getTranslations\("marketplaceHub"\)/);
  });
});

describe("W7-S4 — messaging: capability preserved on /dashboard/network", () => {
  it("the worker→company entry point renders there", () => {
    expect(NETWORK).toMatch(/data-testid="network-message-employer"/);
    expect(NETWORK).toMatch(/labelKey="messageCompany"/);
  });

  it("it is still resolved by the same reader", () => {
    expect(NETWORK).toMatch(/getEmployerOwnerProfileId\(/);
  });

  it("no dead button: it renders only when an employer resolves", () => {
    expect(NETWORK).toMatch(/employerOwnerProfileId &&/);
  });

  it("the reader shares a batch instead of adding a serial stage", () => {
    // Moving a read must not re-introduce the waterfall W7-S3 removed.
    expect(NETWORK).toMatch(
      /await Promise\.all\(\[[\s\S]*?getEmployerOwnerProfileId\(\)/,
    );
  });

  it("the entry point exists exactly once across the two candidate pages", () => {
    const total =
      (PROFILE.match(/labelKey="messageCompany"/g) ?? []).length +
      (NETWORK.match(/labelKey="messageCompany"/g) ?? []).length;
    expect(total, "messageCompany entry points").toBe(1);
  });

  it("the counterpart-trust P0 guard was respected, not relaxed", () => {
    // `W7_S1_PROFILE_HUB_OVERVIEW.md` §11 proposed
    // `/dashboard/communication` for this button.
    // `message-counterpart-restricted.test.ts` forbids a contact CTA on both
    // thread surfaces — a button beside a permission-restricted counterparty
    // is a path to a stranger. The destination changed; the guard did not.
    for (const page of [COMM_LIST, COMM_DETAIL]) {
      expect(page).not.toMatch(/MessageButton/);
    }
  });
});

describe("W7-S4 — the last two unnamed perceivable inputs are named", () => {
  const EXTERNAL = code("components/app/external-profiles-section.tsx");
  const CV_PANEL = code("components/app/cv-input-panel.tsx");

  it("the external-profile URL field has a programmatic name", () => {
    expect(EXTERNAL).toMatch(/<Label id="external-profile-url-label">/);
    expect(EXTERNAL).toMatch(/aria-labelledby="external-profile-url-label"/);
  });

  it("the image-OCR seam file input has a programmatic name", () => {
    expect(CV_PANEL).toMatch(/id="cv-image-ocr-label"/);
    expect(CV_PANEL).toMatch(/aria-labelledby="cv-image-ocr-label"/);
  });

  it("both names point at the VISIBLE label, never a duplicated string", () => {
    // W7-S2's precedent: an `aria-label` repeating the visible text is two
    // copies that drift. `aria-labelledby` cannot.
    expect(EXTERNAL).not.toMatch(/aria-label=\{labels\.url\}/);
    expect(CV_PANEL).not.toMatch(/aria-label=\{tImport\("imageOcr\.label"\)\}/);
  });

  it("the OCR seam is still honestly disabled", () => {
    // Naming a control must never make an unavailable one look available.
    expect(CV_PANEL).toMatch(/disabled\s*\n?\s*aria-disabled="true"/);
  });
});

describe("W7-S4 — no new route, no new module home", () => {
  it("the destination is a pre-existing route", () => {
    expect(() => read("app/[locale]/dashboard/network/page.tsx")).not.toThrow();
  });

  it("the profile grew no replacement section for what it lost", () => {
    const sections = (PROFILE.match(/<section\b/g) ?? []).length;
    expect(sections, "profile <section> count").toBeLessThanOrEqual(2);
  });
});
