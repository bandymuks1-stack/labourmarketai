import { describe, expect, it } from "vitest";

import { actor, seedFixtureDb } from "./__fixtures__/historical-timesheet-v3/script";
import { S4_AGENT_ROW } from "./__fixtures__/historical-timesheet-v3/sources";
import { commitImport, createImportSession, submitRows } from "./import-core";

/**
 * AN ASSISTANT'S ACTION IS NEVER RECORDED AS THE PERSON'S OWN (owner
 * continuation 2026-09-29 §10: "Agent actions must not masquerade as human
 * confirmations"). Audit of the existing agent path: an MCP-created evidence
 * import tagged `actor_kind='agent'` only on the session and its `created`
 * event; `rows_submitted`, `previewed` and the `committed` event defaulted to
 * `human`. The performer now travels with the caller (`actorKind`), so every
 * step an assistant drives is `agent`, and the web UI (no actorKind) stays
 * `human`. Authority is unchanged: the same human identity, the same RLS.
 */
describe("evidence import records who performed each step", () => {
  it("an assistant-driven import is `agent` on the session and EVERY event, including the commit", async () => {
    const db = seedFixtureDb();
    const assistant = { ...db.as(actor("O_OSCAR")), actorKind: "agent" as const };
    const session = await createImportSession(assistant, {
      sourceKind: "agent",
      supplierRole: "employer",
      sourceLanguage: "en",
      sourceFingerprint: "e".repeat(64),
    });
    expect(session.kind).toBe("ok");
    if (session.kind !== "ok") return;
    expect(await submitRows(assistant, session.session.id, [S4_AGENT_ROW], { startIndex: 0 })).toMatchObject({ kind: "ok" });
    expect(await commitImport(assistant, session.session.id)).toMatchObject({ kind: "ok" });

    const row = db.tables.sessions.find((s) => s.id === session.session.id);
    expect(row?.actor_kind).toBe("agent");
    const events = db.tables.importEvents.filter((e) => e.session_id === session.session.id);
    expect(events.map((e) => e.event_type)).toContain("committed");
    expect(events.every((e) => e.actor_kind === "agent")).toBe(true);
  });

  it("NEGATIVE: the person's own import in the product stays `human`", async () => {
    const db = seedFixtureDb();
    const person = db.as(actor("O_OSCAR"));
    const session = await createImportSession(person, {
      sourceKind: "csv",
      supplierRole: "employer",
      sourceLanguage: "en",
      sourceFingerprint: "f".repeat(64),
    });
    if (session.kind !== "ok") throw new Error("session");
    await submitRows(person, session.session.id, [S4_AGENT_ROW], { startIndex: 0 });
    await commitImport(person, session.session.id);
    const events = db.tables.importEvents.filter((e) => e.session_id === session.session.id);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.actor_kind === "human")).toBe(true);
  });
});
