import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Product-readiness guards (PR #30 follow-up, scope B of the post-merge
 * sprint). Coarse on purpose: they assert critical strings and structure,
 * not pixel-perfect rendering. If you intentionally change a surface guarded
 * here, update the expected string at the same time.
 *
 * The repo root is two levels up from `apps/web` (where vitest runs).
 */
const WEB = resolve(__dirname, "..", "..");
const REPO = resolve(WEB, "..", "..");

function read(rel: string): string {
  return readFileSync(rel.startsWith(REPO) ? rel : join(REPO, rel), "utf8");
}

function readWeb(rel: string): string {
  return readFileSync(join(WEB, rel), "utf8");
}

/** Walk a directory tree and return every file path that matches a filter. */
function walk(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".turbo") continue;
      out.push(...walk(p, filter));
    } else if (filter(p)) {
      out.push(p);
    }
  }
  return out;
}

// ── 1. No legacy project name in apps/web user-facing surface ────────────

describe("legacy project naming", () => {
  // Only block names of OTHER products / former internal names. The current
  // public name is "labourmarket.ai" — that's the only one allowed in UI.
  const BLOCKED = [
    /\bLABMA(\s+OS)?\b/i,
    /\btiler\.ai\b/i,
    /\bworkforceos\b/i,
    /\btradeapp\b/i,
    /\btradeos\b/i,
    /\btradeai\b/i,
  ];

  // Anywhere the user can see strings: messages + components + app pages.
  const SCAN_DIRS = ["messages", "components", "app"];

  for (const dir of SCAN_DIRS) {
    it(`apps/web/${dir} has no legacy project naming`, () => {
      const root = join(WEB, dir);
      const files = walk(root, (p) =>
        /\.(json|tsx?|md)$/i.test(p) && !p.endsWith(".test.ts"),
      );
      for (const f of files) {
        const txt = readFileSync(f, "utf8");
        for (const re of BLOCKED) {
          if (re.test(txt)) {
            throw new Error(
              `Legacy name match ${re} in ${f.replace(REPO, ".")}`,
            );
          }
        }
      }
    });
  }
});

// ── 2. No misleading AI / verification / automation claims in messages ──

describe("honest copy claims (messages)", () => {
  /** Each rule has a pattern + a short reason explaining what's forbidden. */
  const RULES: { re: RegExp; reason: string }[] = [
    { re: /\bAI[\s-]*verified\b/i, reason: "fake AI verification claim" },
    { re: /\bAI\s+patvirtin/i, reason: "LT fake AI verification" },
    { re: /\bauto[-\s]?verified\b/i, reason: "fake auto verification" },
    { re: /\bautomatic(?:ally)?\s+approv/i, reason: "fake automatic approval" },
    { re: /\bautomati(?:nis|škai)\s+patvirtin/i, reason: "LT fake automatic approval" },
    { re: /\bguaranteed\s+match/i, reason: "fake guaranteed match" },
    { re: /\bgarantuotas\s+atitikim/i, reason: "LT fake guaranteed match" },
    { re: /\bAI\s+match(?:ing)?\b/i, reason: "fake AI matching claim" },
    { re: /\bAI\s+score/i, reason: "fake AI score claim" },
    // Soft trap: "AI-powered extraction" implies real AI; the parser is rules.
    { re: /\bAI[-\s]?powered\s+extraction\b/i, reason: "fake AI extraction claim" },
  ];

  it("no blocked claim phrases appear in any locale", () => {
    const root = join(WEB, "messages");
    const files = walk(root, (p) => p.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const txt = readFileSync(f, "utf8");
      for (const rule of RULES) {
        if (rule.re.test(txt)) {
          throw new Error(
            `Blocked claim "${rule.reason}" matched ${rule.re} in ${f.replace(REPO, ".")}`,
          );
        }
      }
    }
  });
});

// ── 3. Profile page renders the text-first flow BEFORE the manual picker ─

describe("profile page is text-first", () => {
  it("ProfileTextFirstFlow appears before any direct WorkerTradeProfile mount", () => {
    const txt = readWeb("app/[locale]/dashboard/profile/page.tsx");
    const firstFlow = txt.indexOf("<ProfileTextFirstFlow");
    expect(firstFlow, "profile page must render <ProfileTextFirstFlow").toBeGreaterThan(0);
    // WorkerTradeProfile is allowed only as the `manualSlot` of the text-first
    // flow — that means its JSX must appear AFTER the ProfileTextFirstFlow tag.
    const directMount = txt.indexOf("<WorkerTradeProfile");
    if (directMount >= 0) {
      expect(directMount).toBeGreaterThan(firstFlow);
    }
  });
});

// ── 4. Journal composer first labelled field is the text textarea ────────

describe("journal composer is text-first", () => {
  it('first labelled field uses t("whatDidYouDo") above any taxonomy picker', () => {
    const txt = readWeb("components/app/journal-entry-composer.tsx");
    // We expect the compose-stage textarea to be the first labelled field
    // shown to the worker; the engagement <Select> is rendered ABOVE it
    // (context selector) — that's fine, but a unit / direction / skill
    // picker MUST NOT precede whatDidYouDo in the JSX.
    const labelKeys = [...txt.matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1]);
    const whatIdx = labelKeys.indexOf("whatDidYouDo");
    expect(
      whatIdx,
      "journal composer must call t(\"whatDidYouDo\")",
    ).toBeGreaterThanOrEqual(0);
    // No legacy first-field keys before whatDidYouDo.
    const BLOCKED_BEFORE = ["field.area_done", "field.tile_type", "quantityLabel"];
    for (const key of BLOCKED_BEFORE) {
      const idx = labelKeys.indexOf(key);
      if (idx >= 0) expect(idx).toBeGreaterThan(whatIdx);
    }
  });
});

// ── 5. Account page labels roles from ONE status source ──────────────────
// (Updated by the canonical-paths sprint: the role list no longer blanket-tags
//  every non-active role as "Ruošiama". It reads the SAME status vocabulary as
//  the role catalogue via `roleStatusChipKey`, so company/agency/customer read
//  "Pradėti" — not "Ruošiama" — and `admin` is never tagged preparing. The
//  "Ruošiama" label still exists in messages and is owned by the role switcher's
//  genuinely-preparing fallback. See canonical-paths-integrity.test.ts.)

describe("account page marks roles from a single honest status source", () => {
  it("uses roleStatusChipKey + the rolesIntro paragraph (no blanket preparing tag)", () => {
    const txt = readWeb("app/[locale]/dashboard/account/page.tsx");
    expect(txt).toMatch(/roleStatusChipKey/);
    expect(txt).toMatch(/account\.rolesIntro/);
    // The old blanket tag (every non-active role → preview_workspace) is gone.
    expect(txt).not.toMatch(/account\.preview_workspace/);
    const lt = readWeb("messages/lt.json");
    // The label itself still exists (role switcher owns it now).
    expect(lt).toMatch(/"preview_workspace":\s*"Ruošiama"/);
    expect(lt).toMatch(/"rolesIntro":/);
  });
});

// ── 6. Dashboard layout keeps the bottom safe-spacing class ──────────────

describe("dashboard layout keeps bottom safe spacing", () => {
  it("<main> uses pb-[calc(...+env(safe-area-inset-bottom))]", () => {
    const txt = readWeb("app/[locale]/dashboard/layout.tsx");
    expect(txt).toMatch(/pb-\[calc\([^\]]*env\(safe-area-inset-bottom\)/);
  });
});

// ── 7. PR #30 smoke checklist stays PENDING until manually flipped ───────

describe("PR #30 production smoke checklist", () => {
  it("docs/evidence/post-merge-production-smoke-pr30.md says PENDING", () => {
    const txt = read("docs/evidence/post-merge-production-smoke-pr30.md");
    expect(txt, "smoke checklist must exist").toMatch(/Status:\s*PENDING/i);
    // Also assert the explicit status block hasn't been flipped to PASSED yet.
    expect(txt).toMatch(/Smoke status:\s*PENDING/);
  });
});

// ── 8. Dashboard first-use panel + non-locking role copy (Phase 3 / 6) ───

describe("dashboard first-use guidance", () => {
  it("worker dashboard guides first-use via the action-first control room", () => {
    // Action-first IA v1: first-use guidance moved from a separate panel into
    // the MyZone control room (real readiness status + fast actions). The home
    // no longer stacks a separate first-use panel.
    const txt = readWeb("app/[locale]/dashboard/page.tsx");
    expect(txt).toMatch(/<MyZone\b/);
    expect(txt).toMatch(/incomplete=\{isFirstUse\}/);
  });
  it("LT + EN expose firstUse.title via auth.dashboard.firstUse", () => {
    const lt = readWeb("messages/lt.json");
    const en = readWeb("messages/en.json");
    for (const txt of [lt, en]) {
      expect(txt).toMatch(/"firstUse":\s*\{/);
      expect(txt).toMatch(/"step1":/);
      expect(txt).toMatch(/"step4":/);
      expect(txt).toMatch(/"completeProfileCta":/);
      expect(txt).toMatch(/"addJournalCta":/);
      expect(txt).toMatch(/"reviewRolesCta":/);
    }
  });
});

// ── 9. Universal placeholders — examples must not be construction-only ──

describe("universal placeholders", () => {
  it("profile textFirst placeholder mentions at least one non-construction example", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    const ltPlaceholder = lt.skills.textFirst.placeholder as string;
    const enPlaceholder = en.skills.textFirst.placeholder as string;
    // Must reference at least one non-construction example domain. Failing
    // here means the placeholder regressed to a single-vertical narrative.
    expect(ltPlaceholder).toMatch(/klient|svetai|baldu|baldų|dokument|dvirat/i);
    expect(enPlaceholder).toMatch(/customer|website|furniture|document|bike/i);
  });
  it("journal textPlaceholder is not a tiling-only example", () => {
    const lt = JSON.parse(readWeb("messages/lt/journal.json"));
    const en = JSON.parse(readWeb("messages/en/journal.json"));
    const ltP = lt.textPlaceholder as string;
    const enP = en.textPlaceholder as string;
    // The placeholder may still mention construction work as ONE option, but
    // it must not be the entire example. Look for a customer / report /
    // request signal that gives it universal flavour.
    expect(ltP).toMatch(/klient|užklaus|ataskait|sutvark|paruoš/i);
    expect(enP).toMatch(/customer|report|request|handled|resolved|prepared/i);
  });
});

// ── 10. Confirmation framing copy exists ─────────────────────────────────

describe("confirmation-required copy is present", () => {
  it("profile textFirst + structuring keys carry the confirm rule", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    // Silent-trust rule (fix/silent-trust-wording-cleanup-p0): the self-applied
    // saved-status label MUST NOT use any certification wording
    // ("Patvirtinta"/"Confirmed"/"Awaiting confirmation") — those imply a public
    // certification path. The new wording uses neutral review language; the
    // future external-review step is described honestly without "confirmation".
    expect(lt.skills.textFirst.confirmedByYou).toBe("Laukia peržiūros");
    expect(en.skills.textFirst.confirmedByYou).toBe("Not reviewed yet");
    // Silent-trust rule: the future step is framed as work records, never as
    // "external review" (which implies external approval as a public signal).
    expect(lt.skills.textFirst.needsExternalConfirmation).toMatch(/darbo įraš/i);
    expect(en.skills.textFirst.needsExternalConfirmation).toMatch(
      /work records/i,
    );
    // Quiet-UI reframe (fix/cv): the rule-based/AI disclaimer (ruleBasedNotice)
    // was REMOVED from normal user UI per the owner. Nothing replaces it.
  });
  it("journal exposes the saved-state strings", () => {
    const lt = JSON.parse(readWeb("messages/lt/journal.json"));
    const en = JSON.parse(readWeb("messages/en/journal.json"));
    expect(lt.savedTitle).toBeTruthy();
    expect(en.savedTitle).toBeTruthy();
    expect(lt.savedBody).toMatch(/išsaugot/i);
    expect(en.savedBody).toMatch(/saved/i);
  });
});

// ── 11. Role switcher exposes the non-locking intro inside the menu ─────

describe("role switcher honest framing", () => {
  it("RoleSwitcher renders the rolesIntro copy in its menu", () => {
    const txt = readWeb("components/app/role-switcher.tsx");
    expect(txt).toMatch(/tAccount\("rolesIntro"\)/);
  });
});

// ── 12. Central role / activity / status config is the source of truth ──

describe("central config drives role + suggestion + activity surfaces", () => {
  it("role config exists and only `worker` is active today", () => {
    const txt = readWeb("lib/config/roles.ts");
    expect(txt).toMatch(/LABOUR_MARKET_ROLES/);
    // Enumerate active role rows by id; only `worker` is allowed today.
    const rows = txt.split(/\bid:\s*"/).slice(1);
    const active = rows
      .map((chunk) => {
        const id = chunk.match(/^([^"]+)"/)?.[1];
        const avail = chunk.match(/availability:\s*"([^"]+)"/)?.[1];
        return id && avail === "active" ? id : null;
      })
      .filter((id): id is string => !!id);
    expect(new Set(active)).toEqual(new Set(["worker"]));
  });
  it("RoleSwitcher + account page read availability from the catalogue", () => {
    const rs = readWeb("components/app/role-switcher.tsx");
    const acct = readWeb("app/[locale]/dashboard/account/page.tsx");
    expect(rs).toMatch(/ROLE_BY_ID|LABOUR_MARKET_ROLES/);
    expect(acct).toMatch(/ROLE_BY_ID/);
  });
  it("suggestion-statuses config exists and externally_confirmed is preparing", () => {
    const txt = readWeb("lib/config/suggestion-statuses.ts");
    expect(txt).toMatch(/SUGGESTION_STATUSES/);
    // The externally_confirmed row must NOT be marked active anywhere.
    // We grep for the row and assert it carries availability: "preparing".
    expect(txt).toMatch(
      /id:\s*"externally_confirmed",[\s\S]{0,300}availability:\s*"preparing"/,
    );
  });
  it("activity-type config exists, only work_done + skill_claim are active", () => {
    const txt = readWeb("lib/config/activity-types.ts");
    expect(txt).toMatch(/ACTIVITY_TYPES/);
    // Split by `id:` and read each row's availability independently — a
    // forgiving way to enumerate active rows without depending on the
    // exact line ordering.
    const rows = txt.split(/\bid:\s*"/).slice(1);
    const active = rows
      .map((chunk) => {
        const id = chunk.match(/^([^"]+)"/)?.[1];
        const avail = chunk.match(/availability:\s*"([^"]+)"/)?.[1];
        return id && avail === "active" ? id : null;
      })
      .filter((id): id is string => !!id);
    expect(new Set(active)).toEqual(new Set(["work_done", "skill_claim"]));
  });
  it("feature-availability blocks matching / marketplace by config", () => {
    // The catalogue was reshaped in PR #36 to use FeatureKey ids instead
    // of dotted keys. Matching + marketplace remain `hidden` here; the
    // earlier ai.* / score.* rows are covered by the messages-level
    // honest-claims guard above (which forbids "AI verified", etc.).
    const txt = readWeb("lib/config/feature-availability.ts");
    expect(txt).toMatch(
      /key:\s*"matching",[\s\S]{0,200}availability:\s*"hidden"/,
    );
    expect(txt).toMatch(
      /key:\s*"marketplace",[\s\S]{0,200}availability:\s*"hidden"/,
    );
  });
});

// ── 13. Universal first-use copy + non-locking framing ──────────────────

describe("adaptive non-locking copy", () => {
  it("LT + EN firstUse copy says 'start from yourself' (5 steps)", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    // 5-step path (adaptive sprint expands from 4 → 5).
    expect(lt.auth.dashboard.firstUse.step5).toBeTruthy();
    expect(en.auth.dashboard.firstUse.step5).toBeTruthy();
    expect(lt.auth.dashboard.firstUse.title).toMatch(/savęs/i);
    expect(en.auth.dashboard.firstUse.title).toMatch(/yourself/i);
  });
  it("LT + EN account.rolesIntro carries the non-locking promise", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    const ltIntro = lt.auth.dashboard.account.rolesIntro as string;
    const enIntro = en.auth.dashboard.account.rolesIntro as string;
    expect(ltIntro).toMatch(/neužrakina/i);
    expect(enIntro).toMatch(/not lock|does not lock/i);
  });
});

// ── 14. Journal exposes universal examples (cross-domain) ───────────────

describe("journal universal examples", () => {
  it("LT + EN expose 4 cross-domain examples", () => {
    const lt = JSON.parse(readWeb("messages/lt/journal.json"));
    const en = JSON.parse(readWeb("messages/en/journal.json"));
    for (const m of [lt, en]) {
      expect(m.example1).toBeTruthy();
      expect(m.example2).toBeTruthy();
      expect(m.example3).toBeTruthy();
      expect(m.example4).toBeTruthy();
    }
    // The 4 examples must collectively reference at least three different
    // domains — customer support, project / proposal, team leadership,
    // and assembly / furniture work. We check via cumulative keywords so
    // future copy rewording doesn't blow up the test.
    const allLt = [lt.example1, lt.example2, lt.example3, lt.example4].join(
      " ",
    );
    expect(allLt).toMatch(/klient/i);
    expect(allLt).toMatch(/projekt|pasiūlym/i);
    expect(allLt).toMatch(/komand|vedž|paskirst/i);
    const allEn = [en.example1, en.example2, en.example3, en.example4].join(
      " ",
    );
    expect(allEn).toMatch(/customer/i);
    expect(allEn).toMatch(/project|proposal/i);
    expect(allEn).toMatch(/team/i);
  });
});

// ── 15. Suggestion-status copy is honest + externally_confirmed blocked ─

describe("suggestion status copy", () => {
  it("LT + EN expose every status label", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    const required = [
      "detected",
      "confirmed_by_user",
      "discarded_by_user",
      "needs_more_detail",
      "needs_external_confirmation",
      "externally_confirmed",
    ];
    for (const id of required) {
      expect(lt.suggestionStatuses[id]).toBeTruthy();
      expect(en.suggestionStatuses[id]).toBeTruthy();
    }
  });
  it("UI components do not currently render externally_confirmed status", () => {
    // Until real external confirmation ships (PR #18 / issue #32) no
    // surfaced UI may treat the parser path as externally confirmed.
    const grep = (path: string) => readWeb(path);
    const filesToCheck = [
      "components/app/profile-text-first-flow.tsx",
      "components/app/journal-entry-composer.tsx",
      "components/app/detected-suggestion-card.tsx",
      "components/app/detected-suggestion-list.tsx",
    ];
    for (const f of filesToCheck) {
      expect(grep(f)).not.toMatch(/externally_confirmed/);
    }
  });
});

// ── 16. Feature-availability catalogue + config-driven dashboard ────────

describe("feature-availability + config-driven dashboard", () => {
  it("catalogue contains every required FeatureKey", () => {
    const txt = readWeb("lib/config/feature-availability.ts");
    const required = [
      "overview",
      "profile_text_first",
      "journal_text_first",
      "account_roles",
      "role_expansion",
      "external_confirmation",
      "company_workspace",
      "agency_workspace",
      "customer_workspace",
      "document_records",
      "team_offers",
      "work_needs",
      "service_offers",
      "matching",
      "marketplace",
    ];
    for (const key of required) {
      expect(txt, `feature ${key} missing`).toMatch(
        new RegExp(`key:\\s*"${key}"`),
      );
    }
  });

  it("only the allowed beta surfaces are active today", () => {
    const txt = readWeb("lib/config/feature-availability.ts");
    const rows = txt.split(/\bkey:\s*"/).slice(1);
    const active = rows
      .map((chunk) => {
        const key = chunk.match(/^([^"]+)"/)?.[1];
        const avail = chunk.match(/availability:\s*"([^"]+)"/)?.[1];
        return key && avail === "active" ? key : null;
      })
      .filter((k): k is string => !!k);
    expect(new Set(active)).toEqual(
      new Set([
        // PR #37 adds `overview` so the dashboard home can drive primary
        // nav from the catalogue. The three text-first surfaces remain
        // the only feature workflows that ship today.
        "overview",
        // IA cleanup v2: the Marketplace HUB is an active surface — one compact
        // page that connects the map + opportunities + real owned companies,
        // with honest "preparing" states for supply-side offers/shop. It is real
        // navigation, NOT a fake matching marketplace (that stays the hidden
        // `marketplace` key).
        "marketplace_hub",
        // Unified market map (P0): one shared map surface, still active and
        // reachable (now a sub-surface of the Marketplace hub, no longer its own
        // global tab). Signal-only, no fake markers.
        "market_map",
        "profile_text_first",
        "journal_text_first",
        // P0 (request-not-received fix): communication / inbox is a real,
        // shipping surface — it is the recipient's only entry point for a
        // request another user starts with them, so it is active + in primary
        // nav. The conversation table + RLS already exist and work.
        "communication",
        "account_roles",
      ]),
    );
  });

  it("matching + marketplace are hidden by config", () => {
    const txt = readWeb("lib/config/feature-availability.ts");
    expect(txt).toMatch(
      /key:\s*"matching",[\s\S]{0,200}availability:\s*"hidden"/,
    );
    expect(txt).toMatch(
      /key:\s*"marketplace",[\s\S]{0,200}availability:\s*"hidden"/,
    );
  });

  it("account is settings only — no future-module grid (superseded PR #204)", () => {
    // Owner override 2026-06-25: account is settings-only; the feature grid is
    // retired from the nav surfaces.
    const txt = readWeb("app/[locale]/dashboard/account/page.tsx");
    expect(txt).not.toMatch(/FeatureAvailabilityGrid/);
  });

  it("FeatureAvailabilityGrid gates CTAs on isFeatureActive", () => {
    const txt = readWeb("components/app/feature-availability-grid.tsx");
    expect(txt).toMatch(/isFeatureActive/);
    // Preparing cards must NOT render a navigating link without an
    // active gate. Assert the only `<Link>` render is inside the
    // `active && f.primaryRoute ? (...) : (...)` ternary.
    expect(txt).toMatch(/active\s*&&\s*f\.primaryRoute\s*\?\s*\(\s*<Link/);
    // And assert there is exactly one Link tag in the component (the
    // gated one) — guards against an accidental extra ungated render.
    const linkOpens = txt.match(/<Link\b/g) ?? [];
    expect(linkOpens.length).toBe(1);
  });

  it("LT + EN expose the dashboard features heading + every feature label", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    for (const m of [lt, en]) {
      expect(m.dashboard.featuresHeading.title).toBeTruthy();
      expect(m.dashboard.featuresHeading.body).toBeTruthy();
      expect(m.features.preparing_badge).toBeTruthy();
      expect(m.features.preparing_generic_reason).toBeTruthy();
      for (const key of [
        "overview",
        "market_map",
        "profile_text_first",
        "journal_text_first",
        "account_roles",
        "role_expansion",
        "external_confirmation",
        "company_workspace",
        "agency_workspace",
        "customer_workspace",
        "document_records",
        "team_offers",
        "work_needs",
        "service_offers",
        "matching",
        "marketplace",
      ]) {
        expect(m.features[key]?.label, `${key} label`).toBeTruthy();
        expect(
          m.features[key]?.description,
          `${key} description`,
        ).toBeTruthy();
      }
    }
  });

  it("shared dashboard heading body carries the non-locking promise", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    expect(lt.dashboard.featuresHeading.body).toMatch(
      /paruoštos|paruoštus|kai jos|vėliau/i,
    );
    expect(en.dashboard.featuresHeading.body).toMatch(
      /later|when they are ready/i,
    );
  });
});

// ── 17. Primary nav is catalogue-driven ─────────────────────────────────

describe("catalogue-driven primary nav", () => {
  it("navigation.ts derives tabs from getVisiblePrimaryFeatures()", () => {
    const txt = readWeb("lib/config/navigation.ts");
    expect(txt).toMatch(/getVisiblePrimaryFeatures/);
    expect(txt).toMatch(/VISIBLE_PRIMARY_NAV_ITEMS/);
    expect(txt).toMatch(/TAB_META/);
  });

  it("BottomNav + DashboardTabs read VISIBLE_PRIMARY_NAV_ITEMS", () => {
    const bn = readWeb("components/app/bottom-nav.tsx");
    const dt = readWeb("components/app/dashboard-tabs.tsx");
    expect(bn).toMatch(/VISIBLE_PRIMARY_NAV_ITEMS/);
    expect(dt).toMatch(/VISIBLE_PRIMARY_NAV_ITEMS/);
    // No hardcoded TABS arrays left behind.
    expect(bn).not.toMatch(/^const TABS\s*=/m);
    expect(dt).not.toMatch(/^const TABS\s*=/m);
  });

  it("only the expected active surfaces become primary nav tabs", () => {
    // Mirrors the static set callers expect. If a future PR adds a tab,
    // both this assertion and the TAB_META map have to change — keeps
    // visual changes obvious in code review. The market map is a required
    // first-class primary-nav surface (unified map handoff, P0).
    // Action-first IA v1: the compact global nav is overview (Mano erdvė) /
    // market_map (Žemėlapis) / journal_text_first (Darbo žurnalas) /
    // communication (Žinutės). Profile / CV, the marketplace hub and
    // account/settings are NOT primary-nav tabs (sub-surfaces / avatar menu /
    // redirect).
    const navTxt = readWeb("lib/config/navigation.ts");
    const tabFeatures = [...navTxt.matchAll(/\b(overview|market_map|journal_text_first|communication):\s*\{\s*tabLabelKey/g)].map(
      (m) => m[1],
    );
    expect(new Set(tabFeatures)).toEqual(
      new Set([
        "overview",
        "market_map",
        "journal_text_first",
        "communication",
      ]),
    );
  });

  it("the `overview` feature is active and safeToShowInPrimaryNav", () => {
    const txt = readWeb("lib/config/feature-availability.ts");
    expect(txt).toMatch(
      /key:\s*"overview",[\s\S]{0,250}availability:\s*"active",[\s\S]{0,250}safeToShowInPrimaryNav:\s*true/,
    );
  });

  it("preparing features cannot appear in TAB_META", () => {
    // Static guard: any TAB_META key must also be an `active` row in
    // the feature catalogue. Defends against accidentally pinning a
    // preparing feature to a tab.
    const featTxt = readWeb("lib/config/feature-availability.ts");
    const navTxt = readWeb("lib/config/navigation.ts");
    const activeRows = featTxt.split(/\bkey:\s*"/).slice(1);
    const activeKeys = new Set(
      activeRows
        .map((chunk) => {
          const key = chunk.match(/^([^"]+)"/)?.[1];
          const avail = chunk.match(/availability:\s*"([^"]+)"/)?.[1];
          return key && avail === "active" ? key : null;
        })
        .filter((k): k is string => !!k),
    );
    const tabKeys = [
      ...navTxt.matchAll(/\b(\w+):\s*\{\s*tabLabelKey/g),
    ].map((m) => m[1]);
    for (const k of tabKeys) {
      expect(
        activeKeys.has(k),
        `tab feature ${k} must be availability:"active"`,
      ).toBe(true);
    }
  });

  it("LT + EN expose the new overview feature label", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    expect(lt.features.overview?.label).toBeTruthy();
    expect(en.features.overview?.label).toBeTruthy();
  });
});

// ── 18. Role catalogue drives dashboard role surfaces ───────────────────

describe("role catalogue + shared role-card model", () => {
  it("catalogue contains every required role id (live + future)", () => {
    const txt = readWeb("lib/config/roles.ts");
    const required = [
      "worker",
      "company",
      "agency",
      "customer",
      "freelancer",
      "team_lead",
      "service_provider",
    ];
    for (const id of required) {
      expect(txt, `role ${id} missing`).toMatch(new RegExp(`id:\\s*"${id}"`));
    }
  });

  it("only `worker` is currently active", () => {
    const txt = readWeb("lib/config/roles.ts");
    const rows = txt.split(/\bid:\s*"/).slice(1);
    const active = rows
      .map((chunk) => {
        const id = chunk.match(/^([^"]+)"/)?.[1];
        const avail = chunk.match(/availability:\s*"([^"]+)"/)?.[1];
        return id && avail === "active" ? id : null;
      })
      .filter((id): id is string => !!id);
    expect(new Set(active)).toEqual(new Set(["worker"]));
  });

  it("role config exposes the new spec helpers", () => {
    const txt = readWeb("lib/config/roles.ts");
    for (const helper of [
      "getRoleConfig",
      "getVisibleRoleOptions",
      "getActiveRoles",
      "getPreparingRoles",
      "isRoleActive",
      "isRolePreparing",
    ]) {
      expect(txt, `helper ${helper} missing`).toMatch(
        new RegExp(`export function ${helper}\\b`),
      );
    }
  });

  it("RoleCatalogueCard renders <Link> only inside the honest-start-path branch", () => {
    const txt = readWeb("components/app/role-catalogue-card.tsx");
    // PR #97 extended the catalogue card to render the navigating
    // <Link> not only for `active` roles but also for `start-available`
    // and `partial` roles (using their `setupRoute`). The shape is now
    //   {hasHonestStartPath && ctaRoute ? <Link …/> : null}
    // Both helpers are pinned so a regression to `availability !==
    // "active"` collapse is caught.
    expect(txt).toMatch(
      /hasHonestStartPath\s*&&\s*ctaRoute\s*\?\s*\(\s*<Link/,
    );
    // Exactly one Link tag — guards against an ungated render.
    const linkOpens = txt.match(/<Link\b/g) ?? [];
    expect(linkOpens.length).toBe(1);
  });

  it("account is settings only — no all-roles catalogue (superseded PR #204)", () => {
    // Owner override 2026-06-25: the all-roles catalogue is retired from
    // account; identity switching is the header role switcher.
    const txt = readWeb("app/[locale]/dashboard/account/page.tsx");
    expect(txt).not.toMatch(/RoleCatalogueGrid/);
    expect(txt).not.toMatch(/getVisibleRoleOptions/);
  });

  it("RoleSwitcher + account page still consume the role catalogue", () => {
    const rs = readWeb("components/app/role-switcher.tsx");
    const acct = readWeb("app/[locale]/dashboard/account/page.tsx");
    // PR #35 wired both through ROLE_BY_ID — this guard prevents drift.
    expect(rs).toMatch(/ROLE_BY_ID|LABOUR_MARKET_ROLES/);
    expect(acct).toMatch(/ROLE_BY_ID/);
  });

  it("role labels + descriptions are i18n keys, never raw UI text", () => {
    const txt = readWeb("lib/config/roles.ts");
    const labelKeys = [...txt.matchAll(/labelKey:\s*"([^"]+)"/g)].map(
      (m) => m[1],
    );
    const descKeys = [...txt.matchAll(/descriptionKey:\s*"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(labelKeys.length).toBeGreaterThanOrEqual(7);
    expect(descKeys.length).toBeGreaterThanOrEqual(7);
    for (const key of [...labelKeys, ...descKeys]) {
      // Heuristic: i18n keys are dotted identifiers, never spaces /
      // diacritics / sentence text.
      expect(key).toMatch(/^[a-z][a-zA-Z0-9._]*$/);
    }
  });

  it("LT + EN expose the new roles.* namespace + all role descriptions", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    for (const m of [lt, en]) {
      expect(m.roles.nonLockingIntro).toBeTruthy();
      expect(m.roles.addLaterHint).toBeTruthy();
      expect(m.roles.status.active).toBeTruthy();
      expect(m.roles.status.preparing).toBeTruthy();
      expect(m.roles.preparingReason.default).toBeTruthy();
      for (const id of [
        "worker",
        "company",
        "agency",
        "customer",
        "freelancer",
        "team_lead",
        "service_provider",
      ]) {
        expect(m.roles[id]?.description, `${id} description`).toBeTruthy();
      }
    }
  });

  it("non-locking role copy carries the explicit promise", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    expect(lt.roles.nonLockingIntro).toMatch(/apribojim|nėra\s+lim/i);
    expect(en.roles.nonLockingIntro).toMatch(/not a limit|not lock/i);
  });
});

// ── 19. Pilot readiness clarity (Super Max Cosmo, PR #39) ───────────────

describe("pilot readiness clarity", () => {
  it("journal page renders the honest pilot-backbone note", () => {
    const txt = readWeb("app/[locale]/dashboard/journal/page.tsx");
    expect(txt).toMatch(/t\("pilotBackboneNote"\)/);
  });

  it("LT + EN expose the pilotBackboneNote with an honest review signal", () => {
    const lt = JSON.parse(readWeb("messages/lt/journal.json"));
    const en = JSON.parse(readWeb("messages/en/journal.json"));
    expect(lt.pilotBackboneNote).toBeTruthy();
    expect(en.pilotBackboneNote).toBeTruthy();
    // Silent-trust rule: neutral review wording, not "confirmation".
    expect(lt.pilotBackboneNote).toMatch(/peržiūr/i);
    expect(en.pilotBackboneNote).toMatch(/review/i);
    // Honesty: must mention privacy / closed visibility today so the
    // worker isn't misled into thinking the legal backbone is live.
    expect(lt.pilotBackboneNote).toMatch(/privat/i);
    expect(en.pilotBackboneNote).toMatch(/private/i);
  });

  it("Super Max Cosmo owner smoke checklist exists and is PENDING", () => {
    const txt = read(
      "docs/evidence/super-max-cosmo-pilot-readiness-v1/owner-production-smoke-checklist.md",
    );
    expect(txt).toMatch(/Status:\s*PENDING/);
    expect(txt).toMatch(/Smoke status:\s*PENDING/);
  });

  it("PR #30 smoke checklist also remains PENDING", () => {
    // Belt-and-braces: both checklists must stay PENDING in lock-step.
    const pr30 = read("docs/evidence/post-merge-production-smoke-pr30.md");
    expect(pr30).toMatch(/Status:\s*PENDING/);
  });
});

// ── 20. Supergrand vision public surface (PR #40) ───────────────────────

describe("supergrand vision surface", () => {
  it("public /vision page + LabourMarketOsMap component exist", () => {
    const page = readWeb("app/[locale]/(marketing)/vision/page.tsx");
    const map = readWeb("components/marketing/labour-market-os-map.tsx");
    expect(page).toMatch(/LabourMarketOsMap/);
    // Map must read from all three catalogues — that's what makes it
    // tamper-proof against drift.
    expect(map).toMatch(/from\s+["']@\/lib\/config\/feature-availability["']/);
    expect(map).toMatch(/from\s+["']@\/lib\/config\/activity-types["']/);
    expect(map).toMatch(/from\s+["']@\/lib\/config\/roles["']/);
  });

  it("vision page renders the today / preparing / control-room sections", () => {
    const page = readWeb("app/[locale]/(marketing)/vision/page.tsx");
    const map = readWeb("components/marketing/labour-market-os-map.tsx");
    expect(map).toMatch(/vision\.sections\.today/);
    expect(map).toMatch(/vision\.sections\.preparing/);
    expect(map).toMatch(/vision\.sections\.controlRoom/);
    expect(map).toMatch(/vision\.sections\.future_layers/);
    // The vision page uses a scoped translator `getTranslations("vision")`,
    // so the literal key is "honesty" (not "vision.honesty"). Assert the
    // honesty paragraph is wired through, and that the scoped namespace
    // is the vision one.
    expect(page).toMatch(/getTranslations\("vision"\)/);
    expect(page).toMatch(/t\("honesty"\)/);
  });

  it("vision control room declares PR #18 BLOCKED + owner smoke PENDING", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    expect(lt.vision.controlRoom.ownerSmokeStatus).toBe("PENDING");
    expect(en.vision.controlRoom.ownerSmokeStatus).toBe("PENDING");
    expect(lt.vision.controlRoom.pr18Status).toMatch(/BLOCKED/);
    expect(en.vision.controlRoom.pr18Status).toMatch(/BLOCKED/);
    // The fake-claims row must read "never used" in both locales.
    expect(lt.vision.controlRoom.fakeClaimsStatus).toMatch(/Niekada/);
    expect(en.vision.controlRoom.fakeClaimsStatus).toMatch(/Never/);
  });

  it("activityTypes labels resolve in LT + EN", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    for (const id of [
      "work_done",
      "skill_claim",
      "service_offer",
      "worker_need",
      "project_need",
      "team_offer",
      "company_activity",
      "learning_goal",
      "business_idea",
      "document_record",
    ]) {
      expect(lt.activityTypes[id], `LT activityTypes.${id}`).toBeTruthy();
      expect(en.activityTypes[id], `EN activityTypes.${id}`).toBeTruthy();
    }
  });

  it("nav.vision i18n key exists in LT + EN (ready for the flip)", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    expect(lt.nav.vision).toBeTruthy();
    expect(en.nav.vision).toBeTruthy();
    // SiteNav still declares the /vision link in its source — but the
    // visibility is gated through `isVisionPublic()` at render time
    // (see the "vision is gated behind the publication flag" assertion
    // below). Keeping the entry in the source means flipping
    // VISION_PUBLIC to `true` is a one-line owner edit.
    const nav = readWeb("components/layouts/site-nav.tsx");
    expect(nav).toMatch(/href:\s*"\/vision"/);
  });

  it("vision is gated behind the publication flag (PR #41)", () => {
    const cfg = readWeb("lib/config/vision-publication.ts");
    // Default must be `false` until the owner flips it after smoke
    // PASSES — the literal here is what reviewers see in PRs.
    expect(cfg).toMatch(/VISION_PUBLIC:\s*boolean\s*=\s*false/);
    expect(cfg).toMatch(/export function isVisionPublic\(\)/);

    // SiteNav consults the gate before rendering the /vision link.
    const nav = readWeb("components/layouts/site-nav.tsx");
    expect(nav).toMatch(/isVisionPublic/);
    expect(nav).toMatch(/visibility:\s*"vision-gate"/);

    // Vision page reads the flag, emits robots:noindex when private,
    // and renders the internal-preview banner.
    const page = readWeb("app/[locale]/(marketing)/vision/page.tsx");
    expect(page).toMatch(/isVisionPublic/);
    expect(page).toMatch(/index:\s*false/);
    expect(page).toMatch(/follow:\s*false/);
    expect(page).toMatch(/data-testid="vision-internal-preview"/);
    expect(page).toMatch(/internalPreviewBanner/);
  });

  it("internal-preview copy exists in LT + EN", () => {
    const lt = JSON.parse(readWeb("messages/lt.json"));
    const en = JSON.parse(readWeb("messages/en.json"));
    expect(lt.vision.internalPreviewBadge).toBeTruthy();
    expect(lt.vision.internalPreviewBanner).toBeTruthy();
    expect(en.vision.internalPreviewBadge).toBeTruthy();
    expect(en.vision.internalPreviewBanner).toBeTruthy();
    // Honesty signals — keep the "do not publish publicly until smoke"
    // wording in both locales.
    expect(lt.vision.internalPreviewBanner).toMatch(/smoke/i);
    expect(en.vision.internalPreviewBanner).toMatch(/smoke/i);
  });

  it("Super Max Cosmo + Supergrand Vision smoke checklists stay PENDING", () => {
    // Belt-and-braces: both PR #30 and PR #39 checklists must still
    // be PENDING; the new sprint may not silently flip them.
    const pr30 = read("docs/evidence/post-merge-production-smoke-pr30.md");
    const cosmo = read(
      "docs/evidence/super-max-cosmo-pilot-readiness-v1/owner-production-smoke-checklist.md",
    );
    expect(pr30).toMatch(/Status:\s*PENDING/);
    expect(cosmo).toMatch(/Status:\s*PENDING/);
  });

  it("vision-related docs all exist", () => {
    for (const rel of [
      "docs/product/labourmarketai-supergrand-vision-os-v1.md",
      "docs/architecture/labourmarketai-operating-system-map-v1.md",
      "docs/product/labourmarketai-pilot-to-grand-vision-roadmap-v1.md",
      "docs/evidence/supergrand-vision-os-leap-v1/README.md",
      "docs/evidence/supergrand-vision-os-leap-v1/owner-review-checklist.md",
    ]) {
      const txt = read(rel);
      expect(txt.length, `${rel} should be non-empty`).toBeGreaterThan(200);
    }
  });

  it("vision doctrine doc refuses patent / patent-pending language", () => {
    // Task spec G: do NOT call any internal architecture a patent
    // application or claim "patent pending". Owner review required
    // before any such legal claim ever lands publicly.
    const docs = [
      read("docs/product/labourmarketai-supergrand-vision-os-v1.md"),
      read("docs/architecture/labourmarketai-operating-system-map-v1.md"),
      read("docs/product/labourmarketai-pilot-to-grand-vision-roadmap-v1.md"),
    ];
    for (const txt of docs) {
      expect(txt).not.toMatch(/\bpatent\s+pending\b/i);
      expect(txt).not.toMatch(/\bpatented\b/i);
      expect(txt).not.toMatch(/\bpatent application\b/i);
    }
  });

  it("LabourMarketOsMap does not embed any fake live metric", () => {
    // Numbers shown on the control-room card must come from catalogue
    // derived counts, NOT from a literal that pretends to be live data.
    // We confirm the component sources its Stat values from
    // `getVisibleFeatures()` and not from hardcoded strings like
    // "318k" or "1,180" (those still live on the marketing landing
    // and are governed by their own PRE-ALPHA chip).
    const map = readWeb("components/marketing/labour-market-os-map.tsx");
    expect(map).toMatch(/getVisibleFeatures/);
    expect(map).not.toMatch(/318[Kk]|1,180|1,200/);
  });
});

// ── 21. Auth re-entry: `next` is preserved across login / signup / OAuth

describe("auth session re-entry honours `next` (PR #43)", () => {
  it("login form reads `next` + routes the user there after success", () => {
    const txt = readWeb("components/app/login-form.tsx");
    expect(txt).toMatch(/useSearchParams/);
    expect(txt).toMatch(/getSafeReturnPath/);
    expect(txt).toMatch(/nextPath/);
    // The hardcoded /dashboard redirect must be gone — replaced by an
    // assign to the sanitised return path.
    expect(txt).not.toMatch(/router\.replace\("\/dashboard"\)/);
    expect(txt).toMatch(/window\.location\.assign\(nextPath\)/);
  });

  it("signup form reads `next` + carries it into onboarding", () => {
    const txt = readWeb("components/app/signup-form.tsx");
    expect(txt).toMatch(/useSearchParams/);
    expect(txt).toMatch(/getSafeReturnPath/);
    expect(txt).toMatch(/router\.replace\(onboardingPath\)/);
    // Already-registered users see an inline "Login instead" CTA, not
    // just the body text — the data-testid is the stable hook.
    expect(txt).toMatch(/data-testid="signup-login-instead"/);
    expect(txt).toMatch(/errorKind === "alreadyRegistered"/);
  });

  it("GoogleButton forwards a sanitised `next` into the OAuth redirect", () => {
    const txt = readWeb("components/app/google-button.tsx");
    expect(txt).toMatch(/nextPath\?:\s*string/);
    expect(txt).toMatch(/callback\.searchParams\.set\("next", nextPath\)/);
  });

  it("OAuth callback honours `next` + preserves it on error rebounds", () => {
    const txt = readWeb("app/[locale]/auth/callback/route.ts");
    expect(txt).toMatch(/getSafeReturnPath/);
    expect(txt).toMatch(/url\.searchParams\.get\("next"\)/);
    // On error we rebound to /auth/login with the `next` preserved so
    // the retry still routes the user correctly.
    expect(txt).toMatch(
      /loginUrl\.searchParams\.set\("next",\s*nextParam\)/,
    );
  });

  it("no real owner email appears in repo changes", () => {
    // Belt-and-braces: the primary email named in the bug report must
    // never appear in any source / docs / test fixture under apps/web
    // or docs/. This is a privacy hygiene guard — the literal itself
    // is reconstructed at runtime from two halves so this very
    // assertion does not embed it.
    const localLeft = "sukys";
    const localRight = "donatas";
    const owned = `${localLeft}${localRight}@gmail.com`;
    const scanDirs = [
      resolve(WEB, "messages"),
      resolve(WEB, "components"),
      resolve(WEB, "app"),
      resolve(WEB, "lib"),
      resolve(WEB, "scripts"),
      resolve(REPO, "docs"),
    ];
    function walkFiles(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        const s = statSync(p);
        if (s.isDirectory()) {
          if (
            entry === "node_modules" ||
            entry === ".next" ||
            entry === ".turbo"
          )
            continue;
          out.push(...walkFiles(p));
        } else if (/\.(ts|tsx|js|jsx|json|md|sql)$/i.test(p)) {
          out.push(p);
        }
      }
      return out;
    }
    for (const dir of scanDirs) {
      for (const f of walkFiles(dir)) {
        const txt = readFileSync(f, "utf8");
        if (txt.includes(owned)) {
          throw new Error(
            `Owner email leaked into ${f.replace(REPO, ".")}`,
          );
        }
      }
    }
  });
});

// ── 22. This sprint adds no Supabase migration files ────────────────────

describe("no migration files added by this sprint", () => {
  it("supabase/migrations contains no new files vs main baseline", () => {
    // The audit / smoke documents reflect the migrations that exist at
    // main; if a new migration file appears in this branch it must be
    // intentional + go through a separate review (issue #32). We snapshot
    // the count using readdir at test time — adding new migrations bumps
    // this number and fails the test with a clear message.
    const dir = resolve(REPO, "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    // Whatever the baseline count is at the start of the sprint, the
    // count must not grow during it. We capture the baseline here from
    // the merged state at sprint start. Bumped from 13 → 14 on the
    // registered-user-core-loop-v1 sprint: migration 0014 adds an
    // owner-only `profile_text` column to public.profiles so the
    // text-first composer's raw narrative is NOT stored on employer-
    // readable workers.bio. profiles_select RLS (0001) + GRANTs (0004)
    // already scope reads/writes to the owner; no new policy needed.
    // Bumped from 14 → 15 on the profile-text-to-skill-suggestions-v1
    // sprint: migration 0015 adds the owner-only `profile_skill_claims`
    // table so structured self-declared skill labels (derived from the
    // narrative) persist in their own RLS-closed primitive instead of
    // leaking through worker_skills (employer-readable).
    // Bumped from 15 → 16 on the journal-evidence-loop-v2 sprint:
    // migration 0017 seeds the platform productivity_units rows that
    // `apps/web/components/app/journal-entry-composer.tsx` UNIT_OPTIONS
    // (hours/minutes/days/meters/pieces/kilograms/packages) has always
    // referenced but were never registered — the FK was silently rejecting
    // any non-area journal_entry_metrics insert. The same migration adds an
    // atomic `create_journal_entry_full` RPC so the journal save can no
    // longer leak a half-written entry if the metrics insert fails.
    //
    // Bumped from 16 → 17 on the journal-evidence-loop-v3 sprint: migration
    // 0018 ships the correction / edit / delete lifecycle. Adds the
    // `deleted_at` + `correction_of` columns to journal_entries, plus two
    // security-definer RPCs (journal_entry_soft_delete,
    // journal_entry_supersede) that gate pre-vs-post external-confirmation
    // behaviour. Additive only; no schema removals.
    //
    // Bumped from 17 → 18 on the language-feedback v1 sprint: migration
    // 0019 ships `public.language_feedback` (route / locale / selected_text /
    // comment / user_id / status='open' / created_at) with RLS — SELECT is
    // admin-only via `public.is_admin()`, INSERT restricts user_id to
    // auth.uid() or NULL. Append-only inbox (no UPDATE / DELETE policy);
    // grants restricted to authenticated.
    //
    // Bumped from 18 → 19 on the pilot-draft-flows sprint
    // (feat/cc/pilot-draft-flows = PR #54): migration 0016 adds the
    // owner-only `pilot_drafts` table holding private company/agency/buyer
    // drafts with explicit GRANT to authenticated only, closed-only
    // visibility CHECK, and admin-read via is_admin(). 0016 sits
    // numerically BEFORE 0017/0018/0019 only because this PR's branch
    // forked off main before those numbers existed; SQL idempotency
    // (`create table if not exists`, RLS `drop policy if exists` + recreate)
    // keeps re-runs safe. See lib/guards/pilot-drafts.test.ts for the full
    // RLS / privacy / sanitisation guard suite.
    //
    // Bumped from 19 → 20 on the agent-os-and-pilot-telemetry-v1 sprint:
    // migration 0020 adds `public.pilot_events` (id / created_at /
    // profile_id / session_id / route / locale / event_name / task_name /
    // task_step / duration_ms / result / error_code / metadata /
    // app_version) with RLS — SELECT admin-only via public.is_admin(),
    // INSERT profile_id=auth.uid() OR NULL. Append-only inbox (no UPDATE /
    // DELETE policy); grants restricted to authenticated.
    //
    // Bumped from 20 → 21 on the pilot-launch-os-v2 sprint: migration
    // 0021 adds the v1 communication surface — three tables
    // (`conversations`, `conversation_participants`, `messages`) +
    // `is_conversation_participant(uuid)` helper (security invoker).
    // Participant-scoped SELECT; messages append-only (no UPDATE/DELETE
    // policy); participants can flip only their own last_read_at.
    // Grants only to authenticated.
    //
    // Bumped from 21 → 23 on:
    //  - PR #51 (`feat/cc/job-postings`) migration 0023 — `job_postings`
    //    (with admin / company-owner / authenticated-read RLS + GRANTs).
    //  - PR #94 (`fix(admin,i18n): is_admin() dual signal …`) migration
    //    0024 — rewrites `public.is_admin()` to honour BOTH
    //    `profiles.active_role='admin'` AND a `profile_roles[admin]`
    //    row. Applied to prod via MCP `apply_migration`; source-of-truth
    //    copy committed for repo parity. No schema change, no new table,
    //    no RLS broadening — just the function body.
    //
    // Bumped from 23 → 28 to track the migrations already MERGED to main
    // since the baseline was last set (this guard had drifted — it was
    // never bumped when these shipped, so the suite was red on main):
    //  - 0025_agency_worker_invitations (PR #99)
    //  - 0026_customer_entity (PR #100/#101)
    //  - 0027_company_workers (PR #102)
    //  - 0028_customer_requests (PR #103)
    //  - 0029_customer_request_attachments (PR #104)
    // (0024_is_admin_dual_signal was already counted in the 21 → 23 bump
    // above.) The intent is unchanged: a NEW migration added by a future
    // sprint must bump this number deliberately, in its own review.
    //
    // Bumped from 28 → 29 on the employment↔journal ops-bridge sprint:
    // migration 0030 adds additive nullable columns (operations_role /
    // operations_title / journal_review_enabled default false /
    // journal_review_scope) to public.company_workers + public.agency_workers
    // so a per-relationship operations role + journal-review flag can exist.
    // Non-destructive: no drops/renames/backfill, no RLS change, safe
    // default = not assigned / review off. Owner-gated apply to prod.
    //
    // Bumped from 29 → 30 on the ops-role-assign-rpc-v1 slice: migration
    // 0031 adds two SECURITY DEFINER RPCs (assign_company_worker_role /
    // assign_agency_worker_role) — the owner/admin-scoped write path for the
    // 0030 bridge columns. Functions only: ownership re-validated, role
    // validated against the conservative set, clearing supported, journal
    // review NEVER enabled (label != permission), every write audit-logged
    // to public.audit_logs. No table/RLS/grant change beyond EXECUTE on the
    // two functions. Owner-gated apply to prod.
    //
    // Bumped from 30 → 31 on the engagement-context-provisioning-rpc-v1
    // slice: migration 0032 adds two SECURITY DEFINER RPCs
    // (provision_company_worker_engagement_context /
    // provision_agency_worker_engagement_context) that idempotently link an
    // employment relationship to its mirrored organization via an active
    // `employee` engagement_context. Functions only: ownership re-validated,
    // role reviewer-eligibility checked, audit-logged, review NEVER enabled.
    // No table/RLS/grant change beyond EXECUTE on the two functions.
    //
    // Bumped from 31 → 32 on the journal-review-enable-toggle-v1 slice:
    // migration 0033 adds FOUR SECURITY DEFINER functions —
    // set_{company,agency}_worker_journal_review (the owner/admin-scoped,
    // engagement-context-gated write that finally enables/disables the
    // per-relationship journal_review_enabled flag — enabling REQUIRES a real
    // active `employee` engagement_context; disabling is always safe) and
    // {company,agency}_worker_engagement_links (owner-scoped per-row read of
    // which workers are bridged). Functions only: ownership re-validated,
    // idempotent, audit-logged, no fake data, only the journal_review_enabled
    // flag on the link tables is mutated. No table/RLS/grant change beyond
    // EXECUTE on the four functions. See journal-review-enable-rpc.test.ts.
    //
    // Bumped from 32 → 33 on the manager-review-evidence-result-v1 slice:
    // migration 0034 adds TWO SECURITY DEFINER functions — review_journal_entry
    // (the manager/admin + journal_review_enabled-gated evidence write, three
    // decisions approved/rejected/changes_requested, append-only into
    // journal_entry_confirmations + audit_logs) and reviewable_journal_entry_ids
    // (the gated pending set). Functions only: reviewer scope re-validated,
    // append-only, no fake data. No table/RLS/grant change beyond EXECUTE on the
    // two functions. See manager-review-rpc.test.ts.
    //
    // Bumped from 33 → 34 on the sales-core-nonstop-v1 unblock: migration 0035
    // adds public.ensure_org_owner_engagement() + an AFTER INSERT trigger on
    // public.organizations and an idempotent backfill, giving each org owner the
    // 'owner' engagement_context the 0013 backfill missed for post-0013 orgs
    // (so manages_organization() works and they can review). Additive +
    // idempotent, no destructive SQL, no RLS/grant change. See
    // owner-engagement-backfill-rpc.test.ts.
    //
    // Bumped from 34 → 35 on the sales-core-nonstop-v1 gap #1: migration 0036
    // adds public.accept_{company,agency}_worker_invitation — the worker-
    // initiated SECURITY DEFINER acceptance that finally turns a pending
    // invitation into a real company_workers / agency_workers link (the chain's
    // missing first step). Worker-scoped, idempotent, audit-logged; no fake
    // data, no destructive SQL, no RLS/grant change beyond EXECUTE on the two
    // functions. See accept-worker-invitation-rpc.test.ts.
    //
    // Bumped from 35 → 37 on the converge-single-product slice: two reversible,
    // owner-approved convergence migrations (timestamp-named per PLATFORM_DOCTRINE
    // §16). 20260530120000_drop_legacy_threads_messages drops the unused legacy
    // messaging tables (both asserted 0 rows; conversations* is canonical).
    // 20260530120100_projects_company_to_organization adds projects.organization_id
    // (FK organizations) + legacy-bridge backfill, KEEPING the nullable company_id
    // column (non-destructive). See matching-ui-neutralized.test.ts and
    // docs/CONVERGENCE_CHANGELOG.md.
    //
    // Bumped from 37 → 38 on the TASK 03 consolidation: one salvaged additive
    // migration 20260530130000_journal_integrity_guards (original_language CHECK
    // from the canonical i18n locale set + closed-only insert narrowing).
    // Committed + queued for review, NOT applied. See
    // journal-integrity-guards-migration.test.ts.
    //
    // Bumped from 38 → 39 on the keystone (TASK 01): one additive migration
    // 20260530140000_membership_engagement_reroute (engagement_contexts
    // membership + review-enable, hash-chained RPCs, legacy→canonical review
    // reroute, confirm_entry_and_verify_skills). Committed + queued for the gate,
    // NOT applied. See membership-engagement-reroute-migration.test.ts.
    // Bumped 39 → 40 on TASK 05 (demand-intake consolidation): additive
    // 20260530150000_demand_intake_consolidation (customer_requests +=
    // kind/payload/original_language + draft index + save_demand_draft RPC;
    // folds pilot_drafts). Committed + queued for the gate, NOT applied.
    // Bumped 40 → 41 for the journal_entry_work_items RED gate (PR #196):
    // additive 20260601090000_journal_entry_work_items (durable per-work-item
    // storage for journal recognition; new table + RLS + grants to
    // authenticated only). Owner-approved and APPLIED to prod via Supabase MCP
    // apply_migration (gorgitwvdzxbnaxhrsrw); this bump lets the gate pass.
    // Bumped 41 → 42 for the project/object/client RED gate (PR #197): additive
    // 20260601091000_project_object_client_context (project_clients /
    // project_members / project_worker_assignments tables + can_manage_project
    // predicate + nullable journal_entries.project_id; RLS + grants to
    // authenticated only). Owner-approved and APPLIED to prod via Supabase MCP.
    // Bumped 42 → 43 for the journal-entry-skill-links-v1 slice: additive
    // 20260602120000_journal_entry_skills (durable journal_entry ↔ skill
    // EVIDENCE-SUPPORT relation; new table + owner-scoped RLS mirroring
    // journal_entry_work_items + grant to authenticated only; NOT verification).
    // Committed + queued for the gate, NOT applied by the agent. See
    // journal-entry-skill-links.test.ts.
    // Bumped 43 → 44 for the company-profile-request-v1 slice: additive
    // 20260604120000_company_profile_request adds nullable org-detail columns
    // (registration_code / address / contact_email / contact_phone /
    // requester_role / verification_note / requested_at) + a 4-state
    // verification_status ladder (draft|pending_verification|unverified|
    // verified, default draft, legacy rows backfilled to unverified) +
    // save_company_setup() SECURITY DEFINER upsert that can REQUEST (pending)
    // but never fabricate a verified company + a guarded unique(profile_id).
    // No drops of the companies table/columns; reversible. Committed + queued
    // for the gate, NOT applied by the agent. See
    // company-profile-request-honesty.test.ts.
    // Bumped 44 → 45 for the company-verification-admin slice: additive
    // 20260604130000_admin_company_verification adds ONE SECURITY DEFINER
    // function (admin_set_company_verification) — admin-only, audit-logged,
    // sets verified/unverified/pending_verification, no new companies grant, no
    // change to the PR#250 trigger. Committed + queued for the gate, NOT
    // applied by the agent. See company-verification-admin.test.ts.
    // Bumped 45 → 46 for the company-automatic-first correction: additive
    // 20260604140000_company_automatic_first widens the verification_status
    // CHECK (+active_unverified, +needs_checks), sets the column default to
    // 'active_unverified', backfills draft→active_unverified, and CREATE OR
    // REPLACEs save_company_setup to derive status from automated checks
    // (manual review = optional escalation, not the default gate). PR#250
    // trigger untouched; no new companies grant. Committed + queued, NOT
    // applied by the agent. See company-automatic-first.test.ts.
    // Bumped 46 → 47 for the worker work-card slice: additive
    // 20260608120000_worker_work_card adds workers.work_card_confirmed_at
    // (IF NOT EXISTS) + two owner-scoped SECURITY DEFINER RPCs (save_worker_card
    // / confirm_worker_card) writing ONLY whitelisted card fields WHERE
    // profile_id = auth.uid() — never trust_score/profile_completeness, no
    // blanket UPDATE grant on workers, no RLS loosening, reversible. Committed +
    // queued for the gate, NOT applied by the agent. See
    // worker-work-card-migration.test.ts.
    // Bumped 47 → 48 for the RPC execute hardening slice: additive
    // 20260608140000_worker_work_card_execute_hardening revokes the implicit
    // PUBLIC/anon EXECUTE on the two work-card RPCs (keeps authenticated) —
    // hardening-only, no body/schema/data change, reversible.
    // Bumped 48 -> 49 for work-instructions v1: additive instruction columns on
    // conversation_messages + owner-scoped, relationship-gated SECURITY DEFINER
    // send_work_instruction RPC (reuses existing participant-scoped message RLS).
    // Bumped 49 -> 50 for F4 worker-project assignment: additive owner-scoped
    // SECURITY DEFINER assign_worker_to_project/end_worker_project_assignment RPCs
    // (can_manage_project AND caller roster gate) + revoke direct PWA writes.
    // Bumped 52 -> 53 for Pilot Operations v2 (pilot-ops-v2-status-docs):
    // additive 20260609180000_pilot_ops_v2_status_readiness adds two RLS-enabled
    // tables (project_worker_operational_statuses, project_worker_readiness_items)
    // with SELECT-only grants + RPC-only writes (set_worker_operational_status,
    // upsert_worker_readiness_item) gated by can_manage_project AND an active F4
    // assignment. No existing table/policy/grant changed; reversible.
    // Bumped 53 -> 54 for candidate-provider-draft-v1: additive owner-scoped
    // candidate_drafts table (owner_id = auth.uid() RLS + admin read, direct
    // authenticated writes, explicit grants). No account/consent/verification;
    // a draft is not assignable until linked. Reversible.
    // Bumped 54 -> 55 for conversations-ui (Workstream B): ONE additive DRAFT
    // (20260610190000_conversation_message_language: nullable original_language
    // on conversation_messages, doctrine 2.3; applied ONLY via MCP by owner).
    // Bumped 55 -> 58 for esco-taxonomy-foundation (S2): three migrations -
    // 20260610130000 (esco_occupations/skills/relations/labels, read-only RLS,
    // admin writes), 20260610130100 (additive esco_uri refs on
    // professions/skills, no data change), 20260610130200 (candidate_skills,
    // doctrine 2.3 original_text/original_language, default-closed, no
    // auto-approve). All additive + reversible; APPLIED to prod via MCP
    // apply_migration after owner review (2026-06-10, ledger 20260610172207/
    // 172226/172251). Authored as 54 -> 57; resolved to 58 at merge because
    // main had moved to 55. Design: docs/product/esco-taxonomy-design.md.
    // Bumped 58 -> 59 for s3-documents-readiness
    // (20260610170000_worker_documents_readiness: document_types slug registry
    // + worker_documents inventory + append-only events + country requirement
    // STRUCTURE with needs_legal_source flags; RPC-only writes, default-closed
    // RLS). Additive + reversible; APPLIED to prod via MCP apply_migration
    // after owner review (2026-06-10, ledger 20260610172333). Authored as
    // 54 -> 55; resolved to 59 at merge on top of main's 58.
    // Bumped 59 -> 60 for esco-labels-all-official-languages: ONE
    // needs-human-gate DRAFT (20260610230000) widening the
    // esco_labels.locale CHECK from the 10 platform locales to all 28
    // official ESCO v1.2.1 languages (pure superset, no schema/RLS/grant
    // change; ru deliberately absent — not an official ESCO language).
    // Bumped 60 -> 61 for esco-service-role-grants (20260610234500):
    // GRANTS-ONLY fix — MCP-created tables get no service_role default
    // privileges, so the official importer's upserts hit "permission denied";
    // grants select/insert/update on the four esco_* tables to service_role,
    // no RLS change, anon untouched.
    // Bumped 61 -> 63 at the S4 merge for termometras+market:
    // 20260610213000 (journal_entries.project_id autolink: body-replace of the
    // two save-path RPCs, no schema/RLS/grant change, link only when exactly
    // one active same-org assignment) and 20260610214000 (market_rate_averages
    // admin-entered table + admin_set_market_rate_average RPC + the
    // project_position_salary_avg aggregate RPC, prod-fixed to return avg ONLY
    // when sample_n >= 2). Both APPLIED to prod via MCP apply_migration after
    // owner review (2026-06-11, ledger 20260611064312/064340).
    // Bumped 63 -> 64 for batch_journal_review (20260611120000): the
    // DESIGN_SOUL §3 exceptions-pyramid batch confirm RPC pair
    // (batch_review_exceptions + review_journal_entries_batch, delegating
    // per-entry to 0034 review_journal_entry). APPLIED to prod via MCP after
    // owner review (2026-06-11, ledger 20260611064423).
    // Bumped 64 -> 65 for s5_agency_demand_visibility (20260611150000): the
    // S5 DRAFT (needs-human-gate, NOT applied) — two gated DEFINER RPCs
    // (curated open-demand read for agency owners + the append-only
    // "galim pasiūlyti" proposal marker); no RLS change, no new table.
    // Bumped 65 -> 66 for the confirmation-role CHECK (20260602130000):
    // additive confirmer_role pin, APPLIED to prod via MCP after owner review
    // (2026-06-11, ledger 20260611091834).
    // Bumped 66 -> 67 for the S6 worker-docs-consent DRAFT (20260611170000;
    // needs-human-gate, NOT applied): workers.docs_aggregate_consent
    // default-false column + the worker-owned audited switch RPC + the
    // consent-gated agency aggregates RPC (category counts only).
    // Bumped 67 -> 69 for company-role-simplicity-v1 (two additive GREEN
    // migrations: 20260612090000 company_type column + save_company_setup_v2
    // with validated country, fixing the raw organizations_country_fkey
    // smoke crash; 20260612091000 journal_entry_photos free-tier 1-photo
    // evidence with private bucket + register RPC).
    // Bumped 69 -> 70 for the RU locale (20260612130000
    // widen_original_language_ru — additive CHECK widening so the
    // journal/chat/skill write paths accept 'ru'; doctrine §2.4 amended
    // to 11 locales).
    // Bumped 70 -> 71 for the chat-visibility revocation migration
    // (20260612170000 conversation_participant_revocation) — RED tier,
    // APPLIED to prod via the owner channel and verified 2026-06-12
    // (revoked_at/revoked_by + SECURITY DEFINER recursion fix + revoke RPC +
    // grant hardening). Landed in the ledger sync-only.
    // Bumped 71 -> 72 for Phase A search_path hygiene (20260612180000
    // pin_function_search_path) — additive GREEN ALTER FUNCTION ... SET
    // search_path = public on 4 SECURITY INVOKER functions; no RLS/grant/
    // policy/data change.
    // Bumped 72 -> 73 for Phase B1 FK indexes (20260612190000
    // phase_b1_fk_indexes) — 15 additive GREEN CREATE INDEX on active-path
    // foreign keys (chat/journal/engagement/requests/matches/invitations);
    // no RLS/grant/policy/data change.
    // Bumped 73 -> 74 for Phase B2 FK indexes (20260612200000
    // phase_b2_fk_indexes) — 10 additive GREEN CREATE INDEX on taxonomy/
    // reference foreign keys (skills/professions/esco/document_types/
    // productivity_units/plans/countries); no RLS/grant/policy/data change.
    // Bumped 74 -> 75 for Phase B3 FK indexes (20260612210000
    // phase_b3_fk_indexes) — 24 additive GREEN CREATE INDEX on the remaining
    // person/actor + org/project foreign keys (closes Phase B, all tables
    // tiny); no RLS/grant/policy/data change.
    // Bumped 75 -> 76 for Full Cycle Sprint v1 scouting (20260612220000
    // demand_shortlist) — additive GREEN owner-scoped shortlist table (NEW
    // table + NEW owner-scoped policies; NO existing RLS changed); no prod
    // apply.
    // Bumped 76 -> 79 for the pre-payment readiness sprint PR2 — three additive
    // RED (needs-human-gate) migrations, NOT applied by the agent:
    //  - 20260613100000_worker_availability_preferences (8 nullable workers
    //    columns + owner-scoped save_worker_availability_prefs RPC);
    //  - 20260613100100_booking_requests (persists the booking-state machine:
    //    booking_requests + append-only events + propose/respond/withdraw RPCs;
    //    worker-only accept, overlap-conflict block, immutable readiness
    //    snapshot; contacts NOT stored);
    //  - 20260613100200_worker_document_verification (additive verification axis
    //    unverified/pending/verified/rejected — verified is admin-RPC-only +
    //    FI support). All additive + reversible (supabase/rollbacks/*).
    // Bumped 79 -> 80 for the Stripe test-mode sprint PR2 — one additive RED
    // migration 20260613200000_billing_test_mode_records: three test-mode
    // billing tables (billing_customers / billing_subscriptions /
    // payment_webhook_events) with owner/admin SELECT RLS, server-only writes
    // (service_role), idempotent webhook events, NO money amount stored. Legacy
    // `subscriptions` (0 rows) left untouched. Additive + reversible.
    // Bumped 80 -> 81 for the worker demand-visibility RPC
    // (20260614120000_worker_demand_visibility): one additive RED migration — a
    // read-only SECURITY DEFINER `list_open_demand_for_workers()` that lights up
    // the worker opportunities board with curated, non-personal open-demand rows
    // (worker-gated, status='submitted' only, structured columns + accommodation
    // enum whitelist; no profile_id / location / notes / free-text). Applied to
    // prod via Supabase MCP after a strict security review. Additive + reversible.
    // Bumped 81 -> 82 for company-demand-locations-red-draft-v1
    // (20260615120000_company_demand_locations): ONE additive RED-draft migration
    // — a NEW owner-scoped child table of customer_requests holding WHERE a
    // company actually needs workers (the first real market-map geo layer
    // candidate). Owner/admin SELECT RLS mirroring demand_shortlist, NO anon/
    // public read, grant to authenticated only, NO new SECURITY DEFINER function.
    // Coordinates are optional and the DB itself forbids random/unverified points
    // (CHECK: coords only when geocode_status verified/manual). Additive +
    // reversible (supabase/rollbacks/*). NOT applied — human-gated for owner.
    // Bumped 82 -> 83 for company-demand-locations-signal-only-write
    // (20260615210000): RED hardening — replaces the owner write POLICY so
    // direct authenticated PostgREST writes can only create SIGNAL-ONLY rows
    // (lat/lng null, geo_precision != coordinates, geocode_status pending|manual)
    // — closing the bypass where an owner could self-insert verified+coordinates.
    // verified+coords reserved for a future admin/geocoder RPC. Adds a partial
    // unique index to block exact-duplicate signals per demand (multi-site still
    // allowed). Reversible (rollbacks/*). NOT applied — human-gated for owner.
    // Bumped 83 -> 84 for market-map-data-model-v1
    // (20260617120000_market_map_data_model_v1): ONE additive RED-draft migration
    // — two NEW owner-scoped tables (preferred_locations with intent + visibility;
    // consented_login_location_signals, approximate + consent-gated, NO lat/lng/
    // address columns by design) plus additive columns on company_demand_locations
    // (need shape) and projects (granularity/visibility). Owner-scoped RLS, NO
    // anon/public, grant to authenticated only, NO new SECURITY DEFINER. Additive
    // + reversible (supabase/rollbacks/*). NOT applied — human-gated for owner
    // (docs/audits/market-map-data-model-v1-owner-signoff.md).
    // Bumped 84 -> 85 for profile-avatar-upload-v1 (20260623200000_profile_avatar):
    // ONE additive RED migration — profiles.avatar_url column + private
    // profile-avatars storage bucket + owner-scoped storage.objects policies
    // (owner folder only; NO public/admin read). Reversible
    // (supabase/rollbacks/20260623200000_profile_avatar.down.sql). NOT applied —
    // human-gated for owner.
    // Bumped 85 -> 86 for W8 service_offerings (20260627121713_service_offerings):
    // ONE additive RED migration — new owner-scoped public.service_offerings table
    // (provider-owned supply listings). RLS enabled, every policy owner-scoped
    // (provider_id = auth.uid()), grant to authenticated only, NO anon/public, NO
    // using(true), NO SECURITY DEFINER, NO payment columns. Reversible + guarded
    // (supabase/rollbacks/20260627121713_service_offerings.down.sql refuses to drop
    // a non-empty table). NOT applied — human-gated for owner.
    // Bumped 86 -> 87 for W6 human_in_loop_learning (20260627132759):
    // ONE additive RED migration — 3 new owner/org-scoped tables (learning_signals
    // append-only, learning_review_queue, learning_policy_settings default-OFF)
    // plus ONE SECURITY DEFINER RPC (apply_learning_auto_confirmation) that reuses
    // the existing confirmation spine under live manager authority. RLS owner/org-
    // scoped via owns_worker/manages_organization/is_admin, grant authenticated
    // only, NO anon/public, NO using(true), NO payment. Reversible + guarded
    // (supabase/rollbacks/20260627132759_human_in_loop_learning.down.sql). NOT
    // applied — human-gated for owner.
    // Bumped 87 -> 88 for W10 projects org backfill (20260627143433):
    // ONE owner-approved data backfill — reroutes 4 legacy draft projects to the
    // canonical organization via the legacy bridge, ambiguity-guarded (=1 org),
    // additive (sets a NULL column), non-destructive, reversible + scoped rollback
    // (supabase/rollbacks/20260627143433_w10_projects_org_backfill.down.sql).
    // APPLIED to prod via MCP on 2026-06-27 (idempotent re-run-safe).
    // Bumped 88 -> 89 for P0 marketplace service_offering_requests (20260627145318):
    // ONE additive RED migration — discovery RLS policy on service_offerings
    // (authenticated + active-only) + new 2-party service_offering_requests table
    // + THREE SECURITY DEFINER RPCs (request/respond/withdraw, each re-checking
    // live identity + scope). Grant SELECT only (RPC-only writes), no anon/public,
    // no using(true), no payment/rating. Reversible + guarded
    // (supabase/rollbacks/20260627145318_service_offering_requests.down.sql). NOT
    // applied — human-gated for owner.
    // Bumped 89 -> 90 for requester identity on the provider inbox
    // (20260627174500_requester_identity_for_provider): ONE additive RED migration
    // — a single SECURITY DEFINER *read* RPC requester_identities_for_provider that
    // returns ONLY the buyer display name (profiles.full_name) and ONLY for
    // requests where r.provider_id = auth.uid() (provider scope re-checked). No
    // table/column/policy/table-grant change, no email/phone/contact/location/
    // avatar/buyer_id exposure, execute revoked from public + granted to
    // authenticated only, no anon/public, no using(true). Reversible + guarded
    // (supabase/rollbacks/20260627174500_requester_identity_for_provider.down.sql).
    // NOT applied — human-gated for owner.
    // Bumped 90 -> 91 for "new since last seen" tracking (20260627181500_service_
    // requests_seen): ONE tiny additive RED migration — a dedicated one-row-per-user
    // service_offering_requests_seen table (user_id pk + seen_at) with own-row-only
    // RLS + SELECT grant (writes RPC-only) + ONE SECURITY DEFINER upsert RPC
    // mark_service_requests_seen() (auth.uid() scope, no-op when unauthenticated,
    // execute revoked from public + granted authenticated). No profile change, no
    // per-request rows, no event bus, no PII, no anon/public, no using(true).
    // Reversible + guarded
    // (supabase/rollbacks/20260627181500_service_requests_seen.down.sql). NOT
    // applied — human-gated for owner.
    // Bumped 91 -> 92 for the P0 admin self-promotion guard
    // (20260702130000_admin_grant_guard.sql): BEFORE triggers on
    // profiles.active_role / profile_roles.role raising 42501 when a
    // JWT-bearing non-admin sets the admin value (closes the self-promotion
    // hole; service-role grant script unaffected). Reversible
    // (supabase/rollbacks/20260702130000_admin_grant_guard.down.sql).
    // APPLIED to prod via MCP 2026-07-02 after owner approval.
    // Bumped 92 -> 93 for the worker personal-engagement provisioning
    // (20260702140000_worker_personal_engagement.sql): AFTER INSERT trigger
    // on workers + idempotent 0013-shape backfill so every worker gets a
    // personal 'employee' engagement and the journal opens on first session.
    // Reversible (supabase/rollbacks/20260702140000_*.down.sql).
    // Owner-approved apply 2026-07-02.
    // Bumped 93 -> 94 for the pilot_events anon INSERT grant
    // (20260702150000_pilot_events_anon_insert_grant.sql): ONE insert-only
    // grant to anon so pre-auth login_started events land; RLS (0020)
    // already caps anon rows to profile_id IS NULL, SELECT stays
    // admin-only. Reversible (supabase/rollbacks/20260702150000_*.down.sql).
    // Owner-approved apply 2026-07-02.
    // Bumped 94 -> 95 for approved-route MODEL A
    // (20260702170000_worker_demand_approved_route_model_a.sql): recreate
    // list_open_demand_for_workers() joining companies on
    // verification_status='verified' and projecting company_name +
    // route_status='approved_direct_partner' — verified-company demand
    // becomes worker-visible; unverified stays hidden. Reversible
    // (supabase/rollbacks/20260702170000_*.down.sql restores the exact
    // 20260614120000 definition). Owner-approved apply 2026-07-02.
    // Bumped 95 -> 96 for the service-role report read grant
    // (20260702200000_pilot_events_service_role_report_read.sql): SELECT on
    // pilot_events + column-scoped (id,active_role)/(profile_id,role) reads
    // for the local owner activation report; no anon/authenticated change.
    // Reversible (supabase/rollbacks/20260702200000_*.down.sql). Owner-gated.
    // Bumped 96 -> 97 for the universal profession/skill catalogue seed
    // (20260704120000_universal_profession_skill_catalogue.sql): strictly
    // additive INSERT … ON CONFLICT DO NOTHING of 37 non-construction skills,
    // 17 professions + profession_skills links, making every profession
    // family first-class (construction stays one family among many). No DDL,
    // no grants, no RLS change. Reversible
    // (supabase/rollbacks/20260704120000_*.down.sql, guarded deletes).
    // Owner-gated apply.
    // Bumped 97 -> 98 for the truth-audit legacy-professions repair
    // (20260704130000_seed_missing_legacy_professions.sql): builder /
    // rebar_worker / site_manager were never migration-seeded (locale-JSON
    // only; their 0011 links silently no-opped). INSERT-only, idempotent,
    // reversible (supabase/rollbacks/20260704130000_*.down.sql). Owner-gated.
    // Bumped 98 -> 99 for the wave-2 catalogue expansion
    // (20260704150000_universal_catalogue_expansion_wave2.sql): strictly
    // additive INSERT … ON CONFLICT DO NOTHING of 21 skills + 13 professions
    // + links filling the measured class-E labour-market gaps (audit
    // 2026-07-04 §4E). No DDL, no grants, no RLS change. Reversible
    // (supabase/rollbacks/20260704150000_*.down.sql, guarded deletes).
    // Owner-gated apply.
    // Bumped 99 -> 100 for the worker express-interest slice
    // (20260704230000_demand_interest_signals.sql): additive worker-owned
    // interest table mirroring demand_shortlist (RLS default-closed, grant to
    // authenticated only, @human-gate-approved needs-human-gate DRAFT).
    // Reversible (supabase/rollbacks/20260704230000_*.down.sql, 0-row
    // guarded). Owner-gated apply via Supabase MCP (APPLIED 2026-07-05).
    // Bumped 100 -> 101 for company interest acknowledgement (PR7,
    // 20260705120000_demand_interest_company_ack.sql): ONE gated SECURITY
    // DEFINER RPC (ownership-checked, reviewed/contacted only, withdrawn
    // immutable, status+updated_at only); execute revoked from public/anon,
    // granted to authenticated; @human-gate-approved needs-human-gate DRAFT;
    // rollback drops the function only.
    // Bumped 101 -> 102 for the worker demand location label (PR8,
    // 20260705130000_worker_demand_location_label.sql): recreate of the
    // gated worker-demand RPC adding ONE coarse city-granularity
    // location_label column (never address/locality/contacts); rollback
    // restores the exact Model-A definition. @human-gate-approved,
    // needs-human-gate DRAFT, owner-gated apply.
    // Bumped 102 -> 103 for the customer_requests status-transition guard
    // (20260705150000_customer_requests_status_transition_guard.sql): plain
    // INVOKER trigger closing the owner's direct-PATCH status latitude to
    // the app's closed whitelist (draft->submitted|closed,
    // submitted->closed, closed->submitted); admins + no-JWT bypass;
    // @human-gate-approved, needs-human-gate DRAFT, owner-gated apply;
    // rollback drops trigger + function.
    // Bumped 103 -> 104 for the §8.1 safe counterpart identity reader
    // (20260705170000_conversation_counterpart_identity.sql): ONE SECURITY
    // DEFINER read RPC returning ONLY the display name of the other
    // unrevoked participant of a 2-person direct conversation the caller
    // belongs to (kind='direct', caller participant re-checked at fire
    // time); execute revoked from public/anon, granted to authenticated;
    // @human-gate-approved, needs-human-gate DRAFT, owner-gated apply;
    // rollback drops the function only.
    // Bumped 104 -> 105 for the §8.5 transport demand enum
    // (20260705200000_worker_demand_transport.sql): recreate of the gated
    // worker-demand RPC adding ONE strict-whitelist transport column
    // (provided|compensated|not_provided|unknown from payload.transport —
    // the accommodation enum path cloned; no table/column change, no free
    // text); @human-gate-approved, needs-human-gate DRAFT, owner-gated
    // apply; rollback restores the prior definition (corrected 2026-07-05
    // to the true predecessor 20260705130000 location-label body — the
    // wagon-3 partial-rollback caveat, closed by the §8.6 PR).
    // Bumped 105 -> 106 for the §8.6 equipment/tools layer
    // (20260705210000_worker_demand_required_tools.sql): recreate of the
    // gated worker-demand RPC adding ONE strict-whitelist required_tools
    // text[] column (10 EXISTING canonical taxonomy skill slugs filtered
    // element-by-element from payload.required_tools — no new taxonomy, no
    // table/column change, no free text); @human-gate-approved,
    // needs-human-gate DRAFT, owner-gated apply; rollback restores the
    // prior repo-latest definition (20260705200000) verbatim.
    // Bumped 106 -> 107 for the §8.3 teams/brigades minimum
    // (20260705220000_team_brigade_org_spine.sql): additive widening of
    // organizations.organization_type ('team' joins the allowlist — the
    // 20260612090000 company_type precedent) + TWO brand-new gated RPCs
    // (create_team_v1, get_team_capability_summary_v1) on the existing org
    // spine; membership reuses the existing add_org_member engagement path;
    // NO existing RPC recreated (rollback restores the 0013 check verbatim
    // and drops only the new functions); @human-gate-approved,
    // needs-human-gate DRAFT, owner-gated apply.
    // Bumped 107 -> 108 for the §8.8 job/project handover passport shell
    // (20260705230000_project_handover_passport.sql): ONE new append-only
    // table (project_handover_entries — manager-only select via the EXISTING
    // can_manage_project helper, writes RPC-only, honest declaration-shaped
    // status enum, no defect/warranty fields) + ONE brand-new gated RPC
    // (add_project_handover_entry_v1) on the existing project spine; NO
    // existing RPC/table recreated (rollback drops only the new function and
    // the new table — feature rows live only there); @human-gate-approved,
    // needs-human-gate DRAFT, owner-gated apply.
    // Bumped 108 -> 109 for the §8.13 internal follow-up task queue
    // (20260705235000_follow_up_tasks.sql): ONE new table (follow_up_tasks —
    // admin-only select via is_admin, writes RPC-only, honest
    // pending/done/dismissed lifecycle, id-only subject pointers, NO
    // priority/urgency column, NO external transport of any kind) + TWO
    // brand-new gated RPCs (create_follow_up_task_v1,
    // set_follow_up_task_status_v1) surfacing an operator queue on the
    // EXISTING admin control room; NO existing RPC/table recreated (rollback
    // drops only the two new functions and the new table — feature rows live
    // only there); @human-gate-approved, needs-human-gate DRAFT, owner-gated
    // apply.
    // Bumped 109 -> 110 for the WAGON 8 project work gallery read scope
    // (20260705250000): two ADDITIVE SELECT policies only (journal photo
    // metadata + private storage objects) mirroring the journal_entries
    // manager boundary — no new table, no new bucket, no new RPC, nothing
    // widened beyond what a manager can already read about the parent
    // entry; owner-gated apply.
    const SPRINT_BASELINE = 110;
    expect(files.length).toBeLessThanOrEqual(SPRINT_BASELINE);
  });
});

// ── 23. Privacy guards for the text-first composer (PR #44) ─────────────
//
// The composer's narrative is supposed to live on the owner-only
// profiles.profile_text column, NOT on workers.bio / workers.headline (both
// readable by every employer via workers_select / is_employer(), 0001+0003).
// These guards fail loudly if a future patch silently moves the destination
// back into the employer-readable surface.

describe("text-first composer privacy", () => {
  it("server action writes to profiles.profile_text, not workers.bio/headline", () => {
    const src = readWeb("lib/worker/profile-text-actions.ts");
    // Must write profile_text on profiles
    expect(src).toMatch(/\.from\(["']profiles["']\)/);
    expect(src).toMatch(/profile_text/);
    // Must NOT update workers from this action — that would route the
    // narrative through workers.bio (employer-readable).
    expect(src).not.toMatch(/\.from\(["']workers["']\)/);
    expect(src).not.toMatch(/\bbio\s*[:,}]/);
    expect(src).not.toMatch(/\bheadline\s*[:,}]/);
  });

  it("sprint migration 0014 does not widen workers write surface", () => {
    const dir = resolve(REPO, "supabase", "migrations");
    const sprintFiles = readdirSync(dir).filter(
      (f) => f.startsWith("0014_") && f.endsWith(".sql"),
    );
    expect(sprintFiles.length).toBe(1);
    // Strip SQL line comments first — the migration's header deliberately
    // explains *why* the earlier draft was rewritten, and that prose
    // contains the exact phrase we're guarding against. The guard cares
    // about executable SQL only.
    const sqlOnly = readFileSync(join(dir, sprintFiles[0]), "utf8")
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n")
      .toLowerCase();
    // An earlier draft tried to `grant insert, update on public.workers to
    // authenticated` — disallowed: it would let any registered employer
    // bypass column-level intent. Storing the narrative on profiles
    // (owner-only RLS + grants from 0004) is the right home.
    expect(sqlOnly).not.toMatch(/grant[^;]*\b(insert|update)\b[^;]*\bpublic\.workers\b/);
  });
});
