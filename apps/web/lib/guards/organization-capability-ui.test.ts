import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  CAPABILITY_CHOICES,
  SELF_DECLARABLE_CAPABILITIES,
  partitionCapabilities,
  isSelfDeclarable,
} from "@/lib/organizations/capability-choices";
import { ORGANIZATION_ROLES } from "@/lib/product-gate/organization-roles";

/**
 * "WHAT DOES YOUR ORGANIZATION DO?" — the screen that made a live table usable.
 *
 * `organization_roles` shipped and for a while had no user-facing path at all:
 * an education institution could hold the education capability in the database
 * and had nowhere to say so. This guard protects the three things that make
 * the screen honest rather than merely present.
 *
 *   1. NO DATABASE VOCABULARY REACHES A HUMAN. The reader is an institution's
 *      administrator. They must never meet `training_provider`,
 *      `workforce_provider` or `role_slug`.
 *   2. NOTHING IS OFFERED THAT THE MODEL CANNOT STORE. "We provide services"
 *      has no counterpart in the ten seeded roles, so it is not offered —
 *      inventing a backend capability for UI completeness would be a promise
 *      the database cannot keep.
 *   3. A CONTROL THAT CANNOT BE TURNED OFF DOES NOT LOOK LIKE ONE. The write
 *      path is additive by design, so an already-declared capability renders
 *      as settled, never as a ticked box that silently refuses to untick.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

const CARD = read("components", "app", "organization-capabilities-card.tsx");
const ACTIONS = read("lib", "organizations", "capability-actions.ts");
const READ = read("lib", "organizations", "capability-read.ts");
const CHOICES = read("lib", "organizations", "capability-choices.ts");

/** Every locale that actually has a UI message file. `fi` is deliberately not
 *  one — it is a taxonomy/recognition locale, not a UI locale. */
function uiLocales(): string[] {
  return readdirSync(join(WEB, "messages"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

describe("no database vocabulary reaches a human", () => {
  it("no capability slug appears in ANY locale's user copy", () => {
    // Only genuinely TECHNICAL identifiers. Two of the ten role slugs —
    // `client` and `employer` — are also ordinary words that belong in natural
    // copy ("We are the client"), so banning the bare strings would forbid
    // correct English rather than protect anyone. What must never appear is a
    // snake_case identifier or a table name: those are only ever database
    // vocabulary, in every language.
    const banned = [
      ...ORGANIZATION_ROLES.filter((r) => r.includes("_")),
      "role_slug",
      "organization_role_types",
      "organization_roles",
      "relationship_slug",
    ];
    for (const loc of uiLocales()) {
      const p = join(WEB, "messages", `${loc}.json`);
      if (!existsSync(p)) continue;
      const parsed = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
      const block = parsed.organizationCapabilities;
      if (!block) continue;
      const blob = JSON.stringify(block);
      for (const slug of banned) {
        expect(
          blob.includes(slug),
          `locale "${loc}" leaks the raw identifier "${slug}" into user copy`,
        ).toBe(false);
      }
    }
  });

  it("every UI locale actually has the copy", () => {
    const missing = uiLocales().filter((loc) => {
      const parsed = JSON.parse(
        readFileSync(join(WEB, "messages", `${loc}.json`), "utf8"),
      ) as Record<string, unknown>;
      return !parsed.organizationCapabilities;
    });
    expect(missing, `locales without capability copy: ${missing.join(", ")}`).toEqual([]);
  });

  it("the card renders translated labels, never the slug", () => {
    // The slug is the value it stores; it must only ever be a key or a testid.
    expect(CARD).toContain("t(c.labelKey)");
    expect(CARD).not.toMatch(/>\s*\{c\.slug\}\s*</);
  });
});

describe("only what the model can really store is offered", () => {
  it("every offered capability is one of the seeded roles", () => {
    for (const c of CAPABILITY_CHOICES) {
      expect(
        (ORGANIZATION_ROLES as readonly string[]).includes(c.slug),
        `"${c.slug}" is offered but is not a seeded organization role`,
      ).toBe(true);
    }
  });

  it("education is offered, and it is the FIRST thing an institution can say", () => {
    expect(SELF_DECLARABLE_CAPABILITIES).toContain("training_provider");
    expect(CAPABILITY_CHOICES[0]?.slug).toBe("training_provider");
  });

  it("platform-partner roles are not self-declarable", () => {
    // Granted by agreement, not by ticking a box on your own profile.
    for (const slug of [
      "payroll_provider",
      "logistics_provider",
      "verification_provider",
    ]) {
      expect(isSelfDeclarable(slug), `"${slug}" must not be self-declarable`).toBe(
        false,
      );
    }
  });

  it("the write path refuses anything not offered", () => {
    expect(ACTIONS).toContain("filter(isSelfDeclarable)");
  });
});

describe("the screen tells the truth about what it can undo", () => {
  it("a declared capability is settled, not an untickable checkbox", () => {
    const { settled, offered } = partitionCapabilities(["training_provider"]);
    expect(settled.map((c) => c.slug)).toEqual(["training_provider"]);
    expect(offered.map((c) => c.slug)).not.toContain("training_provider");
  });

  it("an organization really can declare several at once", () => {
    const { settled } = partitionCapabilities(["training_provider", "employer"]);
    expect(settled).toHaveLength(2);
  });

  it("the card says out loud why removal is absent", () => {
    expect(CARD).toMatch(/cannot revoke|cannot be turned off/i);
  });
});

describe("this is not a second classification system", () => {
  it("the module names the axis it is NOT", () => {
    // companies.company_type is the INDUSTRY and holds one value; this is what
    // the organization DOES and holds many. Merging them would rebuild the
    // single-value trap the orchestration lock forbids.
    expect(CHOICES).toMatch(/company_type/);
    expect(CHOICES).toMatch(/NOT A SECOND CLASSIFICATION/i);
  });

  it("the READ is not a server action", () => {
    // Every export of a `"use server"` module becomes a server action. A page
    // rendering a capability list performs no action, and putting the read
    // behind that boundary broke the whole company page.
    // The DIRECTIVE, not prose that mentions it: both files legitimately
    // discuss `"use server"` in their docblocks, and a substring check reads
    // the explanation as the thing being explained.
    const directive = (src: string) => src.trimStart().split(/\r?\n/)[0].trim();
    expect(directive(ACTIONS)).toBe('"use server";');
    expect(directive(READ)).toBe('import "server-only";');
    expect(ACTIONS).not.toContain("export async function readOrganizationCapabilities");
  });

  it("ownership is enforced by the RPC, not by the action module", () => {
    expect(ACTIONS).toContain("add_organization_role_v1");
    // A client-trusted ownership check would be the security hole here.
    expect(ACTIONS).not.toMatch(/owner_profile_id\s*===/);
  });
});
