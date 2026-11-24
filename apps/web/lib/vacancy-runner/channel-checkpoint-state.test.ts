import { describe, expect, it } from "vitest";

import { channelCheckpointState } from "./vacancy-ingestion";

/**
 * The checkpoint state is the ONLY after-the-fact truth the store can attest
 * (there is no sessions table), so its three values must be derived exactly:
 * a never-run channel must not read as "ok", and a channel whose latest runs
 * fail must not read as "ok" merely because an older success exists.
 */
describe("channelCheckpointState", () => {
  it("reports no_run_yet only when the channel has never run", () => {
    expect(
      channelCheckpointState({ lastRunAt: null, consecutiveFailures: 0 }),
    ).toBe("no_run_yet");
  });

  it("a run that wrote nothing is still a run — not no_run_yet", () => {
    expect(
      channelCheckpointState({
        lastRunAt: "2026-08-09T20:06:16.997Z",
        consecutiveFailures: 0,
      }),
    ).toBe("ok");
  });

  it("reports failing while consecutive failures are non-zero, even with a past success", () => {
    expect(
      channelCheckpointState({
        lastRunAt: "2026-08-10T16:11:58.897Z",
        consecutiveFailures: 1,
      }),
    ).toBe("failing");
  });
});
