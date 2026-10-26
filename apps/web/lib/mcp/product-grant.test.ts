import { describe, expect, it, vi } from "vitest";

import {
  DOOR_GRANT_RPC,
  parseDoorProductGrant,
  productGrantForRequest,
  readDoorProductGrant,
} from "./product-grant";

/**
 * B3 — the door's read of the person's recorded choice. The one fail-open
 * state (`none`, legacy) must only ever come from the database positively
 * saying so; everything else unexpected is `unavailable` (refused).
 */

describe("parseDoorProductGrant", () => {
  it("reads the three database states", () => {
    expect(parseDoorProductGrant({ state: "none" })).toEqual({ state: "none" });
    expect(parseDoorProductGrant({ state: "revoked", scopes: [] })).toEqual({ state: "revoked" });
    expect(parseDoorProductGrant({ state: "granted", scopes: ["read:profile", "messages"] })).toEqual({
      state: "granted",
      scopes: ["read:profile", "messages"],
    });
    expect(parseDoorProductGrant({ state: "granted", scopes: [] })).toEqual({ state: "granted", scopes: [] });
  });

  it("drops a scope name this build does not know (narrowing only)", () => {
    expect(parseDoorProductGrant({ state: "granted", scopes: ["read:profile", "admin:all"] })).toEqual({
      state: "granted",
      scopes: ["read:profile"],
    });
  });

  it("anything unexpected is unavailable — never none", () => {
    for (const bad of [
      null,
      undefined,
      "none",
      [],
      [{ state: "none" }],
      {},
      { state: "NONE" },
      { state: "granted" },
      { state: "granted", scopes: "read:profile" },
      { state: "granted", scopes: [1] },
      { state: "legacy" },
    ]) {
      expect(parseDoorProductGrant(bad), JSON.stringify(bad)).toEqual({ state: "unavailable" });
    }
  });
});

describe("readDoorProductGrant", () => {
  it("calls the argument-less door function on the caller's own client", async () => {
    const rpc = vi.fn(async () => ({ data: { state: "granted", scopes: ["read:journal"] }, error: null }));
    expect(await readDoorProductGrant({ rpc })).toEqual({ state: "granted", scopes: ["read:journal"] });
    expect(rpc).toHaveBeenCalledWith(DOOR_GRANT_RPC);
    expect(rpc.mock.calls[0]).toHaveLength(1); // no arguments: client and person come from the JWT
  });

  it("an error, a missing function or a throw is unavailable", async () => {
    expect(await readDoorProductGrant({ rpc: async () => ({ data: null, error: { code: "PGRST202" } }) })).toEqual({
      state: "unavailable",
    });
    expect(await readDoorProductGrant({ rpc: async () => ({ data: { state: "none" }, error: { code: "42501" } }) })).toEqual({
      state: "unavailable",
    });
    expect(
      await readDoorProductGrant({
        rpc: async () => {
          throw new Error("network");
        },
      }),
    ).toEqual({ state: "unavailable" });
  });
});

describe("productGrantForRequest", () => {
  it("reads at most once per request and not at all until asked", async () => {
    const rpc = vi.fn(async () => ({ data: { state: "none" }, error: null }));
    const once = productGrantForRequest({ rpc });
    expect(rpc).not.toHaveBeenCalled();
    await once();
    await once();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("a new request reads again (a change applies to the next call)", async () => {
    let state = "granted";
    const rpc = vi.fn(async () => ({ data: { state, scopes: [] }, error: null }));
    expect(await productGrantForRequest({ rpc })()).toEqual({ state: "granted", scopes: [] });
    state = "revoked";
    expect(await productGrantForRequest({ rpc })()).toEqual({ state: "revoked" });
  });
});
