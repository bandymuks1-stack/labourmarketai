import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CANONICAL_APP_RPCS } from "@/lib/security/canonical-authenticated-rpcs";

/**
 * Withdraw a contact-disclosure ask (owner decision 3, 2026-09-14) — GREEN
 * CONNECT.
 *
 * The lifecycle was asymmetric. An employer could ask for a person's contact
 * details and watch the answer arrive, and had no way to un-ask; the worker
 * already had both a response and a revocation path. `withdraw_contact_
 * disclosure_request_v1` had existed since 20260716120000 with EXECUTE held by
 * `authenticated`, and NOTHING in the product had ever called it.
 *
 * This guard pins the two properties that make the connection safe, both of
 * which are easy to lose in a later refactor:
 *
 *  1. it stays a CONNECT — the existing RPC, no new table, route, privacy model
 *     or authority. If someone later "improves" this by writing to the table
 *     directly, the DB-side window and the append-only audit row are bypassed;
 *  2. only an OPEN (`created`) ask exposes the control. The RPC refuses
 *     anything else, so the UI must not imply otherwise.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const actions = read("lib/privacy/contact-disclosure-actions.ts");
const button = read("components/app/request-contact-details-button.tsx");
const scouting = read("app/[locale]/dashboard/company/scouting/page.tsx");

describe("withdraw is a CONNECT to existing authority, not a new privacy model", () => {
  it("goes through the existing RPC", () => {
    expect(actions).toContain('"withdraw_contact_disclosure_request_v1"');
  });

  it("the RPC is already on the canonical authenticated-RPC list", () => {
    // If it were not, this connect would be widening the executable surface
    // rather than using what the owner already granted.
    expect(CANONICAL_APP_RPCS).toContain(
      "withdraw_contact_disclosure_request_v1",
    );
  });

  it("never writes the request row from the app layer", () => {
    // The DB enforces the window (status must be 'created') and writes the
    // append-only contact_disclosure_log_change row in the same transaction.
    // A direct table write from here would silently skip both.
    const writes =
      /\.from\(\s*["']contact_disclosure_requests["']\s*\)[\s\S]{0,400}?\.(update|insert|upsert|delete)\(/g;
    expect(
      actions.match(writes),
      "contact_disclosure_requests must only be WRITTEN through its RPCs — the " +
        "status window and the audit row live there.",
    ).toBeNull();
  });

  it("adds no new route: the control lives on the existing scouting surface", () => {
    expect(scouting).toContain("RequestContactDetailsButton");
    expect(scouting).toContain("contactRequest.withdraw");
  });
});

describe("only an open ask can be taken back", () => {
  it("the control renders inside the `created` branch", () => {
    const createdBranch = button.slice(
      button.indexOf('effectiveStatus === "created"'),
      button.indexOf('withdrawState === "done"'),
    );
    expect(createdBranch).toContain("contact-request-withdraw-");
  });

  it("no other status branch offers it", () => {
    for (const status of ["accepted", "declined", "expired"]) {
      const idx = button.indexOf(`effectiveStatus === "${status}"`);
      if (idx === -1) continue;
      const branch = button.slice(idx, idx + 700);
      expect(
        branch.includes("contact-request-withdraw-"),
        `the ${status} branch must not offer a withdraw control — the RPC refuses it`,
      ).toBe(false);
    }
  });

  it("the app surfaces the DB's refusal rather than hiding it", () => {
    // `not_open` is a real answer (someone answered the ask between render and
    // click), not an error to swallow.
    expect(actions).toContain('res.error === "not_open"');
    expect(button).toContain("withdrawNotOpen");
  });

  it("withdrawing the ASK is not presented as revoking the DISCLOSURE", () => {
    // They are different objects with different revocation paths. The action's
    // contract must not claim to touch the consent ledger.
    expect(actions).toMatch(/Withdrawing the ASK is not a disclosure revocation/);
    expect(actions).not.toMatch(
      /withdraw_contact_disclosure_request_v1[\s\S]{0,300}revoke_employer_data_disclosure/,
    );
  });
});
