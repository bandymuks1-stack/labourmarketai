/**
 * Guard: what a visitor types on the public worker intake survives sign-up
 * and sign-in (owner decision 2026-11-15, "after registration ALL data the
 * visitor typed must survive").
 *
 * Measured before this guard: the intake bridge linked to a bare
 * `/auth/signup` and `/auth/login` — no return address, no typed values — so
 * the name, the trade and the comment were gone the moment the person
 * registered. The carry (lib/onboarding/worker-intake-carry.ts) reuses the
 * `?next=` return path for WHERE they go and saves what they typed into the
 * homes a worker already has: the onboarding name and profession, and the
 * owner-only `profiles.profile_text`. This file pins every hop of that path.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getSafeReturnPath, isSafeReturnPath } from "@/lib/auth/redirect";
import {
  WORKER_INTAKE_ABOUT_MAX_CHARS,
  WORKER_INTAKE_CARRY_TTL_MS,
  WORKER_INTAKE_COMMENT_MAX_CHARS,
  WORKER_INTAKE_RETURN_PATH,
  buildWorkerIntakeCarry,
  parseWorkerIntakeCarry,
  workerIntakeDoorHref,
  workerIntakeSaid,
} from "@/lib/onboarding/worker-intake-carry";

const web = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8").replace(/\r/g, "");

const NOW = 1_800_000_000_000;

describe("worker-intake carry — the pure model", () => {
  it("keeps the name, the trade, the comment and every other field, labelled", () => {
    const carry = buildWorkerIntakeCarry({
      fullName: "  Jonas Jonaitis ",
      professionSlug: "electrician",
      professionLabel: "Electrician",
      comment: "Ten years of wiring.",
      lines: [
        { label: "Languages", value: "English, Lithuanian" },
        { label: "Target countries", value: "" },
        { label: "Available from", value: "2027-03-01" },
      ],
      now: NOW,
    });
    expect(carry.fullName).toBe("Jonas Jonaitis");
    expect(carry.professionSlug).toBe("electrician");
    expect(carry.comment).toBe("Ten years of wiring.");
    expect(carry.about).toBe(
      "Ten years of wiring.\n\nLanguages: English, Lithuanian\nAvailable from: 2027-03-01",
    );
    expect(parseWorkerIntakeCarry(JSON.stringify(carry), NOW + 1000)).toEqual(carry);
  });

  it("the longest comment plus every field at its form maximum fits the profile text uncut", () => {
    const comment = "ž".repeat(WORKER_INTAKE_COMMENT_MAX_CHARS);
    const field = (label: string, max: number) => ({ label, value: "x".repeat(max) });
    const carry = buildWorkerIntakeCarry({
      fullName: "A",
      professionSlug: "",
      professionLabel: "",
      comment,
      lines: [
        field("Target countries (comma-separated)", 120),
        field("Available from", 10),
        field("Accommodation", 60),
        field("Transport", 60),
        field("Engagement type", 60),
        field("Languages", 120),
        field("Business name", 200),
        field("VAT number", 40),
        field("Team size", 3),
        field("Insurance", 200),
        field("Team professions", 300),
        field("Tools", 300),
        field("Ready to invoice", 10),
      ],
      now: NOW,
    });
    expect(carry.comment).toBe(comment);
    expect(carry.about.length).toBeLessThanOrEqual(WORKER_INTAKE_ABOUT_MAX_CHARS);
    expect(carry.about.endsWith("x".repeat(10))).toBe(true);
  });

  it("refuses malformed, foreign, empty and expired values", () => {
    const ok = buildWorkerIntakeCarry({
      fullName: "A",
      professionSlug: "welder",
      professionLabel: "Welder",
      comment: "",
      lines: [],
      now: NOW,
    });
    expect(parseWorkerIntakeCarry(null, NOW)).toBeNull();
    expect(parseWorkerIntakeCarry("{not json", NOW)).toBeNull();
    expect(parseWorkerIntakeCarry(JSON.stringify({ ...ok, v: 2 }), NOW)).toBeNull();
    expect(parseWorkerIntakeCarry(JSON.stringify(ok), NOW + WORKER_INTAKE_CARRY_TTL_MS + 1)).toBeNull();
    expect(
      parseWorkerIntakeCarry(JSON.stringify({ ...ok, fullName: "", professionSlug: "", about: "" }), NOW),
    ).toBeNull();
    expect(parseWorkerIntakeCarry(JSON.stringify({ ...ok, professionSlug: "<x>" }), NOW)?.professionSlug).toBe("");
  });

  it("shows back a capped comment, like the landing sentence", () => {
    const carry = buildWorkerIntakeCarry({
      fullName: "",
      professionSlug: "",
      professionLabel: "",
      comment: "a".repeat(500),
      lines: [],
      now: NOW,
    });
    expect(workerIntakeSaid(carry).length).toBeLessThanOrEqual(200);
  });
});

describe("worker-intake carry — the doors use the ONE return-path mechanism", () => {
  it("both doors carry `?next=` to the worker profile, and the sanitiser keeps it", () => {
    for (const door of ["signup", "login"] as const) {
      const href = workerIntakeDoorHref("en", door);
      expect(href.startsWith(`/en/auth/${door}?next=`)).toBe(true);
      const next = new URL(href, "http://x.invalid").searchParams.get("next");
      expect(next).toBe(WORKER_INTAKE_RETURN_PATH);
      expect(isSafeReturnPath(next)).toBe(true);
      expect(getSafeReturnPath(next, "en")).toBe(`/en${WORKER_INTAKE_RETURN_PATH}`);
    }
  });

  it("the intake page's bridge uses those doors — never a bare auth link", () => {
    const page = read("app/[locale]/(marketing)/worker-intake/page.tsx");
    expect(page).toMatch(/relPath=\{workerIntakeDoorHref\(locale, "signup"\)\}/);
    expect(page).toMatch(/relPath=\{workerIntakeDoorHref\(locale, "login"\)\}/);
    expect(page).not.toMatch(/relPath=\{`\/\$\{locale\}\/auth\/(signup|login)`\}/);
  });
});

describe("worker-intake carry — every hop from the first input to the saved profile", () => {
  it("the form records what is typed, with the comment capped to what the profile text holds", () => {
    const form = read("components/app/worker-intake-form.tsx");
    expect(form).toMatch(/onChange=\{\(e: FormEvent<HTMLFormElement>\) => carryFromForm\(/);
    expect(form).toContain("writeWorkerIntakeCarry(");
    expect(form).toContain("maxLength={WORKER_INTAKE_COMMENT_MAX_CHARS}");
    // A choice the person did not change is not written down for them.
    expect(form).toContain("!chosen.defaultSelected");
  });

  it("onboarding fills the name and trade from it and sends its text as the profile text", () => {
    const wizard = read("components/app/onboarding-wizard.tsx");
    expect(wizard).toContain("readWorkerIntakeCarry()");
    expect(wizard).toMatch(/setDisplayName\(\(prev\) => \(prev\.trim\(\) \? prev : carry\.fullName\)\)/);
    expect(wizard).toContain('form.set("profile_text", carried.about)');
    expect(wizard).toContain("clearWorkerIntakeCarry()");
  });

  it("completeOnboarding saves that text into the owner-only profile text, never over existing words", () => {
    const actions = read("lib/auth/actions.ts");
    const body = actions.slice(actions.indexOf("export async function completeOnboarding"));
    expect(body).toContain('formData.get("profile_text")');
    expect(body).toMatch(/\.update\(\{ profile_text: profileText \}\)[\s\S]{0,80}\.eq\("id", user\.id\)[\s\S]{0,80}profile_text\.is\.null/);
    // Never the employer-readable worker columns.
    expect(body).not.toMatch(/bio:\s*profileText|headline:\s*profileText/);
  });

  it("an already-onboarded person signing in finds the text in their profile composer, to save themselves", () => {
    const flow = read("components/app/profile-text-first-flow.tsx");
    expect(flow).toContain("readWorkerIntakeCarry()");
    expect(flow).toContain("clearWorkerIntakeCarry()");
  });

  it("no second store: the carry lives in the browser, not in a new table", () => {
    const carry = read("lib/onboarding/worker-intake-carry.ts");
    expect(carry).not.toMatch(/supabase|\.from\(|fetch\(/);
  });
});
