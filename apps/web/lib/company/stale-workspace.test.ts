import { beforeEach, describe, expect, it, vi } from "vitest";

const getWorkspaceContext = vi.fn();
vi.mock("@/lib/company/active-organization", () => ({
  getWorkspaceContext: () => getWorkspaceContext(),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "lt" }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { displayedWorkspaceOf, refuseStaleWorkspace } from "./stale-workspace";
import { DISPLAYED_WORKSPACE_FIELD, STALE_CONTEXT_NOTICE } from "./organization-switch";

const ORG_A = "0b1c2d3e-0000-4000-8000-00000000000a";
const ORG_B = "0b1c2d3e-0000-4000-8000-00000000000b";

describe("refuseStaleWorkspace — the screen's workspace against the ONE resolver", () => {
  beforeEach(() => {
    getWorkspaceContext.mockReset();
    getWorkspaceContext.mockResolvedValue({ activeWorkspaceId: ORG_B, workspaces: [] });
  });

  it("a screen that displayed another workspace is refused to the home with the stale notice", async () => {
    await expect(refuseStaleWorkspace(ORG_A)).rejects.toThrow(
      `NEXT_REDIRECT:/lt/dashboard?notice=${STALE_CONTEXT_NOTICE}`,
    );
    expect(getWorkspaceContext).toHaveBeenCalledTimes(1);
  });

  it("the workspace the screen displayed is the active one → the write proceeds", async () => {
    await expect(refuseStaleWorkspace(ORG_B)).resolves.toBeUndefined();
  });

  it("the personal workspace is compared like any other id", async () => {
    getWorkspaceContext.mockResolvedValue({ activeWorkspaceId: "personal", workspaces: [] });
    await expect(refuseStaleWorkspace("personal")).resolves.toBeUndefined();
    await expect(refuseStaleWorkspace(ORG_A)).rejects.toThrow("NEXT_REDIRECT");
  });

  it("no binding (older client, a chat executor the dispatcher already checked) → nothing is read or refused", async () => {
    for (const absent of [undefined, null, "", 42, { id: ORG_A }, "x".repeat(65)]) {
      await expect(refuseStaleWorkspace(absent)).resolves.toBeUndefined();
    }
    expect(getWorkspaceContext).not.toHaveBeenCalled();
  });
});

describe("displayedWorkspaceOf — the form's copy of the displayed workspace", () => {
  it("reads the one field name the dispatcher also uses", () => {
    expect(DISPLAYED_WORKSPACE_FIELD).toBe("expectedWorkspaceId");
    const fd = new FormData();
    fd.set(DISPLAYED_WORKSPACE_FIELD, ORG_A);
    expect(displayedWorkspaceOf(fd)).toBe(ORG_A);
  });

  it("absent or empty → null (no binding)", () => {
    expect(displayedWorkspaceOf(new FormData())).toBeNull();
    const fd = new FormData();
    fd.set(DISPLAYED_WORKSPACE_FIELD, "");
    expect(displayedWorkspaceOf(fd)).toBeNull();
  });
});
