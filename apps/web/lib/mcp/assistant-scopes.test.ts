import { describe, expect, it } from "vitest";

import { exposedCapabilities } from "@/lib/capabilities/registry";

import { ASSISTANT_SCOPES, assistantToolNames, DEFAULT_ASSISTANT_SCOPES } from "./assistant-scopes";
import { toolDefsOf } from "./toolset";

/**
 * Register 10.4 — the curated assistant toolset is a real, bounded, honest
 * subset of what the door publishes.
 */
const published = new Map(toolDefsOf(exposedCapabilities()).map((d) => [d.name, d]));
const curated = [...assistantToolNames()];

describe("assistant scopes (10.4)", () => {
  it("every curated tool name is published by the door (a rename fails here)", () => {
    const missing = curated.filter((n) => !published.has(n));
    expect(missing).toEqual([]);
  });

  it("the default assistant toolset is 25–35 tools, each in exactly one scope", () => {
    const all = Object.values(ASSISTANT_SCOPES).flat();
    expect(new Set(all).size, "no tool sits in two scopes").toBe(all.length);
    expect(curated.length).toBeGreaterThanOrEqual(25);
    expect(curated.length).toBeLessThanOrEqual(35);
    expect(DEFAULT_ASSISTANT_SCOPES).toEqual(Object.keys(ASSISTANT_SCOPES));
  });

  it("nothing destructive is offered to an assistant", () => {
    const destructive = curated.filter((n) => published.get(n)?.annotations?.destructiveHint === true);
    expect(destructive).toEqual([]);
  });

  it("every consequential write is reachable only through draft → confirm", () => {
    // context_switch is the one named pointer write (the door's instructions
    // say so); every other non-read tool in the set is a _draft or _confirm.
    const writes = curated.filter((n) => published.get(n)?.annotations?.readOnlyHint === false);
    const loose = writes.filter((n) => n !== "context_switch" && !/_(draft|confirm)$/.test(n));
    expect(loose).toEqual([]);
    for (const n of writes.filter((w) => w.endsWith("_confirm"))) {
      const base = n.replace(/_confirm$/, "");
      const draft = curated.find((c) => c === `${base}_draft` || (c.startsWith(`${base}_`) && c.endsWith("_draft")));
      expect(draft, `${n} comes with its draft`).toBeTruthy();
    }
  });

  it("organisation, agency, evidence-import and marketplace tools stay out until X-2", () => {
    expect(curated.filter((n) => /^(company_|agency_|evidence_|marketplace_|people_ingest|roster_|organization_)/.test(n))).toEqual([]);
  });
});
