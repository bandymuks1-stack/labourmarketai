import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { HTML_LIMITED_BOTS } from "./html-limited-bots";

describe("crawlers read metadata in the head", () => {
  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0)",
    "Mozilla/5.0 AppleWebKit/537.36; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
    "Mozilla/5.0 AppleWebKit/537.36; compatible; PerplexityBot/1.0",
    "Mozilla/5.0 AppleWebKit/537.36; compatible; Claude-SearchBot/1.0",
    "AdsBot-Google",
  ])("%s", (ua) => {
    expect(HTML_LIMITED_BOTS.test(ua)).toBe(true);
  });

  it("people keep the streamed page", () => {
    expect(
      HTML_LIMITED_BOTS.test(
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
      ),
    ).toBe(false);
  });

  it("the Next config uses this list", () => {
    expect(nextConfig.htmlLimitedBots).toBe(HTML_LIMITED_BOTS);
  });
});
