import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";

/**
 * A company is usable at once (automatic-first, owner rule), but the worker
 * board shows a need only from a VERIFIED company. The setup copy said the
 * review was "optional" and "no waiting for approval", so a company could post
 * needs that reached no worker while every line told it nothing was missing
 * (Swedish employer audit 2026-11-11, V-1). The copy keeps "usable now" and
 * states the one condition: workers see the needs once the company is
 * verified. The visibility rule itself is the owner's and is not changed here.
 */
const WEB = join(__dirname, "..", "..");
const catalog = (l: string) =>
  JSON.parse(readFileSync(join(WEB, "messages", `${l}.json`), "utf8")) as {
    roleDashboards: { company: { nextActions: { noCompany: { body: string } }; setup: Record<string, unknown> } };
  };

describe("setup copy names the condition for worker visibility", () => {
  for (const l of activeLocales) {
    it(`${l}: the button and the explainer no longer call verification optional`, () => {
      const setup = catalog(l).roleDashboards.company.setup as {
        submitRequest: string;
        formSubtitle: string;
        verificationExplainer: { pending_verification: string };
      };
      for (const s of [setup.submitRequest, setup.verificationExplainer.pending_verification]) {
        expect(s, l).not.toMatch(/optional|neprivalom|необязательн|optioneel|opcjonaln/i);
      }
    });

    it(`${l}: the first-run lines say both facts: usable now, and when workers see the needs`, () => {
      const c = catalog(l).roleDashboards.company;
      for (const s of [c.nextActions.noCompany.body, c.setup.formSubtitle as string]) {
        expect(s, l).not.toMatch(/no waiting for approval|nereikia laukti patvirtinimo|ждать одобрения не нужно|zonder te wachten|ohne Warten|bez czekania/i);
        expect(s, l).toMatch(/verif|patvirtin|подтвержд/i);
      }
    });
  }
});
