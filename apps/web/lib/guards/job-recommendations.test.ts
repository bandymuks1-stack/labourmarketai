import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";
import {
  SPINE_SIGNALS,
  buildSpineNotifications,
  type SpineCounts,
} from "@/lib/notifications/spine-signals";
import {
  getDashboardModule,
  moduleAttentionSignalsAreValid,
} from "@/lib/dashboard/dashboard-module-registry";

/**
 * Job Recommendation Engine surfacing guard (Sprint v2 §4).
 *
 * Extends the §19 guard family (fit-not-rating.test.ts): every surfaced fit
 * must carry the canonical basis form — the matched/total counts WITH the
 * confirmed-vs-declared share — and the aggregate "new matching jobs"
 * notification must stay ONE count-gated row (never per-job spam, never a
 * context-free percentage). Also pins the seen-model wiring (rendering IS
 * the read event) and the owner-gated migration's shape.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

const resolveKey = (msgs: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>(
    (node, k) =>
      node && typeof node === "object"
        ? (node as Record<string, unknown>)[k]
        : undefined,
    msgs,
  );

const ZERO: SpineCounts = {
  unreadConversations: 0,
  pendingIncomingServiceRequests: 0,
  serviceRequestResponsesNew: 0,
  pendingIncomingBookings: 0,
  bookingResponsesNew: 0,
  pendingInvitations: 0,
  openTaskAttention: 0,
  newJobMatches: 0,
};

const CARD = read("components/app/dashboard/job-recommendations-card.tsx");
const JOURNAL_BLOCK = read("components/app/journal-job-context.tsx");

describe("§19 form — recommendation copy always carries counts + confirmed share", () => {
  for (const loc of activeLocales) {
    it(`${loc}: basis copy has {matched}+{total}+{confirmed}; notification has no bare %`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;

      // Compact basis (dashboard card + journal block) — the §19 canonical
      // form: count share AND confirmed share, inseparable.
      const compact = resolveKey(
        msgs,
        "opportunities.recommendations.basisCompact",
      );
      expect(typeof compact).toBe("string");
      for (const part of ["{matched}", "{total}", "{confirmed}"]) {
        expect(compact, `${loc}: basisCompact must carry ${part}`).toContain(
          part,
        );
      }

      // Board basis stays aligned (same three components — one canonical form
      // across the card and the 978-line board).
      const boardBasis = resolveKey(msgs, "opportunities.skillMatch.basis");
      expect(typeof boardBasis).toBe("string");
      for (const part of ["{matched}", "{total}", "{confirmed}"]) {
        expect(boardBasis, `${loc}: skillMatch.basis must carry ${part}`).toContain(
          part,
        );
      }

      // The aggregate notification is a count-gated label — it must never
      // smuggle a context-free percentage (§19: no % without its basis).
      const notif = resolveKey(
        msgs,
        "auth.notifications.types.new_job_matches",
      );
      expect(typeof notif === "string" && notif.trim().length > 0).toBe(true);
      expect(notif as string).not.toMatch(/%/);

      // Activity-centre read semantics + card copy exist in every locale.
      for (const key of [
        "activityCentre.readSemantics.new_job_matches",
        "auth.dashboard.jobsCard.title",
        "auth.dashboard.jobsCard.viewAll",
        "auth.dashboard.jobsCard.empty",
        "auth.dashboard.jobsCard.emptyCta",
        "opportunities.recommendations.newBadge",
        "opportunities.recommendations.salaryWithin",
        "opportunities.recommendations.salaryNegotiable",
        "opportunities.recommendations.journalTitle",
        "opportunities.recommendations.journalLine",
      ]) {
        const v = resolveKey(msgs, key);
        expect(
          typeof v === "string" && (v as string).trim().length > 0,
          `${loc}: missing ${key}`,
        ).toBe(true);
      }

      // Honesty (§7): journal support is evidence-support, never
      // verification — the connection line must not claim "confirmed".
      const journalLine = resolveKey(
        msgs,
        "opportunities.recommendations.journalLine",
      ) as string;
      expect(journalLine.toLowerCase()).not.toMatch(
        /patvirtino|confirmed the skill|bevestigde|bestätigte|подтвердила/,
      );
    });
  }

  it("the card renders the basis through basisCompact with all three params", () => {
    expect(CARD).toMatch(/basisCompact/);
    expect(CARD).toMatch(/matched: r\.basis\.matchedTotal/);
    expect(CARD).toMatch(/total: r\.basis\.needTotal/);
    expect(CARD).toMatch(/confirmed: r\.basis\.matchedConfirmed/);
    // Never a standalone percentage on the card.
    expect(CARD).not.toMatch(/basis\.pct/);
  });

  it("the journal block renders the same basis form", () => {
    expect(JOURNAL_BLOCK).toMatch(/basisCompact/);
    expect(JOURNAL_BLOCK).toMatch(/matched: rec\.basis\.matchedTotal/);
    expect(JOURNAL_BLOCK).toMatch(/total: rec\.basis\.needTotal/);
    expect(JOURNAL_BLOCK).toMatch(/confirmed: rec\.basis\.matchedConfirmed/);
    expect(JOURNAL_BLOCK).not.toMatch(/basis\.pct/);
  });
});

describe("aggregate anti-spam notification (one signal, never per-job rows)", () => {
  it("exactly ONE job-match signal exists in the catalogue", () => {
    const jobSignals = SPINE_SIGNALS.filter((s) =>
      s.id.includes("job"),
    );
    expect(jobSignals.map((s) => s.id)).toEqual(["new-job-matches"]);
    expect(jobSignals[0].type).toBe("new_job_matches");
    expect(jobSignals[0].href).toBe("/dashboard/opportunities");
    // No featureKey: opportunities is not a primary-nav tab — the badge
    // stays card-level (module registry), never a nav badge.
    expect(jobSignals[0].featureKey).toBeUndefined();
  });

  it("zero unseen matches → no row; N unseen → ONE aggregate row with count N", () => {
    expect(buildSpineNotifications(ZERO, "worker")).toEqual([]);
    const rows = buildSpineNotifications(
      { ...ZERO, newJobMatches: 3 },
      "worker",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "new-job-matches",
      type: "new_job_matches",
      count: 3,
      href: "/dashboard/opportunities",
    });
  });

  it("the opportunities module card carries the SAME spine count (registry-driven badge)", () => {
    const m = getDashboardModule("opportunities");
    expect(m.attentionSignalIds).toEqual(["new-job-matches"]);
    expect(moduleAttentionSignalsAreValid(m)).toBe(true);
  });

  it("the spine count loads from the ONE recommendation read model", () => {
    const spine = read("lib/notifications/spine.ts");
    expect(spine).toMatch(
      /import \{ getNewJobMatchCount \} from "@\/lib\/opportunities\/recommendations"/,
    );
    expect(spine).toMatch(/getNewJobMatchCount\(\)/);
  });

  it("the read model reuses the canonical pipeline — no second engine", () => {
    const model = read("lib/opportunities/recommendations.ts");
    expect(model).toMatch(/loadWorkerOpportunities/);
    const pure = read("lib/opportunities/recommendations-model.ts");
    expect(pure).toMatch(/from "@\/lib\/market\/match-v1"/);
    expect(pure).toMatch(/compareMatches/);
    // The pure model never CALLS the engine (comment mentions allowed —
    // strip them first, same convention as the module-registry guard).
    const pureCode = pure
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(pureCode).not.toMatch(/matchWorkerToNeed/);
  });
});

describe("seen model — rendering a recommendation IS the read event", () => {
  it("the opportunities board marks every rendered row seen on visit", () => {
    const page = read("app/[locale]/dashboard/opportunities/page.tsx");
    expect(page).toMatch(/<MarkOpportunitiesSeen/);
  });

  it("the dashboard card and the journal block mark their shown rows seen", () => {
    expect(CARD).toMatch(/<MarkOpportunitiesSeen/);
    expect(JOURNAL_BLOCK).toMatch(/<MarkOpportunitiesSeen/);
  });

  it("MarkOpportunitiesSeen actually calls the seen action → gated RPC", () => {
    const cmp = read("components/app/mark-opportunities-seen.tsx");
    expect(cmp).toMatch(
      /import \{ markOpportunitiesSeenAction \} from "@\/lib\/opportunities\/seen-actions"/,
    );
    expect(cmp).toMatch(/markOpportunitiesSeenAction\(/);
    const lib = read("lib/opportunities/seen.ts");
    expect(lib).toMatch(/mark_worker_opportunities_seen_v1/);
    expect(lib).toMatch(/worker_opportunity_seen/);
  });

  it("the dashboard overview mounts the card (worker daily surface)", () => {
    const overview = read("app/[locale]/dashboard/page.tsx");
    expect(overview).toMatch(/<JobRecommendationsCard/);
  });

  it("the journal page mounts the context block at ONE insertion point", () => {
    const journal = read("app/[locale]/dashboard/journal/page.tsx");
    const mounts = journal.match(/<JournalJobContext/g) ?? [];
    expect(mounts).toHaveLength(1);
  });
});

describe("owner-gated seen migration is shaped right (not applied from repo)", () => {
  const MIG_REL = join(
    REPO,
    "supabase",
    "migrations",
    "20260714170000_worker_opportunity_seen_v1.sql",
  );
  const DOWN_REL = join(
    REPO,
    "supabase",
    "rollbacks",
    "20260714170000_worker_opportunity_seen_v1.down.sql",
  );

  it("migration + paired rollback files exist", () => {
    expect(existsSync(MIG_REL)).toBe(true);
    expect(existsSync(DOWN_REL)).toBe(true);
  });

  it("migration is draft-gated, owner-only RLS, RPC-only writes", () => {
    const sql = readFileSync(MIG_REL, "utf8");
    expect(sql).toMatch(/DO NOT APPLY automatically/);
    expect(sql).toMatch(/primary key \(profile_id, customer_request_id\)/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/profile_id = auth\.uid\(\) or public\.is_admin\(\)/);
    // Exactly ONE policy — SELECT only (writes stay RPC-only).
    const policies = sql.match(/create policy/g) ?? [];
    expect(policies).toHaveLength(1);
    expect(sql).toMatch(/for select/);
    expect(sql).toMatch(
      /revoke insert, update, delete on public\.worker_opportunity_seen from authenticated/,
    );
    expect(sql).toMatch(/mark_worker_opportunities_seen_v1/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public/);
    // -- DOWN reference so the rollback pairing is explicit in-file.
    expect(sql).toMatch(/-- DOWN/);
  });

  it("APPLIED_LEDGER carries the deferred entry", () => {
    const ledger = readFileSync(join(REPO, "docs", "APPLIED_LEDGER.md"), "utf8");
    expect(ledger).toContain("20260714170000_worker_opportunity_seen_v1.sql");
  });
});

describe("no worker-initiated apply/contact CTA (platform workflow only)", () => {
  // Strip comments first — the honest doc comment NAMES the banned pattern
  // ("deliberately NO apply/contact CTA") without being one (same convention
  // as fit-not-rating.test.ts).
  const stripComments = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("the card and journal block never offer contact/apply", () => {
    for (const src of [CARD, JOURNAL_BLOCK].map(stripComments)) {
      expect(src).not.toMatch(/contact-employer/i);
      expect(src).not.toMatch(/\bapply\b/i);
      expect(src).not.toMatch(/WorkerInterestButton/);
    }
  });
});
