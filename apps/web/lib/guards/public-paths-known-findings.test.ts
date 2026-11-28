/**
 * Guard: the public-paths e2e (tests/e2e/public-paths-isolated.spec.ts, Lane L)
 * keeps its known-findings list honest. Every entry names a case that exists
 * and says what it observed and who owns it; the case list covers every
 * navigation link and stays at the 34 public paths (33 until 2026-11-25, when
 * the contractors goal gained the public personal-service search).
 */
import { describe, expect, it } from "vitest";

import { PUBLIC_INTENTS } from "@/lib/navigation/public-intents";

import {
  KNOWN_PUBLIC_PATH_FINDINGS,
  PUBLIC_PATH_CASE_IDS,
} from "../../tests/e2e/public-paths-cases";

describe("public paths: the known-findings list", () => {
  it("case ids are unique and there are 34", () => {
    expect(new Set(PUBLIC_PATH_CASE_IDS).size).toBe(PUBLIC_PATH_CASE_IDS.length);
    expect(PUBLIC_PATH_CASE_IDS.length).toBe(34);
  });

  it("every navigation panel link has a case", () => {
    for (const intent of PUBLIC_INTENTS) {
      for (const link of intent.links) {
        expect(PUBLIC_PATH_CASE_IDS, `${intent.id}.${link.id}`).toContain(`link:${intent.id}.${link.id}`);
      }
    }
  });

  it("every known finding names an existing case, a reason and an owner", () => {
    const seen = new Set<string>();
    for (const f of KNOWN_PUBLIC_PATH_FINDINGS) {
      expect(PUBLIC_PATH_CASE_IDS, f.id).toContain(f.id);
      expect(f.reason.trim().length, `${f.id}: reason`).toBeGreaterThan(0);
      expect(f.owner.trim().length, `${f.id}: owner`).toBeGreaterThan(0);
      expect(seen.has(f.id), `${f.id}: listed once`).toBe(false);
      seen.add(f.id);
    }
  });
});
