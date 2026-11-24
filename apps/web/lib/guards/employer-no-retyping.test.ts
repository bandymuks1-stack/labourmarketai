import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { activeLocales } from "@/lib/i18n/config";
import { recognizeIntent } from "@/lib/market/recognition";

const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

/**
 * "The employer must not type their need twice."
 *
 * /dashboard/market/recognize asked an employer to describe what they need,
 * recognised it, listed what was missing, and then handed over a plain link to a
 * demand wizard that opened EMPTY. Everything needed to avoid that already
 * existed - structuring, an owner-scoped draft on `customer_requests`, and a
 * wizard that auto-continues from its own draft. Only the join was missing.
 *
 * These guards pin the join AND the four boundaries that make it safe.
 */
describe("the recognised need reaches the demand form", () => {
  it("the employer hand-off is marked as carrying the need text", () => {
    const card = recognizeIntent("need_workers", {
      rawText: "Reikia 4 suvirintoju Vokietijoje nuo rugsejo",
    });
    const handoff = card.nextActions.find(
      (a) => a.code === "continue_to_demand",
    );
    expect(handoff, "need_workers must offer continue_to_demand").toBeTruthy();
    expect(handoff?.carriesNeedText).toBe(true);
  });

  /**
   * NEGATIVE CONTROL. Only the employer hand-off writes anything. A worker
   * looking for work, a service provider and a project owner all reach surfaces
   * with no employer draft to write, and marking their actions would create a
   * `company_request` row for someone who is not an employer.
   */
  it("no OTHER intent's hand-off carries text", () => {
    for (const intent of ["need_work", "offer_services", "have_project"] as const) {
      const card = recognizeIntent(intent, { rawText: "statybos darbai Vilniuje" });
      for (const a of card.nextActions) {
        expect(
          a.carriesNeedText ?? false,
          `${intent}/${a.code} must not write a draft`,
        ).toBe(false);
      }
    }
  });

  it("a carrying hand-off is a button that writes BEFORE it navigates", () => {
    const ui = read("components/app/market/offer-demand-recognizer.tsx");
    // The write goes through the canonical server action...
    expect(ui).toContain("startDemandFromNeedTextAction");
    // ...and the control is a button, because a bare <Link> cannot write first.
    expect(ui).toContain('data-carries-need-text="yes"');
    expect(ui).toContain("carriesNeedText ?");
    // The await precedes the navigation - otherwise the wizard would load before
    // the draft exists and auto-continue would find nothing.
    const fn = ui.slice(
      ui.indexOf("async function carryToDemand"),
      ui.indexOf("async function carryToDemand") + 900,
    );
    expect(fn.indexOf("await startDemandFromNeedTextAction")).toBeGreaterThan(-1);
    expect(fn.indexOf("await startDemandFromNeedTextAction")).toBeLessThan(
      fn.indexOf("router.push"),
    );
  });

  /**
   * The need routinely names a client, a site, a rate and a headcount. A URL is
   * kept by browser history, proxies, analytics and the next request's referrer,
   * so the text travels in an owner-scoped row instead. This fails if anyone
   * reintroduces the query-parameter shortcut.
   */
  it("the need text never travels in a URL", () => {
    const ui = read("components/app/market/offer-demand-recognizer.tsx");
    const intent = read("lib/market/recognition/recognize-intent.ts");
    for (const src of [ui, intent]) {
      expect(src).not.toContain("searchParams");
      expect(src).not.toContain("encodeURIComponent");
      expect(src).not.toContain("?text=");
      expect(src).not.toContain("?need=");
      expect(src).not.toContain("?description=");
    }
  });

  /**
   * A draft is not a demand. It must stay on the canonical intake, in the draft
   * status the board and the matcher both ignore, written through the existing
   * RPC path - never a second model with its own lifecycle.
   */
  it("the draft stays the canonical customer_requests draft", () => {
    const mod = read("lib/demand/demand-from-need-text.ts");
    expect(mod).toContain('saveDemandDraft("company_request"');
    expect(mod).toContain('from "./demand-drafts"');
    // No second store, no direct table write, no bypass of the RPC path.
    expect(mod).not.toContain("createClient");
    expect(mod).not.toContain(".from(");
    expect(mod).not.toContain('status: "submitted"');
  });

  /**
   * The mechanism this whole slice depends on, pinned where it can be seen. The
   * wizard auto-continues ONLY from a row whose source is a draft; if that
   * condition were dropped or narrowed, the draft written here would be created
   * and silently ignored, and the employer would type the need twice again with
   * every test above still green.
   */
  it("the wizard still auto-continues from a draft", () => {
    const wizard = read("components/app/demand-request-button.tsx");
    expect(wizard).toContain("getOwnLastDemandPrefillAction");
    expect(wizard).toContain('res.source !== "draft"');
    expect(wizard).toContain("applyPrefill(res)");
    // …and the description is what carries over.
    const prefill = read("lib/demand/demand-request.ts");
    expect(prefill).toContain("draftCapabilities");
  });

  it("the honest degradation line exists in every active locale", () => {
    for (const locale of activeLocales) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        marketRecognition?: { carryNote?: Record<string, string> };
      };
      const note = messages.marketRecognition?.carryNote;
      expect(note, `${locale}: carryNote missing`).toBeTruthy();
      for (const key of ["no_company", "failed"]) {
        expect(note?.[key]?.trim(), `${locale}.${key}`).toBeTruthy();
      }
    }
  });
});
