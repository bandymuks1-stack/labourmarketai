import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { disclosureHashTarget } from "@/components/app/details-hash-opener";

/**
 * `/dashboard/account#lmc` MUST LAND ON THE BALANCE, NOT ON A SHUT BAR.
 *
 * The chat answers "Kiek turiu LMC?" with a chip to `/dashboard/account#lmc`,
 * and the command finder's LMC entry routes to the same anchor. The LMC section
 * (`id="lmc"`) lives INSIDE the account plan `<Fold>`, which is closed whenever
 * billing is not live for the viewer's workspace (every worker outside the
 * billing pilot, and every local stack with payments off).
 *
 * Measured 2026-10-23 on the local stack: a full page load of the URL opened the
 * fold (the browser's own fragment auto-expand), but the SAME link followed by a
 * client-side navigation from the chat chip left the fold closed, the balance
 * hidden and the page unscrolled — 1 s, 4 s, 10 s and 20 s after the click. A
 * client navigation never expands a closed `<details>`. `DetailsHashOpener` is
 * the component that does, so it must be mounted for the fold that holds #lmc.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");
const PAGE = read("app/[locale]/dashboard/account/page.tsx");
const LMC = read("components/app/lmc-balance-section.tsx");

/** Source span of the `<Fold id="account-plan" …>` element, to its own close. */
function planFold(): string {
  const start = PAGE.indexOf('<Fold id="account-plan"');
  expect(start, 'the plan fold carries id="account-plan"').toBeGreaterThan(-1);
  const end = PAGE.indexOf("</Fold>", start);
  expect(end, "the plan fold closes").toBeGreaterThan(start);
  return PAGE.slice(start, end);
}

describe("account: #lmc deep link opens the fold that holds the balance", () => {
  it("the LMC section keeps its anchor id", () => {
    expect(LMC).toMatch(/id="lmc"/);
  });

  it("the balance is rendered inside the plan fold", () => {
    expect(planFold()).toContain("<LmcBalanceSection");
  });

  it("a hash opener is mounted for that fold", () => {
    expect(PAGE).toContain('<DetailsHashOpener targetId="account-plan" />');
    expect(PAGE).toContain('from "@/components/app/details-hash-opener"');
  });

  it("the senders still aim at #lmc", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    const commands = read("lib/navigation/command-registry.ts");
    expect(chat).toContain("/dashboard/account#lmc");
    expect(commands).toContain("/dashboard/account#lmc");
  });

  it("the opener's decision: #lmc opens the fold, a hash outside it does not", () => {
    type Node = { id: string; children: Node[] };
    const lmc: Node = { id: "lmc", children: [] };
    const fold: Node = { id: "account-plan", children: [lmc] };
    const outside: Node = { id: "connected-apps", children: [] };
    const all = [fold, lmc, outside];
    const byId = (id: string) => all.find((n) => n.id === id) ?? null;
    const contains = (outer: Node, inner: Node): boolean =>
      outer.children.some((c) => c === inner || contains(c, inner));

    expect(disclosureHashTarget("#lmc", "account-plan", fold, byId, contains)).toBe(lmc);
    expect(disclosureHashTarget("#account-plan", "account-plan", fold, byId, contains)).toBe(fold);
    // Negative control: a link aimed elsewhere must never open the plan fold.
    expect(disclosureHashTarget("#connected-apps", "account-plan", fold, byId, contains)).toBeNull();
    expect(disclosureHashTarget("", "account-plan", fold, byId, contains)).toBeNull();
  });
});
