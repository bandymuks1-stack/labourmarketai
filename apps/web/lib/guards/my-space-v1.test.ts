import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * "Mano erdvė" personal workspace state (visual S2) — structural guard.
 *
 * S2 deliberately adds NO screen. The space is the personal state of the ONE
 * chat-first workspace at `/dashboard`, rendered into the conversation's
 * opening slot. This guard pins the properties that make that true, so a later
 * slice cannot quietly turn it back into the second dashboard W3 Package 4
 * deleted, or into a second source of readiness truth.
 *
 * Pure source + i18n assertions. No DB, no network.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
// Comments legitimately NAME the things they ban; strip them before negative
// scans so a doc comment never trips its own guard.
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const INTRO = "components/app/my-space/personal-workspace-intro.tsx";
const DASHBOARD_PAGE = "app/[locale]/dashboard/page.tsx";
const THREAD = "components/app/conversation/chat/conversation-thread.tsx";
const CHAT = "components/app/conversation/chat/conversation-chat.tsx";

/** The five ACTIVE locales — the set `i18n-lt-en-parity.test.ts` pins as
 *  requiring identical key structure. The other six catalogues are
 *  intentionally partial (62 vs 169 namespaces) and are NOT checked here. */
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

describe("S2 adds no screen and no second dashboard", () => {
  it("no route was added — the dashboard page set is unchanged", () => {
    // Product Gate `DASHBOARD_LIKE` makes /dashboard/{overview,home,control,
    // visual-os,start,hub,main}/ an automatic A-01 RED. The space must never
    // acquire a page of its own under ANY name.
    const dashboardDir = join(APP, "app", "[locale]", "dashboard");
    const banned = ["home", "hub", "overview", "control", "main", "visual-os", "my-space", "mano-erdve"];
    for (const name of banned) {
      expect(
        existsSync(join(dashboardDir, name)),
        `/dashboard/${name} must not exist — the space is a state, not a route`,
      ).toBe(false);
    }
  });

  it("the intro is a component, never a page", () => {
    const files = readdirSync(join(APP, "components", "app", "my-space"));
    expect(files.every((f) => !/^page\./.test(f))).toBe(true);
  });

  it("the intro mounts ONLY from the existing chat-first surface", () => {
    const mounts: string[] = [];
    const walk = (rel: string) => {
      for (const e of readdirSync(join(APP, rel), { withFileTypes: true })) {
        const child = `${rel}/${e.name}`;
        if (e.isDirectory()) walk(child);
        else if (/\.tsx$/.test(e.name) && read(child).includes("<PersonalWorkspaceIntro"))
          mounts.push(child);
      }
    };
    walk("app");
    walk("components");
    expect(mounts).toEqual([DASHBOARD_PAGE]);
  });

  it("the space renders only while the conversation is OPENING", () => {
    const thread = read(THREAD);
    expect(thread).toMatch(/isOpening && intro \?/);
    // No persisted dismissal: a slot that disappears with the first real turn
    // needs no state to remember, and S2 must not add one.
    expect(stripComments(thread)).not.toMatch(/localStorage|dismiss|seenIntro/i);
  });

  it("the chat forwards the slot without owning any of its data", () => {
    const chat = stripComments(read(CHAT));
    expect(chat).toMatch(/intro\?: ReactNode/);
    expect(chat).toMatch(/intro=\{intro\}/);
    // The chat is a client component; it may not learn the domain.
    expect(chat).not.toMatch(/deriveWorkerReadiness|getWorkerPlayerCard/);
  });
});

describe("Role and workspace gating", () => {
  const page = read(DASHBOARD_PAGE);

  it("the space is personal-workspace only — never inside an organization", () => {
    expect(page).toMatch(/activeOrganizationId === null/);
    expect(page).toMatch(/isPersonalWorkspace && activeRole === "worker"/);
  });

  it("company / agency / customer identities get no worker-only intro", () => {
    // The single gate above is the whole rule: only `worker` passes, so every
    // other identity renders the untouched conversation.
    expect(page).toMatch(
      /showPersonalSpace \? <PersonalWorkspaceIntro key="personal-workspace-intro" \/> : undefined/,
    );
  });

  it("the organization composition is NOT in this slice (S2.4)", () => {
    expect(page).not.toMatch(/OrganizationWorkspaceIntro/);
  });
});

describe("One readiness source, one next-action source", () => {
  const intro = read(INTRO);

  it("readiness comes from the canonical model, never recomputed", () => {
    expect(intro).toMatch(/from "@\/lib\/player-card\/readiness"/);
    expect(intro).toMatch(/deriveWorkerReadiness\(card\)/);
    // No second derivation: no local pillar arithmetic, no thresholds.
    const body = stripComments(intro);
    expect(body).not.toMatch(/fraction\s*[<>=]/);
    expect(body).not.toMatch(/met\s*\/\s*total/);
  });

  it("next actions come from the canonical readiness steps, not a new model", () => {
    expect(intro).toMatch(/readinessNextSteps\(readiness\)/);
    expect(intro).toMatch(/from "@\/lib\/player-card\/readiness-steps"/);
  });

  it("buildAttentionItems is not duplicated or re-implemented", () => {
    const body = stripComments(intro);
    expect(body).not.toMatch(/buildAttentionItems|AttentionItem|notificationSpine/);
  });

  it("a complete profile gets NO completion CTA", () => {
    // `readinessNextSteps` returns [] when every signal is met, so `primary`
    // is null and no secondary rows exist — the nag cannot re-appear.
    expect(intro).toMatch(/const primary = steps\[0\] \?\? null;/);
    expect(intro).toMatch(/\{primary \? \(/);
    expect(intro).toMatch(/steps\.length === 0 \? "ready" : "partial"/);
  });
});

describe("Canonical primitives are used", () => {
  const intro = read(INTRO);

  it("uses the S1 Card primitive, not a raw card-border string", () => {
    expect(intro).toMatch(/from "@\/components\/ui\/Card"/);
    expect(intro).toMatch(/<Card /);
    expect(stripComments(intro)).not.toMatch(/card-border/);
  });

  it("uses the S1 Button pill grammar for every action", () => {
    expect(intro).toMatch(/from "@\/components\/ui\/Button"/);
    expect(intro).toMatch(/pillLinkClassName/);
  });

  it("uses the S1 ResultShell and lets it stay domain-free", () => {
    expect(intro).toMatch(/from "@\/components\/ui\/ResultShell"/);
    expect(intro).toMatch(/<ResultShell/);
    // The caller owns the state machine — the status is computed HERE.
    expect(intro).toMatch(/const status: ResultShellStatus/);
  });

  it("every action points at a real in-app route", () => {
    const hrefs = [...intro.matchAll(/href=\{?"?(\/[^"'}\s]*)"?/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) {
      expect(h.startsWith("/dashboard"), `dead or off-app CTA target: ${h}`).toBe(true);
    }
    // No dead controls.
    expect(intro).not.toMatch(/href="#"/);
  });
});

describe("Honesty: no score, no fake state, no technical labels", () => {
  const intro = stripComments(read(INTRO));

  it("no score / rating / OVR / trust / reputation anywhere", () => {
    expect(intro).not.toMatch(
      /overall_score|person_score|worker_rating|trust_score|profile_strength|\bOVR\b|reputation/i,
    );
  });

  it("no percentage is rendered", () => {
    expect(intro).not.toMatch(/%|percent|Math\.round\([^)]*100/i);
  });

  it("no AI claim and no verification claim", () => {
    expect(intro).not.toMatch(/AI[- ]?verified|verified by|patvirtinta AI/i);
  });

  it("no raw technical state leaks to the user", () => {
    expect(intro).not.toMatch(/needs_migration|needs-migration|42703|PGRST|supabase/i);
  });

  it("no manual locale ternary — copy comes from the catalogues", () => {
    expect(intro).not.toMatch(/locale\s*===\s*"(lt|en|de|nl|ru)"/);
  });

  it("the read failure degrades honestly instead of inventing a state", () => {
    const src = read(INTRO);
    expect(src).toMatch(/readFailed \? "error" : "unavailable"/);
    expect(src).toMatch(/catch \{/);
  });
});

describe("Copy parity across the five ACTIVE locales", () => {
  const REQUIRED = [
    "title",
    "readinessLabel",
    "profileCta",
    "unavailable",
    "pillars.profession",
    "pillars.availability",
    "pillars.skills",
    "pillars.journal",
    "pillars.evidence",
    "pillars.workCard",
  ];
  const mySpace = (locale: string): Record<string, unknown> => {
    const json = JSON.parse(read(`messages/${locale}.json`)) as {
      auth: { dashboard: { mySpace: Record<string, unknown> } };
    };
    return json.auth.dashboard.mySpace;
  };
  const get = (obj: Record<string, unknown>, path: string): unknown =>
    path.split(".").reduce<unknown>((acc, k) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
      return undefined;
    }, obj);

  for (const locale of ACTIVE_LOCALES) {
    it(`${locale} carries every S2 key with a real value`, () => {
      const space = mySpace(locale);
      for (const key of REQUIRED) {
        const v = get(space, key);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${locale}: mySpace.${key} missing or empty`,
        ).toBe(true);
        // Active locales may never carry the untranslated marker.
        expect(String(v)).not.toContain("[EN]");
      }
    });
  }

  it("the LT copy uses the owner's first-person phrasing", () => {
    const lt = mySpace("lt");
    expect(lt.title).toBe("Mano erdvė");
    expect(lt.readinessLabel).toBe("Darbo pasiruošimas");
    expect(lt.profileCta).toBe("Mano darbo profilis");
    const pillars = lt.pillars as Record<string, string>;
    expect(pillars.skills).toBe("Ką moku");
    expect(pillars.profession).toBe("Ko ieškau");
    expect(pillars.availability).toBe("Kada galiu dirbti");
    expect(pillars.evidence).toBe("Kuo galiu pagrįsti patirtį");
    // The work card carries both the place and the pay question.
    expect(pillars.workCard).toMatch(/Kur galiu dirbti/);
    expect(pillars.workCard).toMatch(/atlygio tikiuosi/);
  });

  it("no bureaucratic or internal-system wording in the new copy", () => {
    for (const locale of ACTIVE_LOCALES) {
      const blob = JSON.stringify(mySpace(locale));
      expect(blob, locale).not.toMatch(
        /\bdashboard\b|\badmin\b|\bdraft\b|\binternal\b|\bdebug\b|verification_status/i,
      );
      expect(blob, locale).not.toMatch(/\bdemo\b|\bsample\b|\bfake\b/i);
      expect(blob, locale).not.toMatch(/AI[- ]?verified|trust score|reputation score|guaranteed match/i);
    }
  });
});
