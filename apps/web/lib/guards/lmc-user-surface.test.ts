import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { activeLocales } from "@/lib/i18n/config";
import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";
import { lmcCommerceEnabled, LMC_FLAG_POLICY } from "@/lib/billing/lmc-flags";
import { LMC_UNIT_LABEL } from "@/lib/lmc/lmc-account";

const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

/**
 * "A ledger nobody can see is not a capability."
 *
 * The LMC ledger was proven correct on production — top-up, idempotent replay,
 * spend, overspend refused, foreign actor refused, refund clawback, append-only
 * — and had ZERO application readers. `lib/billing/lmc-flags.ts` held constants
 * and `lib/supabase/types.ts` held generated row types; that was the entire
 * footprint. These guards pin the surface that closes it, and — more
 * importantly — the four things it must never quietly become.
 */
describe("the LMC balance is reachable and honest", () => {
  it("the surface is mounted where a person looks for it", () => {
    const account = read("app/[locale]/dashboard/account/page.tsx");
    expect(account).toContain("LmcBalanceSection");
    expect(account).toContain(
      'import { LmcBalanceSection } from "@/components/app/lmc-balance-section"',
    );
  });

  it("a question about the balance resolves to the balance, not to a page top", () => {
    const entry = COMMAND_REGISTRY.find((e) => e.id === "lmc_balance");
    expect(entry, "the LMC command entry must exist").toBeTruthy();
    // The ANCHOR is the point: "how much LMC do I have" answered by dropping
    // somebody at the top of a settings page is not an answer.
    expect(entry?.route).toBe("/dashboard/account#lmc");
    for (const locale of ["lt", "en", "ru"] as const) {
      const terms = entry?.synonyms[locale] ?? [];
      expect(terms.length, `${locale} synonyms`).toBeGreaterThan(3);
      expect(terms).toContain("lmc");
    }
  });

  /**
   * The balance may only come from the database. A client that adds up
   * transactions would be a SECOND balance, and the two would disagree the
   * first time a lot expired — the view zeroes expired lots, a naive sum does
   * not.
   */
  it("the surface never computes a balance", () => {
    const ui = read("components/app/lmc-balance-section.tsx");
    const reader = read("lib/lmc/lmc-account.ts");
    // The canonical view is the only source.
    expect(reader).toContain("lmc_account_balances");
    // No summing anywhere on the read or the render path.
    for (const src of [ui, reader]) {
      expect(src).not.toContain("reduce(");
      expect(src).not.toContain(".sum(");
    }
  });

  /**
   * The ledger is RPC-only by construction (no INSERT/UPDATE/DELETE policy on
   * any LMC table, and service_role revoked). A reader that grew a write would
   * be reaching for a door the database has bricked up, and would fail at
   * runtime rather than in review — so it fails here instead.
   */
  it("the read layer performs no writes", () => {
    const reader = read("lib/lmc/lmc-account.ts");
    for (const forbidden of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
      expect(reader, `read layer must not call ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  /**
   * THE HONESTY INVARIANT, and the reason this file exists. A failed read must
   * reach the screen as a failed read. `state: "unavailable"` carries no
   * numeric field at all, so there is nothing for a renderer to accidentally
   * print as a balance — the type system, not a convention, is what prevents
   * "0 LMC" from being shown to somebody whose balance could not be read.
   */
  it("an unreadable balance can never be rendered as a number", () => {
    const reader = read("lib/lmc/lmc-account.ts");
    expect(reader).toContain('state: "unavailable"');
    expect(reader).toContain('state: "no_account"');
    // The error is checked BEFORE the data is used, on both reads.
    expect(reader).toContain("if (balance.error)");
    expect(reader).toContain("if (movements.error)");

    const ui = read("components/app/lmc-balance-section.tsx");
    // The unavailable branch renders its own message and returns; the balance
    // markup is unreachable from it.
    const unavailableAt = ui.indexOf('account.state === "unavailable"');
    const balanceAt = ui.indexOf('data-testid="lmc-available"');
    expect(unavailableAt).toBeGreaterThan(-1);
    expect(balanceAt).toBeGreaterThan(unavailableAt);
    expect(ui).toContain('data-testid="lmc-unavailable"');
  });

  /**
   * No invented commerce. Every LMC flag is false and the two that matter are
   * `owner_only` (the shared setter refuses every caller, including
   * service_role, by design). A top-up BUTTON here would be a control that
   * cannot work; the surface must carry the honest sentence instead.
   */
  it("offers no top-up control while top-up is closed", () => {
    expect(lmcCommerceEnabled()).toBe(false);
    expect(LMC_FLAG_POLICY.stripe_lmc_topups_enabled).toBe("owner_only");
    expect(LMC_FLAG_POLICY.live_payments_enabled).toBe("owner_only");

    const ui = read("components/app/lmc-balance-section.tsx");
    expect(ui).toContain("lmcCommerceEnabled()");
    expect(ui).toContain('data-testid="lmc-topup-state"');
    // No checkout, no price, no payment route on this surface.
    for (const forbidden of ["checkout", "stripe", "/pricing?", "price_"]) {
      expect(ui.toLowerCase(), `must not reference ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  /**
   * The unit label is a CONSTANT, not a translation. "LMC" is byte-identical in
   * every locale, which is precisely what an untranslated string looks like to
   * the i18n ratchet — so it lives beside the peg it names, the same way
   * `NATIVE_LOCALE_NAMES` does, rather than teaching the ratchet an exception.
   */
  it("the unit label is language-invariant and stays out of the catalogue", () => {
    expect(LMC_UNIT_LABEL).toBe("LMC");
    expect(read("components/app/lmc-balance-section.tsx")).toContain(
      "{LMC_UNIT_LABEL}",
    );
    for (const locale of activeLocales) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        lmc?: Record<string, unknown>;
      };
      expect(messages.lmc, `${locale}`).toBeTruthy();
      expect(
        Object.prototype.hasOwnProperty.call(messages.lmc ?? {}, "unit"),
        `${locale}: the invariant unit must not be a catalogue key`,
      ).toBe(false);
    }
  });

  it("every string the surface renders exists in every active locale", () => {
    const required = [
      "title",
      "noAccount",
      "unavailable",
      "breakdown",
      "expired",
      "latest",
      "noMovements",
      "topUpClosed",
      "historyTitle",
    ];
    // The kind labels the component is willing to name, plus the fallback it
    // uses for a kind a future migration adds.
    const kinds = [
      "purchased",
      "promotional_signup",
      "promotional_activity",
      "admin_grant",
      "referral_reward",
      "spend",
      "expiry",
      "reversal",
      "refund_reversal",
      "chargeback_reversal",
      "spend_compensation",
      "other",
    ];
    for (const locale of activeLocales) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        lmc?: Record<string, unknown> & { kind?: Record<string, string> };
      };
      const block = messages.lmc;
      expect(block, `${locale}: the lmc namespace is missing`).toBeTruthy();
      for (const key of required) {
        expect(String(block?.[key] ?? "").trim(), `${locale}.${key}`).toBeTruthy();
      }
      for (const kind of kinds) {
        expect(
          String(block?.kind?.[kind] ?? "").trim(),
          `${locale}.kind.${kind}`,
        ).toBeTruthy();
      }
    }
  });

  /**
   * NEGATIVE CONTROL for the locale test above. It only means something while
   * the component actually resolves kind labels through a CLOSED set — if the
   * lookup went back to a bare `t(\`kind.${kind}\`)`, a kind added by a future
   * migration would throw inside next-intl and take the whole balance screen
   * down for exactly the people holding one of the new rows.
   */
  it("an unnamed transaction kind degrades instead of throwing", () => {
    const ui = read("components/app/lmc-balance-section.tsx");
    expect(ui).toContain("NAMED_KINDS");
    expect(ui).toContain('t("kind.other")');
    expect(ui).not.toContain("t(`kind.${m.kind}`)");
    expect(ui).not.toContain("t(`kind.${latest.kind}`)");
  });
});
