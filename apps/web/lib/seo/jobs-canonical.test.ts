import { describe, expect, it } from "vitest";
import { jobsCanonicalPath } from "./jobs-canonical";
import { buildPageMetadataFor } from "./metadata";

describe("jobsCanonicalPath", () => {
  it("page 1 and no page are the board", () => {
    expect(jobsCanonicalPath({})).toBe("/jobs");
    expect(jobsCanonicalPath({ page: "1" })).toBe("/jobs");
  });

  it("page 2+ of the unfiltered board is its own canonical", () => {
    expect(jobsCanonicalPath({ page: "2" })).toBe("/jobs?page=2");
    expect(jobsCanonicalPath({ page: "57" })).toBe("/jobs?page=57");
  });

  it("filtered and saved views canonicalize to the board", () => {
    expect(jobsCanonicalPath({ page: "2", q: "welder" })).toBe("/jobs");
    expect(jobsCanonicalPath({ page: "3", profession: "cook" })).toBe("/jobs");
    expect(jobsCanonicalPath({ page: "2", saved: "1" })).toBe("/jobs");
  });

  it("malformed page values fall back to the board", () => {
    for (const page of ["0", "-2", "2abc", "1.5", "", "x"]) {
      expect(jobsCanonicalPath({ page })).toBe("/jobs");
    }
  });

  it("the metadata canonical and hreflang carry the page", () => {
    const m = buildPageMetadataFor("jobs", "en", jobsCanonicalPath({ page: "2" }));
    expect(m.alternates?.canonical).toBe("https://labourmarket.ai/en/jobs?page=2");
    const langs = m.alternates?.languages as Record<string, string>;
    expect(langs.lt).toBe("https://labourmarket.ai/lt/jobs?page=2");
    expect(langs["x-default"]).toBe("https://labourmarket.ai/en/jobs?page=2");
  });
});
