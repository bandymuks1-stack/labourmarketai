import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";

/** AGENCY loop walk 2026-09-29: "Parodyk mano klientus." opened the INVITE form. */
describe("showing an agency's clients is a read", () => {
  it.each([
    ["Parodyk mano klientus.", "client-demand"],
    ["Kokie mano klientai?", "client-demand"],
    ["Show my clients", "client-demand"],
    ["Noriu pakviesti klientą", "invite-client"],
  ])("%s → %s", (s, intent) => {
    expect(classifyIntent(s).intent).toBe(intent);
  }, 20_000);
});
