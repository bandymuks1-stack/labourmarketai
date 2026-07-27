import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { jsonLdScript } from "@/lib/seo/json-ld";

/**
 * Safe JSON-LD serialization — security audit finding L-05.
 *
 * Two halves: the escaper actually closes the breakout, and no JSON-LD block
 * anywhere still uses raw `JSON.stringify` (the wiring, which is where the
 * finding actually lived).
 */

const WEB_ROOT = join(__dirname, "..", "..");

describe("jsonLdScript escaping (audit L-05)", () => {
  it("neutralises a </script> breakout in a string value", () => {
    const hostile = { name: 'Acme</script><script>alert(1)</script>' };
    const out = jsonLdScript(hostile);
    expect(
      out.includes("</script"),
      `output still contains a literal </script and would break out: ${out}`,
    ).toBe(false);
    expect(out).toContain("\\u003c");
  });

  it("proves plain JSON.stringify was genuinely unsafe here", () => {
    // The negative control for the fix itself: without escaping, the breakout
    // survives. If this ever stops being true the finding was misdiagnosed.
    const hostile = { name: "</script>" };
    expect(JSON.stringify(hostile)).toContain("</script>");
    expect(jsonLdScript(hostile)).not.toContain("</script>");
  });

  it("escapes every script-breaking character", () => {
    const out = jsonLdScript({ v: "<>/" });
    expect(out).toContain("\\u003c");
    expect(out).toContain("\\u003e");
    expect(out).toContain("\\u002f");
    expect(out).not.toMatch(/[<>]/);
  });

  it("escapes the legacy line-terminator vectors", () => {
    const out = jsonLdScript({ v: "a b c" });
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  /** The escaping must change the ENCODING only — never the parsed data. */
  it("round-trips to a byte-identical value", () => {
    const data = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      name: 'weird </script> "quoted" \\ backslash   terminator',
      nested: { list: [1, 2, "a/b"], flag: true, nil: null },
    };
    expect(JSON.parse(jsonLdScript(data))).toEqual(data);
  });

  it("still produces valid JSON for ordinary content", () => {
    const data = { "@type": "Organization", name: "LabourMarket.ai" };
    expect(JSON.parse(jsonLdScript(data))).toEqual(data);
  });
});

describe("no JSON-LD block uses raw JSON.stringify (audit L-05)", () => {
  function sourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const full = join(dir, name);
        const s = statSync(full);
        if (s.isDirectory()) {
          walk(full);
        } else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) {
          out.push(full);
        }
      }
    };
    walk(join(WEB_ROOT, "app"));
    walk(join(WEB_ROOT, "components"));
    return out;
  }

  const FILES = sourceFiles();

  it("scans a non-trivial number of files", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("every ld+json script serializes through jsonLdScript", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("application/ld+json")) continue;
      // Within a JSON-LD-bearing file, a raw JSON.stringify into __html is the
      // regression: it re-opens the breakout this finding was about.
      if (/__html:\s*JSON\.stringify\(/.test(src) || /JSON\.stringify\(\s*$/m.test(src)) {
        if (!src.includes("jsonLdScript")) {
          offenders.push(relative(WEB_ROOT, file).replace(/\\/g, "/"));
        }
      }
    }
    expect(
      offenders,
      "these files emit JSON-LD with unescaped JSON.stringify — use jsonLdScript " +
        `from @/lib/seo/json-ld instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the shared JsonLd component uses the escaper", () => {
    const src = readFileSync(join(WEB_ROOT, "components/marketing/answer-article.tsx"), "utf8");
    expect(src).toContain("jsonLdScript(data)");
    expect(src).not.toContain("JSON.stringify(data)");
  });
});
