import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { activeLocales } from "@/lib/i18n/config";
import { ENTRY_ACTIONS } from "@/lib/market-lifecycle/contract";

/**
 * ONE lifecycle contract for every need, offer and listing (owner
 * architecture decision 2026-10-24) — the guard that keeps it ONE.
 *
 *   UI      every own-entry surface renders the shared chip, visibility line
 *           and actions (components/app/market-entry-lifecycle.tsx), never
 *           its own status buttons;
 *   SERVER  every status door re-checks the contract before writing, so the
 *           UI, the MCP tools and any other caller obey the same transitions;
 *   SEARCH  the SQL discovery predicates are the contract's visibility rule
 *           (active, not expired, the domain gate);
 *   DATA    hiding is never deletion: a discarded draft is recorded as such
 *           and can never be reopened into the market; permanent deletion
 *           stays a separate, strong-tier confirmed act;
 *   WORDS   one `marketLifecycle` namespace in every active locale.
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const resolve = (msgs: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>(
    (n, k) => (n && typeof n === "object" ? (n as Record<string, unknown>)[k] : undefined),
    msgs,
  );

describe("UI: every own-entry surface uses the ONE shared lifecycle face", () => {
  it("listings render the shared chip, visibility line and actions — no own status buttons", () => {
    const src = read("components/app/marketplace-listings-section.tsx");
    for (const c of ["<MarketEntryChip", "<MarketEntryVisibility", "<MarketEntryActions"]) expect(src, c).toContain(c);
    expect(src).toMatch(/applyMarketplaceListingAction\(row\.id, action, row\.status\)/);
    expect(src).not.toMatch(/changeStatus\(row\.id, "(paused|closed|draft)"\)/);
    expect(src).not.toMatch(/role="alertdialog"/);
  });

  it("services render the shared face and move through applyServiceOfferingAction", () => {
    const src = read("components/app/service-offerings-section.tsx");
    for (const c of ["<MarketEntryChip", "<MarketEntryVisibility", "<MarketEntryActions"]) expect(src, c).toContain(c);
    expect(src).toMatch(/applyServiceOfferingAction\(row\.id, action\)/);
    expect(src).not.toMatch(/toggleStatus/);
  });

  it("the own-needs list carries the contract's actions on the row itself", () => {
    const src = read("components/app/demand-requests-readback.tsx");
    expect(src).toContain("<DemandEntryLifecycle");
    expect(src).toContain("<MarketEntryChip");
    const row = read("components/app/demand-entry-lifecycle.tsx");
    expect(row).toContain("<MarketEntryActions");
    expect(row).toMatch(/applyDemandAction\(locale, requestId, action, status\)/);
  });

  it("the scouting controls decide close / reopen by the contract, not by raw status", () => {
    const src = read("components/app/demand-lifecycle-controls.tsx");
    expect(src).toMatch(/allowed\.includes\("complete"\)/);
    expect(src).toMatch(/allowed\.includes\("resume"\)/);
    expect(src).not.toMatch(/currentStatus === "submitted"/);
  });

  it("the shared face renders exactly the contract's allowed actions, and deletion only behind the strong tier", () => {
    const src = read("components/app/market-entry-lifecycle.tsx");
    expect(src).toMatch(/allowedActions\(support, facts\)\.filter\(\(a\) => !hide\?\.includes\(a\)\)/);
    expect(src).toMatch(/tier="strong_irreversible"/);
    expect(src).toMatch(/visibilityReason\(facts, visibility\)/);
  });

  it("a row only claims workers can see a need when the company is verified", () => {
    const page = read("app/[locale]/dashboard/company/needs/page.tsx");
    // Display only: the page passes the status; it never compares it to
    // "verified" itself (first-work-request-clarity forbids a gate there).
    expect(page).toMatch(/companyVerificationStatus=\{companyRow\.verificationStatus\}/);
    const readback = read("components/app/demand-requests-readback.tsx");
    expect(readback).toMatch(/const workersSeeNeeds = companyVerificationStatus === "verified";/);
    expect(readback).toMatch(/companyVerificationStatus = null/);
  });

  it("a colleague's draft offers no edit / discard to the viewer (creator-only acts)", () => {
    expect(read("lib/buyer/customer-requests.ts")).toMatch(/ownedByCaller: r\.profile_id === user\.id/);
    expect(read("components/app/demand-entry-lifecycle.tsx")).toMatch(
      /status === "draft" && !ownedByCaller \? \["publish", "edit", "withdraw"\] : \["publish"\]/,
    );
  });
});

describe("SERVER: every status door re-checks the contract (UI, MCP, any caller)", () => {
  it("services: the status door translates through actionForStatus; the action door through transition", () => {
    const src = read("lib/services/service-offerings.ts");
    expect(src).toMatch(/actionForStatus\(adapter, adapter\.facts\(current\), status, closedOutcome\)/);
    expect(src).toMatch(/transition\(adapter\.support, adapter\.facts\(current\), action\)/);
  });

  it("listings: the status door refuses what no contract action produces", () => {
    const src = read("lib/marketplace/listings.ts");
    // The facts include the stored closed outcome, so a discarded draft has
    // no `resume` here either.
    expect(src).toMatch(/adapter\.facts\(\{ status: String\(row\.status\), closedOutcome: row\.closed_outcome \?\? null \}\)/);
    expect(src).toMatch(/if \(!actionForStatus\(adapter, facts, status, outcomeForClose\)\)/);
  });

  it("demand: reopen refuses a discarded draft by the contract", () => {
    const src = read("lib/demand/demand-lifecycle.ts");
    expect(src).toMatch(/transition\(adapter\.support, adapter\.facts\(\{ status: req\.status, closedOutcome: req\.closed_outcome \}\), "resume"\)/);
  });

  it("MCP status tools call those same doors", () => {
    const domain = read("lib/capabilities/domain-action-capabilities.ts");
    expect(domain).toMatch(/\.setServiceOfferingStatus\(offeringId, status\)/);
    expect(domain).toMatch(/\.setMarketplaceListingStatusAction\(listingId, status/);
    const employer = read("lib/capabilities/employer-operations-capabilities.ts");
    expect(employer).toMatch(/closeDemand\(requestId, lifecycleCaller\)/);
    expect(employer).toMatch(/reopenDemand\(requestId, lifecycleCaller\)/);
  });
});

describe("DATA: hiding is never deletion", () => {
  it("a draft leaving the form is recorded as discarded (both draft doors)", () => {
    expect(read("lib/demand/demand-drafts.ts")).toMatch(/closed_outcome: "discarded"/);
    expect(read("lib/demand/demand-lifecycle.ts")).toMatch(/patch\.closed_outcome = "discarded"/);
  });

  it("the migration is a strict superset: nullable outcome, closed added, no data change", () => {
    const sql = readFileSync(
      join(REPO, "supabase", "migrations", "20261024090000_market_lifecycle_closed_outcome_v1.sql"),
      "utf8",
    );
    expect(sql).toMatch(/check \(status in \('draft', 'active', 'paused', 'closed'\)\)/);
    expect(sql).toMatch(/closed_outcome in \('completed', 'withdrawn', 'discarded'\)/);
    const ddl = sql.replace(/--.*$/gm, "");
    expect(ddl).not.toMatch(/\b(update|delete from|drop table|drop column|grant|revoke|security definer|create policy)\b/i);
  });
});

describe("RED half (20261024100000, human-gated): listing outcome + discarded-draft guard", () => {
  const sql = () =>
    readFileSync(
      join(REPO, "supabase", "migrations", "20261024100000_market_lifecycle_listing_outcome_and_discard_guard_v1.sql"),
      "utf8",
    );

  it("v3 keeps every v2 check (one publish policy) and refuses to publish a discarded draft", () => {
    expect(sql()).toMatch(/perform public\.set_marketplace_listing_status_v2\(p_id, p_status\);/);
    expect(sql()).toMatch(/a discarded draft cannot be published/);
    expect(sql()).toMatch(/grant\s+execute on function public\.set_marketplace_listing_status_v3\(uuid, text, text\) to authenticated;/);
    expect(sql()).toMatch(/revoke execute on function public\.set_marketplace_listing_status_v3\(uuid, text, text\) from anon;/);
  });

  it("the demand trigger adds exactly the discarded refusal and keeps every owner transition", () => {
    const s = sql();
    expect(s).toMatch(/old\.closed_outcome = 'discarded'/);
    expect(s).toMatch(/\(old\.status = 'draft' and new\.status in \('submitted', 'closed'\)\)/);
    expect(s).toMatch(/\(old\.status = 'closed' and new\.status = 'submitted'\)/);
    expect(s).toMatch(/set search_path = public/);
  });

  it("the listing status door tries v3 and falls back to v2 while v3 is absent", () => {
    const src = read("lib/marketplace/listings.ts");
    const v3 = src.indexOf('rpc("set_marketplace_listing_status_v3"');
    const v2 = src.indexOf('rpc("set_marketplace_listing_status_v2"');
    expect(v3).toBeGreaterThan(0);
    expect(v2).toBeGreaterThan(v3);
  });
});

describe("SEARCH: the discovery SQL is the contract's visibility rule", () => {
  it("listings and services are discoverable only while active (and, for listings, unexpired)", () => {
    const dir = join(REPO, "supabase", "migrations");
    const index = readFileSync(join(dir, "20261003150300_marketplace_index_v1.sql"), "utf8");
    expect(index).toMatch(/status = 'active' and \(expires_at is null or expires_at > now\(\)\)/);
    const serviceReaders = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    expect(serviceReaders).toMatch(/s\.status = 'active'/);
  });
});

describe("WORDS: one namespace, every active locale, shipped to the client", () => {
  it("marketLifecycle is a client message root", () => {
    expect(read("lib/i18n/client-messages.ts")).toMatch(/"marketLifecycle",/);
  });

  for (const loc of activeLocales) {
    it(`${loc}: every action, state and visibility reason resolves`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`));
      const keys = [
        ...ENTRY_ACTIONS.map((a) => `marketLifecycle.actions.${a}`),
        "marketLifecycle.actions.publishAgain",
        "marketLifecycle.actions.discard",
        ...["draft", "active", "paused", "completed", "withdrawn", "discarded", "closed", "locked"].map(
          (s) => `marketLifecycle.states.${s}`,
        ),
        ...["visible", "draft", "paused", "completed", "withdrawn", "discarded", "closed", "expired", "gated", "locked"].map(
          (r) => `marketLifecycle.visibility.${r}`,
        ),
        "marketLifecycle.deleteForever",
        "marketLifecycle.deleteQuestion",
        "marketLifecycle.deleteYes",
        "marketLifecycle.cancel",
        "marketLifecycle.error",
      ];
      for (const key of keys) {
        const v = resolve(msgs, key);
        expect(typeof v === "string" && v.trim().length > 0, `${loc}: ${key}`).toBe(true);
      }
    });
  }
});
