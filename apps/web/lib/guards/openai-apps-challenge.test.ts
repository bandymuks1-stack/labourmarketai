import { afterEach, describe, expect, it } from "vitest";

import { GET, openAiChallengeToken } from "@/app/.well-known/openai-apps-challenge/route";

/**
 * ChatGPT directory domain verification: the route serves the owner's token as
 * plain text at the domain root, 404s until it is set, and never echoes a
 * value that is not token-shaped.
 */
describe("/.well-known/openai-apps-challenge", () => {
  const saved = process.env.OPENAI_APPS_CHALLENGE_TOKEN;
  afterEach(() => {
    if (saved === undefined) delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;
    else process.env.OPENAI_APPS_CHALLENGE_TOKEN = saved;
  });

  it("404 while the owner has not set the token", async () => {
    delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;
    expect((await GET()).status).toBe(404);
  });

  it("serves the token verbatim as text/plain", async () => {
    process.env.OPENAI_APPS_CHALLENGE_TOKEN = "  abcDEF123-_.token  ";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe("abcDEF123-_.token");
  });

  it("refuses anything that is not token-shaped (no markup, no spaces, bounded)", () => {
    expect(openAiChallengeToken("<script>alert(1)</script>")).toBeNull();
    expect(openAiChallengeToken("two words")).toBeNull();
    expect(openAiChallengeToken("short")).toBeNull();
    expect(openAiChallengeToken("x".repeat(257))).toBeNull();
  });
});
