import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EMPLOYER_VISIBILITY_HREF } from "@/lib/privacy/employer-visibility";

/**
 * "VISIBLE TO EMPLOYERS" IS ONE TAP AWAY (capability matrix P0, 2026-09-23).
 *
 * Measured on production: 57 of 59 worker profiles were invisible to all
 * supply matching. The consent, its RPCs and its ledger were complete — the
 * switch was reachable only through the profile page's closed "More". This
 * guard pins every door this slice opened, and the two honesty rules they
 * share:
 *
 *  - ONE consent path. Every door opens the EXISTING `DiscoverabilityConsent`
 *    or links to its canonical home; nothing outside that component grants.
 *  - SEP-7. A state that could not be read is UNKNOWN — its own word, its
 *    own icon, its own tone — never OFF, and never a reason to ask.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

vi.mock("@/lib/i18n/navigation", () => ({
  Link: (props: {
    href: string;
    children: unknown;
    "data-testid"?: string;
    "data-visibility"?: string;
    className?: string;
  }) =>
    createElement(
      "a",
      {
        href: props.href,
        "data-testid": props["data-testid"],
        "data-visibility": props["data-visibility"],
        className: props.className,
      },
      props.children as never,
    ),
}));

const { EmployerVisibilityItem } = await import("@/components/app/employer-visibility-item");

const LABELS = {
  title: "Matomas darbdaviams",
  state: { on: "Įjungta", off: "Išjungta", unknown: "Nežinoma" },
  hint: { on: "hint-on", off: "hint-off", unknown: "hint-unknown" },
} as const;

const render = (visibility: "on" | "off" | "unknown") =>
  renderToStaticMarkup(
    createElement(EmployerVisibilityItem, { visibility, labels: LABELS, testId: "ev" }),
  );

describe("the readiness item renders the TRUE state — three states, three faces", () => {
  it.each(["on", "off", "unknown"] as const)("%s: its own word, and a door to the consent", (v) => {
    const html = render(v);
    expect(html).toContain(`data-visibility="${v}"`);
    expect(html).toContain(`href="${EMPLOYER_VISIBILITY_HREF}"`);
    expect(html).toContain(`data-testid="ev-state">${LABELS.state[v]}<`);
    expect(html).toContain(LABELS.hint[v]);
    expect(html).toContain(LABELS.title);
  });

  it("unknown never borrows OFF's face: different icon, different tone, dashed border (SEP-7)", () => {
    const off = render("off");
    const unknown = render("unknown");
    // lucide names its glyphs: eye-off for OFF, a question mark for UNKNOWN.
    expect(off).toMatch(/lucide-eye-off/);
    expect(unknown).not.toMatch(/lucide-eye-off/);
    expect(unknown).toMatch(/lucide-circle-help|lucide-help-circle|lucide-circle-question-mark/);
    expect(unknown).toContain("border-dashed");
    expect(off).not.toContain("border-dashed");
    expect(unknown).toContain("Nežinoma");
    expect(unknown).not.toContain("Išjungta");
  });

  it("OFF is a choice, not a deficiency — no warning tone; ON carries the success tone", () => {
    expect(render("off")).not.toMatch(/state-warning|state-danger|amber/);
    expect(render("on")).toMatch(/text-state-success/);
  });

  it("the item is a door, not a switch — it renders no button and no form", () => {
    for (const v of ["on", "off", "unknown"] as const) {
      expect(render(v)).not.toMatch(/<button|<form|<input/);
    }
  });
});

describe("every door opens the ONE existing consent — nothing else grants", () => {
  it("the account menu carries the entry for workers only, to the canonical home", () => {
    const MENU = read("components/app/account-menu.tsx");
    const entry = MENU.slice(MENU.indexOf('roles.includes("worker")'));
    expect(entry).toContain("href={EMPLOYER_VISIBILITY_HREF}");
    expect(entry).toContain('data-testid="account-menu-employer-visibility-link"');
    expect(entry).toContain('t("account.employerVisibility")');
  });

  it("the profile hub and the opportunities board render the SAME item from the SAME reader", () => {
    for (const rel of [
      "components/app/profile-hub-overview.tsx",
      "app/[locale]/dashboard/opportunities/page.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).toContain("<EmployerVisibilityItem");
      expect(src, rel).toContain("getMyDiscoverabilityState()");
      expect(src, rel).toContain("employerVisibilityOf(");
      expect(src, rel).toContain("employerVisibilityItemLabels(tVisibility)");
    }
    // The board's read is in the ONE combined await, and a throw is unknown.
    const BOARD = read("app/[locale]/dashboard/opportunities/page.tsx");
    expect(BOARD).toContain("getMyDiscoverabilityState().catch(() => null)");
    // The hub asks only for a worker; a non-worker identity gets no item.
    const HUB = read("components/app/profile-hub-overview.tsx");
    expect(HUB).toContain("hasWorker ? getMyDiscoverabilityState() : Promise.resolve(null)");
  });

  it("the work-card ask renders after a SUCCESSFUL save only, and is a door with 'not now'", () => {
    const EDITOR = read("components/app/work-card-editor.tsx");
    expect(EDITOR).toContain("{saveState?.ok ? <EmployerVisibilityAsk labels={labels.visibilityAsk} /> : null}");
    const ASK = read("components/app/employer-visibility-ask.tsx");
    expect(ASK).toContain("shouldAskEmployerVisibility({ justSaved: true, consent, askRecord: record })");
    expect(ASK).toContain('writeVisibilityAskRecord("opened")');
    expect(ASK).toContain('writeVisibilityAskRecord("dismissed")');
    expect(ASK).toContain("href={EMPLOYER_VISIBILITY_HREF");
    // Never a consent of its own: no grant call, no checkbox, no pre-selection.
    expect(ASK).not.toMatch(/grantProfileDiscoverability|withdrawProfileDiscoverability|\.rpc\(/);
    expect(ASK).not.toMatch(/type="checkbox"|defaultChecked/);
  });

  it("outside the consent component and its server actions, nothing calls the consent write", () => {
    for (const rel of [
      "components/app/employer-visibility-item.tsx",
      "components/app/employer-visibility-ask.tsx",
      "components/app/account-menu.tsx",
      "components/app/profile-hub-overview.tsx",
      "app/[locale]/dashboard/opportunities/page.tsx",
      "lib/conversation/employer-visibility-chat.ts",
      "lib/privacy/employer-visibility.ts",
    ]) {
      expect(read(rel), rel).not.toMatch(
        /grantProfileDiscoverability|withdrawProfileDiscoverability|grant_profile_discoverability_consent/,
      );
    }
  });

  it("the consent records WHERE it was decided from a closed set — the chat names itself", () => {
    const ACTIONS = read("lib/privacy/discoverability-actions.ts");
    expect(ACTIONS).toContain("p_source: discoverabilityConsentSourceOf(input.source)");
    expect(ACTIONS).toContain("p_source: discoverabilityConsentSourceOf(input?.source)");
    expect(ACTIONS).not.toMatch(/p_source:\s*"dashboard_privacy_screen"/);
    const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(CHAT).toMatch(/<DiscoverabilityConsent[^>]*source="conversation"/);
  });
});

describe("SEP-7 — a failed read is said as unknown, never as off or empty", () => {
  it("the consent component says 'could not read' for error / not-authed, before any choice screen", () => {
    const CONSENT = read("components/app/discoverability-consent.tsx");
    const readFailed = CONSENT.indexOf('state.kind === "error" || state.kind === "not-authed"');
    expect(readFailed).toBeGreaterThan(0);
    expect(CONSENT.slice(readFailed)).toContain('data-testid="discoverability-read-failed"');
    expect(CONSENT.slice(readFailed)).toContain("{labels.readFailed}");
    // The read-failed branch sits BEFORE the granted / hidden branches.
    expect(readFailed).toBeLessThan(CONSENT.indexOf('phase === "done" || (status === "granted"'));
  });

  it("the privacy screen says the history could not be read — never 'nothing yet' — for both ledgers", () => {
    const PAGE = read("app/[locale]/dashboard/privacy/page.tsx");
    expect(PAGE).toContain('const historyFailed = history.kind !== "ok"');
    expect(PAGE).toContain('data-testid="disclosures-unavailable"');
    expect(PAGE).toContain('data-testid="history-unavailable"');
    expect((PAGE.match(/\{tc\("history\.unavailable"\)\}/g) ?? []).length).toBe(2);
    // The failed branch is tested BEFORE the empty branch, both times.
    for (const empty of ['data-testid="disclosures-empty"', 'data-testid="history-empty"']) {
      const unavailable = empty.replace("-empty", "-unavailable");
      expect(PAGE.indexOf(unavailable)).toBeLessThan(PAGE.indexOf(empty));
    }
  });

  it("the history reader never returns [] for a failure", () => {
    const ACTIONS = read("lib/privacy/discoverability-actions.ts");
    const fn = ACTIONS.slice(ACTIONS.indexOf("export async function getMyConsentHistory"));
    expect(fn).toContain('if (!user) return { kind: "not-authed" };');
    expect(fn).toContain('if (error || !Array.isArray(data)) return { kind: "failed" };');
    expect(fn).not.toMatch(/return \[\];/);
  });
});
