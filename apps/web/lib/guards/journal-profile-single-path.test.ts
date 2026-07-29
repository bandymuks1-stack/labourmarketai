import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for the Journal/Profile single-path doctrine (P0 UX rescue).
 *
 * One clear path, no competing surfaces:
 *   - JOURNAL = canonical INPUT — the ONLY place work entries are created /
 *     edited (the composer) and where per-entry skill links live.
 *   - PROFILE = canonical OUTPUT — summarizes CV / skills / journal evidence
 *     ("Supported by work entries: N") and never hosts journal-management.
 *
 * It also pins the de-noised journal layout so the scattered, text-heavy cards
 * can't creep back: entries render first, and the removed project-context note
 * + self-progress counter stay removed.
 *
 * Runs in CI via `pnpm -F web test`. Pure source assertions; invents nothing.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

const JOURNAL_PAGE = "app/[locale]/dashboard/journal/page.tsx";
const PROFILE_PAGE = "app/[locale]/dashboard/profile/page.tsx";

describe("Guard: journal is the canonical entry INPUT", () => {
  const journal = read(JOURNAL_PAGE);

  it("the journal page renders the entry composer for EDIT mode only (owner audit §6.1)", () => {
    // Correcting an existing record stays on the projection (supersede path);
    // a NEW record starts in the conversation — no second intake form.
    expect(journal).toMatch(/editingEntry \? \(/);
    expect(journal).toMatch(/<JournalEntryComposer/);
  });

  it("has ONE clear primary action — log work in the conversation", () => {
    expect(journal).toMatch(/journal-log-via-chat-cta/);
    expect(journal).toMatch(/logViaChatCta/);
    // No duplicate create surface, no on-page create anchor CTA.
    expect(journal).not.toMatch(/href="#journal-composer"/);
  });

  it("composer renders first (order-1), compact history after (order-2) — Wagon 5", () => {
    // UX Recovery Train Wagon 5 supersedes the P0-rescue records-first order:
    // the day starts with ONE large input and ONE main action; the compact
    // collapsed history follows.
    expect(journal).toMatch(/id="journal-composer"\s+className="order-1"/);
    expect(journal).toMatch(/order-2[^"]*"\s*data-testid="journal-entries"/);
  });

  it("keeps newest-first ordering", () => {
    expect(journal).toMatch(/order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/);
  });

  it("per-entry skill links live inside the entry row only", () => {
    // The journal page wires skillLinks into JournalEntryRow; the link UI is
    // not a standalone page surface.
    expect(journal).toMatch(/skillLinks=\{/);
    const row = read("components/app/journal-entry-row.tsx");
    expect(row).toMatch(/JournalEntrySkillLinks/);
  });
});

describe("Guard: de-noised journal layout stays clean", () => {
  const journal = read(JOURNAL_PAGE);

  it("the removed project-context note does NOT come back", () => {
    expect(journal).not.toMatch(/journal-project-context/);
    expect(journal).not.toMatch(/projectContext\./);
  });

  it("the removed self-progress counter does NOT come back", () => {
    expect(journal).not.toMatch(/self_progress\./);
  });

  it("the kept pilot note is a compact footnote, not a warning card", () => {
    // Still rendered (journal-evidence-clarity requires it) but no longer a
    // prominent bg-state-warning card.
    expect(journal).toMatch(/t\("pilotBackboneNote"\)/);
    expect(journal).not.toMatch(/bg-state-warning\/5[^>]*>\s*\{?\s*t\("pilotBackboneNote"\)/);
  });
});

describe("Guard: profile is the canonical OUTPUT, not a journal manager", () => {
  const profile = read(PROFILE_PAGE);

  it("the profile page summarizes evidence via the hub overview", () => {
    expect(profile).toMatch(/<ProfileHubOverview/);
  });

  it("the hub's ONE primary action comes from the deterministic helper", () => {
    const hub = readFileSync(join(APP_ROOT, "components/app/profile-hub-overview.tsx"), "utf8");
    expect(hub).toMatch(/deriveProfileNextAction/);
    expect(hub).toMatch(/profile-hub-primary-action/);
    // The helper is pure (no AI/network/random). It lives in the canonical
    // next-action module (canonical-user-journey v1).
    const helper = readFileSync(join(APP_ROOT, "lib/dashboard/next-action.ts"), "utf8");
    expect(helper).not.toMatch(/fetch\(|createClient|Math\.random|Date\.now/);
  });

  it("the profile page does NOT host the journal entry composer", () => {
    expect(
      profile,
      "profile must not create/edit journal entries — that is the journal's job",
    ).not.toMatch(/JournalEntryComposer/);
  });

  it("ONE output hub — no competing summary/evidence/helper panels", () => {
    // The profile summarizes via the single ProfileHubOverview. The former
    // duplicate panels (clarity checklist, worker-evidence card, standalone
    // process assistant) were consolidated out so the profile doesn't re-split.
    expect(profile).not.toMatch(/<ProfileCvClarityCard\b/);
    expect(profile).not.toMatch(/<WorkerEvidenceCard\b/);
    expect(profile).not.toMatch(/<ProfileProcessAssistant\b/);
  });

  it("the profile evidence wording stays support-only (Supported by work entries)", () => {
    for (const loc of ["lt", "en"] as const) {
      const ns = JSON.parse(read(`messages/${loc}.json`)).profileHub as {
        evidence?: { supported?: string };
      };
      const supported = ns.evidence?.supported ?? "";
      const phrase = loc === "lt" ? /darbo įraš/i : /work entr/i;
      expect(phrase.test(supported), `${loc} profileHub.evidence.supported`).toBe(true);
      expect(/\bverified\b|\bconfirmed\b|patvirtint|patikrint/i.test(supported)).toBe(false);
    }
  });
});
