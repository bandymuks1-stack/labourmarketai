import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — UX gaps 2026-11-18, E-4 / E-6 / E-7 (the employer's need intake on a phone).
 *
 * E-4: "Fill from my last request" appeared on a company's very first need. It now renders
 *      only when the caller has a request of this direction, read from the readback the needs
 *      page already loads (no new read); an unknown answer keeps the button.
 * E-6: after a need was sent, "Your submitted inquiries" stacked three notices before the
 *      card, one of them ("we don't suggest candidates automatically") contradicting the
 *      "…and its matches" link above. One status line remains: the guard-pinned worker-
 *      visibility note (demand-visibility-honesty). Text removed, none added (decision 0032).
 * E-7: the "Submitted details" disclosure was an 18 px row; its summary is now 44 px.
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const wizard = read("components/app/demand-request-button.tsx");
const page = read("app/[locale]/dashboard/company/needs/page.tsx");
const readback = read("components/app/demand-requests-readback.tsx");

describe("E-4: fill from my last request only when there is one", () => {
  it("the wizard hides the button only on a known 'no previous request'", () => {
    expect(wizard).toMatch(/hasOwnPreviousRequest = null,/);
    expect(wizard).toMatch(/\{hasOwnPreviousRequest === false \? null : \(\s*<div[^>]*>\s*<Button[\s\S]{0,300}data-testid="demand-prefill-last"/);
  });

  it("the page derives it from the readback it already reads, by the row's direction", () => {
    expect(page).toMatch(/const hasOwnPreviousRequest =\s*demandReadback\.kind === "ok"/);
    expect(page).toMatch(/r\.ownedByCaller && r\.direction === \(demandIntent === "partner" \? "supply" : "demand"\)/);
    expect(page).toMatch(/hasOwnPreviousRequest=\{hasOwnPreviousRequest\}/);
    expect(page.match(/listOwnCustomerRequests\(/g) ?? []).toHaveLength(1);
  });
});

describe("E-6: one status line above the submitted inquiries", () => {
  it("the contradicting note and the manage-help paragraph are not rendered", () => {
    expect(readback).not.toMatch(/\{labels\.note\}/);
    expect(readback).not.toMatch(/\{labels\.manageHelp\}/);
    expect(readback).not.toMatch(/demand-readback-manage-help/);
  });

  it("the worker-visibility note stays, once", () => {
    expect(readback.match(/data-testid="demand-readback-worker-visibility-note"/g) ?? []).toHaveLength(1);
    expect(readback).toMatch(/\{labels\.workerVisibilityNote\}/);
  });
});

describe("E-7: the submitted-details disclosure is a 44 px row", () => {
  it("its summary carries the tap floor", () => {
    expect(readback).toMatch(/<summary className="flex min-h-11 [^"]*items-center[^"]*">\s*\{labels\.detailsLabel\}/);
  });
});
