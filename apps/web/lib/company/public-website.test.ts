import { describe, expect, it } from "vitest";

import { publicWebsiteHref, websiteHasForbiddenScheme } from "./public-website";

describe("publicWebsiteHref", () => {
  it("keeps http(s) on a real host", () => {
    expect(publicWebsiteHref("https://example.com/about")).toBe("https://example.com/about");
    expect(publicWebsiteHref("http://example.com")).toBe("http://example.com/");
  });

  it("gives a bare host https, so it is not a relative link", () => {
    expect(publicWebsiteHref("example.com")).toBe("https://example.com/");
    expect(publicWebsiteHref(" www.example.co.uk/a ")).toBe("https://www.example.co.uk/a");
    expect(publicWebsiteHref("example.com:8080")).toBe("https://example.com:8080/");
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "javascript://example.com/%0aalert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:x",
    "mailto:a@example.com",
    "file:///etc/passwd",
    "//evil.example.com",
    "/relative",
    "https://user:pw@example.com",
    "https://localhost",
    "not a website",
    "",
    null,
    undefined,
  ])("refuses %s", (value) => {
    expect(publicWebsiteHref(value)).toBeNull();
  });
});

describe("websiteHasForbiddenScheme", () => {
  it.each(["javascript:alert(1)", "java\nscript:alert(1)", "data:text/html,x", "mailto:a@example.com"])(
    "flags %s",
    (value) => {
      expect(websiteHasForbiddenScheme(value)).toBe(true);
    },
  );

  it.each(["https://example.com", "HTTP://example.com", "example.com", "example.com:8080/x", "not a website", "", null])(
    "leaves %s to the existing checks",
    (value) => {
      expect(websiteHasForbiddenScheme(value)).toBe(false);
    },
  );
});
