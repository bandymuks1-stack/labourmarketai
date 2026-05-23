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

// ── 5. Account page tags inactive roles as preparing ─────────────────────

describe("account page marks inactive roles honestly", () => {
  it("references the preview_workspace label and the rolesIntro paragraph", () => {
    const txt = readWeb("app/[locale]/dashboard/account/page.tsx");
    expect(txt).toMatch(/preview_workspace/);
    expect(txt).toMatch(/account\.rolesIntro/);
    const lt = readWeb("messages/lt.json");
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

describe("dashboard first-use panel", () => {
  it("worker dashboard mounts <DashboardFirstUsePanel>", () => {
    const txt = readWeb("app/[locale]/dashboard/page.tsx");
    expect(txt).toMatch(/<DashboardFirstUsePanel/);
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
    expect(lt.skills.textFirst.confirmedByYou).toBe("Patvirtinta jūsų");
    expect(en.skills.textFirst.confirmedByYou).toBe("Confirmed by you");
    expect(lt.skills.textFirst.needsExternalConfirmation).toMatch(/išorinio/i);
    expect(en.skills.textFirst.needsExternalConfirmation).toMatch(
      /external/i,
    );
    expect(lt.structuring.ruleBasedNotice).toMatch(/nepatvirtin/i);
    expect(en.structuring.ruleBasedNotice).toMatch(/confirm/i);
  });
  it("journal exposes a suggestionReviewIntro + saved-state strings", () => {
    const lt = JSON.parse(readWeb("messages/lt/journal.json"));
    const en = JSON.parse(readWeb("messages/en/journal.json"));
    expect(lt.suggestionReviewIntro).toMatch(/pasiūlym/i);
    expect(en.suggestionReviewIntro).toMatch(/suggestions/i);
    expect(lt.savedTitle).toBeTruthy();
    expect(en.savedTitle).toBeTruthy();
    expect(lt.savedBody).toMatch(/patvirtint/i);
    expect(en.savedBody).toMatch(/confirmed/i);
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
  it("feature-availability blocks matching / score / AI by config", () => {
    const txt = readWeb("lib/config/feature-availability.ts");
    expect(txt).toMatch(
      /id:\s*"matching\.engine",\s*availability:\s*"hidden"/,
    );
    expect(txt).toMatch(
      /id:\s*"score\.universal",\s*availability:\s*"hidden"/,
    );
    expect(txt).toMatch(
      /id:\s*"ai\.extraction",\s*availability:\s*"hidden"/,
    );
    expect(txt).toMatch(
      /id:\s*"ai\.verification",\s*availability:\s*"hidden"/,
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

// ── 16. This sprint adds no Supabase migration files ────────────────────

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
    // the merged state at sprint start (main @ 5d9ceeb).
    const SPRINT_BASELINE = 13;
    expect(files.length).toBeLessThanOrEqual(SPRINT_BASELINE);
  });
});
