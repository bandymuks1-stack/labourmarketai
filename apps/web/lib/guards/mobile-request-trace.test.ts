import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  readRequestTrace,
  resetRequestTrace,
  tracePhase,
  traceStart,
  traceTestId,
} from "../../../mobile/src/request-trace";

/**
 * The mobile request trace (apps/mobile/src/request-trace.ts) puts the phase of
 * a capability call into a test id so a CI journey against production can say
 * where a call stalled — in a PUBLIC repository, so the id may carry state
 * words and a capability name, never data.
 */
const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("mobile request trace", () => {
  beforeEach(() => resetRequestTrace());

  it("walks started → sent → answered → ok for one call", () => {
    const seq = traceStart("journal.create_draft");
    const id = () => traceTestId(snapshotOf(), "journal.create_draft");
    expect(id()).toBe("net-journal_create_draft-started");
    tracePhase("journal.create_draft", seq, "sent");
    expect(id()).toBe("net-journal_create_draft-sent");
    tracePhase("journal.create_draft", seq, "answered");
    tracePhase("journal.create_draft", seq, "ok");
    expect(id()).toBe("net-journal_create_draft-ok");
  });

  it("names a capability that was never called 'none'", () => {
    expect(traceTestId(snapshotOf(), "journal.list")).toBe("net-journal_list-none");
  });

  it("ignores a late phase from a superseded call", () => {
    const first = traceStart("journal.list");
    const second = traceStart("journal.list");
    tracePhase("journal.list", second, "sent");
    tracePhase("journal.list", first, "unreachable");
    expect(traceTestId(snapshotOf(), "journal.list")).toBe("net-journal_list-sent");
  });

  it("keeps only letters and underscores in a phase word", () => {
    const seq = traceStart("journal.list");
    tracePhase("journal.list", seq, "x@y.z/123 secret-token");
    expect(traceTestId(snapshotOf(), "journal.list")).toMatch(/^net-journal_list-[A-Za-z_]+$/);
  });

  it("domain.ts traces every capability call and hands the traced fetch to the transport", () => {
    const domain = read("apps/mobile/src/domain.ts");
    expect(domain).toMatch(/traceStart\(name\)/);
    expect(domain).toMatch(/fetch: tracedFetch/);
    expect(domain).toMatch(/result\.ok \? "ok" : result\.failure\.kind/);
  });
});

const snapshotOf = readRequestTrace;
