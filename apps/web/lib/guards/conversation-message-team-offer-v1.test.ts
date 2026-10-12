import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Owner decision 3 (2026-10-12, refined): the B2B "which offer is this message
 * about" label lives on the MESSAGE (`conversation_messages.team_offer_id`),
 * the thread stays one per pair, and the DATABASE verifies the offer belongs
 * to the conversation. These guards pin the parts a later edit could widen.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8");
const MIGRATION = read("supabase/migrations/20261012180000_conversation_message_team_offer_v1.sql");
const ROLLBACK = read("supabase/rollbacks/20261012180000_conversation_message_team_offer_v1.down.sql");
// Statements only: the header comment may name what the migration does NOT do.
const lower = MIGRATION.replace(/--[^\n]*/g, "").toLowerCase();

describe("the migration is additive and history-preserving", () => {
  it("adds one nullable column that never deletes a message", () => {
    expect(lower).toContain("add column if not exists team_offer_id uuid");
    expect(lower).toContain("references public.team_demand_offers(id) on delete set null");
    const alter = lower.slice(lower.indexOf("alter table public.conversation_messages"));
    expect(alter.slice(0, alter.indexOf(";"))).not.toContain("not null");
  });

  it("does not touch the conversation source CHECK, policies or table grants", () => {
    expect(lower).not.toContain("conversations_source_type_check");
    expect(lower).not.toMatch(/create policy|alter policy|drop policy/);
    expect(lower).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
  });

  it("the rollback never leaves the column without its guard", () => {
    expect(ROLLBACK).toMatch(/rollback refused: % labelled messages exist/);
    // Everything is dropped together, inside the zero-label branch.
    const body = ROLLBACK.slice(ROLLBACK.indexOf("raise exception"));
    for (const stmt of ["drop trigger", "drop function if exists public.conversation_message_team_offer_guard_v1", "drop column if exists team_offer_id"]) {
      expect(body).toContain(stmt);
    }
  });
});

describe("the database guard decides, not the client", () => {
  it("fires on insert and on any change of the label", () => {
    expect(lower).toContain("before insert or update of team_offer_id on public.conversation_messages");
  });

  it("checks author = caller, author is a party, author in thread, other side in thread", () => {
    expect(MIGRATION).toContain("new.author_id is distinct from uid");
    expect(MIGRATION).toContain("public.team_offer_party_side_v1(new.team_offer_id)");
    expect(MIGRATION).toMatch(/cp\.profile_id = uid\s+and cp\.revoked_at is null/);
    expect(MIGRATION).toMatch(/cp\.profile_id <> uid[\s\S]*team_offer_side_of_profile_v1\(new\.team_offer_id, cp\.profile_id\) <> v_side/);
  });

  it("the helper is internal: no client role may execute it", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(lower).toContain(`revoke all on function public.team_offer_side_of_profile_v1(uuid, uuid) from ${role};`);
    }
    expect(lower).not.toMatch(/grant execute on function public\.team_offer_side_of_profile_v1/);
  });

  it("the helper mirrors the applied party rule's role lists exactly", () => {
    // manages_organization: engagement roles + membership roles; has_org_demand_access: membership roles.
    expect(MIGRATION).toContain("ec.relationship_slug in ('manager','owner','external_manager')");
    expect(MIGRATION.match(/m\.role in \('owner','admin','manager','external_manager'\)/g)?.length).toBe(2);
    expect(MIGRATION).toContain("g.owner_profile_id = p_profile");
  });
});

describe("the app sends the label only from a party-checked thread, and never loses a message", () => {
  const core = read("apps/web/lib/communication/communication-core.ts");
  const page = read("apps/web/app/[locale]/dashboard/communication/[conversationId]/page.tsx");

  it("only a well-formed id is sent, and a refused label resends unlabelled", () => {
    expect(core).toContain("TEAM_OFFER_UUID.test(input.teamOfferId)");
    expect(core).toContain("...(teamOfferId ? { team_offer_id: teamOfferId } : {})");
    expect(core).toMatch(/team_offer_label_refused/);
  });

  it("the composer gets the offer only when the party-gated context read answered", () => {
    expect(page).toContain("teamOfferId={offerContext ? (offerParam ?? null) : null}");
  });

  it("labels are shown through the party-gated read, never from the raw id alone", () => {
    expect(page).toContain("readTeamOfferMessageLabels(");
    expect(read("apps/web/lib/company/team-offer-thread-context.ts")).toContain('rpc("team_offer_thread_party_v1"');
  });
});
