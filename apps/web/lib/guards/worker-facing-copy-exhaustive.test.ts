import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Exhaustive worker-facing copy guard (fix/cv).
 *
 * Normal workers must see quiet CV/work-record + status language — never
 * proof / evidence / verification-process / provenance / confirmer / disclaimer
 * wording, and never raw source-taxonomy enums.
 *
 * Scope = the worker-facing message namespaces below, across ALL locales.
 * Explicitly OUT of scope (allowed to keep operational wording): the manager
 * review surface (`*.inbox.*`), manager/admin/company/agency namespaces, and
 * functional auth login/password keys (sign-in "Verifying…", "Confirm password")
 * which are NOT the skill-verification concept. Internal code enums live in
 * code/tests, never in message values, and are banned here as VALUES only.
 */

const messages = join(__dirname, "..", "..", "messages");

// Worker-facing top-level namespaces (the surfaces a normal worker sees).
const WORKER_NAMESPACES = [
  "journal", "profileHub", "workerEvidence", "cvExport", "structuring",
  "journalSkillLinks", "skills", "playerCard", "myWorkView", "worldMap",
  "profileCvClarity", "evidenceStatus", "workEntryReview", "todayScreen",
  "featureNotes", "evidenceReport", "capabilityProfile", "trust", "spaces",
];
// auth is huge; only the worker dashboard / onboarding subtrees are worker copy.
const AUTH_WORKER_SUBTREES = ["dashboard", "onboarding"];

// Forbidden worker-facing term families (values only).
const FORBIDDEN: RegExp[] = [
  // LT
  /įrodym/i, /\bpaties nurodyt/i, /savideklaruot/i, /vadovo patvirtin/i, /patvirtins vadovas/i, /patvirtino vadovas/i,
  // EN
  /\bevidence\b/i, /\bproofs?\b/i, /\bself-declared\b/i, /\bmanager-confirmed\b/i,
  /confirmed by (a |your |an |the )?(responsible )?(person|people|manager|owner)/i,
  /who can confirm/i, /confirmations can be checked/i, /checked on the platform/i, /\bprovenance\b/i,
  // RU
  /доказательств/i, /подтверд\w*\s+руководител/i, /руководител\w*\s+подтверд/i, /самостоятельно заявлен/i,
  // raw source-taxonomy enums (must never appear in a visible value)
  /recognized_from_text|manually_linked_to_entry|confirmed_by_person|stale_needs_review|profile_skill_available_to_link/,
];

// Auth login/password keys that legitimately use "verify/confirm" (NOT skills).
const AUTH_EXCLUDE = /callback|confirm_password|resetPassword|verifyEmail|verifying|emailVerif/i;

type Json = Record<string, unknown>;
const load = (rel: string): Json => JSON.parse(readFileSync(join(messages, rel), "utf8")) as Json;

function walkValues(obj: unknown, path: string, out: Array<{ path: string; value: string }>): void {
  if (typeof obj === "string") {
    out.push({ path, value: obj });
  } else if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      if (k === "inbox") continue; // manager review surface — out of scope
      walkValues(v, path ? `${path}.${k}` : k, out);
    }
  }
}

function workerValues(base: Json, nsFiles: Record<string, Json>): Array<{ path: string; value: string }> {
  const out: Array<{ path: string; value: string }> = [];
  for (const ns of WORKER_NAMESPACES) {
    if (base[ns]) walkValues(base[ns], ns, out);
    if (nsFiles[ns]) walkValues(nsFiles[ns], ns, out);
  }
  const auth = base.auth as Json | undefined;
  if (auth) {
    for (const sub of AUTH_WORKER_SUBTREES) {
      if (auth[sub]) walkValues(auth[sub], `auth.${sub}`, out);
    }
  }
  return out.filter((e) => !AUTH_EXCLUDE.test(e.path));
}

const LOCALES = readdirSync(messages).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));

describe("Guard: no worker-facing proof/evidence/verification/confirmer/enum wording (all locales)", () => {
  for (const loc of LOCALES) {
    it(`${loc}: worker-facing namespaces carry no forbidden term`, () => {
      const base = load(`${loc}.json`);
      const nsFiles: Record<string, Json> = {};
      for (const ns of WORKER_NAMESPACES) {
        try { nsFiles[ns] = load(`${loc}/${ns}.json`); } catch { /* no per-ns file */ }
      }
      const offenders = workerValues(base, nsFiles)
        .filter((e) => FORBIDDEN.some((rx) => rx.test(e.value)))
        .map((e) => `${e.path}: ${e.value.slice(0, 70)}`);
      expect(offenders, `${loc} worker-facing forbidden wording:\n  ${offenders.join("\n  ")}`).toEqual([]);
    });
  }
});

describe("Guard: detector is real", () => {
  it("flags evidence/proof/confirmer/enum, passes quiet CV wording", () => {
    const hit = (s: string) => FORBIDDEN.some((rx) => rx.test(s));
    expect(hit("Darbo įrodymai")).toBe(true);
    expect(hit("Confirmed by a manager")).toBe(true);
    expect(hit("recognized_from_text")).toBe(true);
    expect(hit("Mano CV")).toBe(false);
    expect(hit("Patvirtinta")).toBe(false);
    expect(hit("Laukia patvirtinimo")).toBe(false);
    expect(hit("Darbo įrašai")).toBe(false);
  });
});
