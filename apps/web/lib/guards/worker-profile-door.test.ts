import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isSignOutTarget } from "@/components/app/intake-draft-sign-out-clear";
import {
  WORKER_PROFILE_DOOR_HREF,
  WORKER_PROFILE_DOOR_NEXT,
  isWorkerProfileDoorNext,
} from "@/lib/marketing/worker-profile-door";
import {
  DRAFT_MAX_AGE_HOURS,
  DRAFT_MAX_CHARS,
  INTAKE_DRAFT_KEY,
  LEGACY_INTAKE_DRAFT_KEY,
  bindWorkerIntakeDraft,
  clearWorkerIntakeDraft,
  intakeDraftText,
  readUnboundWorkerIntakeDraft,
  readWorkerIntakeDraftFor,
  writeWorkerIntakeDraft,
} from "@/lib/staffing/worker-intake-draft";

/**
 * WHAT A WORKER TYPES BEFORE SIGN-UP IS KEPT (owner P0 2026-11-15, F2, option b).
 *
 * The audit: "Susikurti profilį / CV" opened /worker-intake, titled
 * "Darbuotojo registracija", 15+ fields that store nothing, and a sign-up
 * link with no `next`, so everything typed was lost. Now the intake stays
 * the first step without an account, its sign-up returns to the profile
 * builder, and what was typed is placed in the builder's composer for the
 * person to read and send. Nothing is saved for them.
 *
 * Decision 0024 (Lane R, P2): it reaches THEIR profile only. Unbound it lives
 * in the tab (sessionStorage); sign-up / sign-in from the intake binds it to
 * that email for a few hours; any other account meets it removed, never
 * shown; sign-out and sending remove it.
 */

const web = process.cwd();
const read = (rel: string) => readFileSync(join(web, rel), "utf8");
const MARKETING = "app/[locale]/(marketing)";

describe("sign-up returns to the profile builder", () => {
  it("the path and the href", () => {
    expect(WORKER_PROFILE_DOOR_NEXT).toBe("/dashboard/profile");
    expect(WORKER_PROFILE_DOOR_HREF).toBe(`/auth/signup?next=${encodeURIComponent("/dashboard/profile")}`);
    expect(existsSync(join(web, "app/[locale]/dashboard/profile/page.tsx"))).toBe(true);
  });

  it("is the same path the free-CV page's CTAs carry", () => {
    const m = /const CREATE_CV_NEXT = "([^"]+)";/.exec(read(`${MARKETING}/create-cv/page.tsx`));
    expect(m?.[1]).toBe(WORKER_PROFILE_DOOR_NEXT);
  });
});

describe("/worker-intake is the first step, without an account", () => {
  const src = read(`${MARKETING}/worker-intake/page.tsx`);
  it("its sign-up and login both return to the profile builder", () => {
    expect(src).toMatch(/relPath=\{`\/\$\{locale\}\$\{WORKER_PROFILE_DOOR_HREF\}`\}/);
    expect(src).toMatch(/relPath=\{`\/\$\{locale\}\/auth\/login\?next=\$\{encodeURIComponent\(WORKER_PROFILE_DOOR_NEXT\)\}`\}/);
    expect(src).not.toMatch(/relPath=\{`\/\$\{locale\}\/auth\/(signup|login)`\}/);
  });

  it("the public buttons still open it: nobody is sent to sign-up before typing", () => {
    for (const page of ["work-opportunities", "skills", "professions"]) {
      expect(read(`${MARKETING}/${page}/page.tsx`), page).toMatch(/href="\/worker-intake"/);
    }
  });

  it("the form keeps what is typed, and the builder places it in its composer", () => {
    const form = read("components/app/worker-intake-form.tsx");
    expect(form).toMatch(/onInput=\{\(e\) => keepDraft\(e\.currentTarget\)\}/);
    expect(form).toMatch(/onChange=\{\(e\) => keepDraft\(e\.currentTarget\)\}/);
    const flow = read("components/app/profile-text-first-flow.tsx");
    expect(flow, "read only for the signed-in account's email").toContain("readWorkerIntakeDraftFor(viewerEmail)");
    expect(read("app/[locale]/dashboard/profile/page.tsx")).toContain("viewerEmail={user.email ?? null}");
    expect(flow, "cleared only when the person sends it").toMatch(/if \(raw\.trim\(\)\.length > 0\) clearWorkerIntakeDraft\(\);/);
    expect(flow, "never over the person's own saved text").toContain("if (initialText.trim().length > 0) return;");
    expect(flow, "shown, not left in the picker stage or a closed section").toContain('setStage("compose");');
    expect(flow).toContain('composeRef.current?.closest("details")?.setAttribute("open", "");');
  });

  it("sign-up and sign-in from the intake bind it to the email used; nothing else does", () => {
    const signup = read("components/app/signup-form.tsx");
    expect(signup).toContain("if (!invitation && nextParam && isWorkerProfileDoorNext(nextPath)) bindWorkerIntakeDraft(email);");
    expect(read("components/app/login-form.tsx")).toContain("if (nextParam && isWorkerProfileDoorNext(nextPath)) bindWorkerIntakeDraft(email);");
    expect(isWorkerProfileDoorNext("/lt/dashboard/profile")).toBe(true);
    expect(isWorkerProfileDoorNext("/en/dashboard/profile?x=1")).toBe(true);
    for (const other of ["/lt/dashboard", "/lt/dashboard/profile/cv", "/lt/dashboard/profiles", null, ""]) {
      expect(isWorkerProfileDoorNext(other), String(other)).toBe(false);
    }
  });

  it("every sign-out removes it: one listener in the locale layout; the sign-out route is untouched", () => {
    expect(read("app/[locale]/layout.tsx")).toContain("<IntakeDraftSignOutClear />");
    expect(isSignOutTarget("/lt/auth/logout")).toBe(true);
    expect(isSignOutTarget("https://labourmarket.ai/en/auth/logout")).toBe(true);
    expect(isSignOutTarget("/lt/auth/login")).toBe(false);
    expect(isSignOutTarget(null)).toBe(false);
    // Every sign-out entry point in the app targets that route.
    for (const f of ["components/app/account-menu.tsx", "app/[locale]/dashboard/account/page.tsx", "app/[locale]/invite/[token]/page.tsx"]) {
      expect(read(f), f).toContain("/auth/logout`");
    }
    expect(read("app/[locale]/auth/logout/route.ts")).not.toMatch(/IntakeDraft|workerIntake/);
  });

  it("its title does not call it a registration", () => {
    for (const loc of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const title = (JSON.parse(read(`messages/${loc}.json`)) as { workerIntake?: { title?: string } }).workerIntake?.title;
      if (title === undefined) continue;
      expect(title, loc).not.toMatch(/regist|регистр|rejestr|anmeld/i);
    }
  });
});

describe("the kept draft", () => {
  const session = new Map<string, string>();
  const local = new Map<string, string>();
  const fake = (m: Map<string, string>) => ({
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
  beforeEach(() => {
    session.clear();
    local.clear();
    (globalThis as { window?: unknown }).window = { sessionStorage: fake(session), localStorage: fake(local) };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });
  const H = 3_600_000;

  it("one 'label: value' line per filled field; empty ones left out", () => {
    expect(
      intakeDraftText([
        { label: "Name", value: " Rasa  P. " },
        { label: "Languages", value: "" },
        { label: "Comment", value: "Tiles, 6 years" },
      ]),
    ).toBe("Name: Rasa P.\nComment: Tiles, 6 years");
  });

  it("before sign-up it is in this tab only, never in shared storage", () => {
    writeWorkerIntakeDraft("Name: Rasa", 1_000);
    expect(readUnboundWorkerIntakeDraft(2_000)).toBe("Name: Rasa");
    expect(local.size).toBe(0);
    expect(readWorkerIntakeDraftFor("rasa@example.invalid", 2_000), "an unbound draft reaches no account").toBeNull();
  });

  it("bound at sign-up, it reaches that account (any letter case) and no other", () => {
    writeWorkerIntakeDraft("Name: Rasa", 0);
    bindWorkerIntakeDraft(" Rasa@Example.invalid ", 1_000);
    expect(session.has(INTAKE_DRAFT_KEY), "moved out of the tab").toBe(false);
    expect(readWorkerIntakeDraftFor("rasa@example.invalid", 2_000)).toBe("Name: Rasa");
    expect(readWorkerIntakeDraftFor("someone-else@example.invalid", 3_000), "a different account never receives it").toBeNull();
    expect(local.has(INTAKE_DRAFT_KEY), "and it is removed once met").toBe(false);
    expect(readWorkerIntakeDraftFor("rasa@example.invalid", 4_000)).toBeNull();
  });

  it("no account at all, or no draft in this tab, claims nothing", () => {
    writeWorkerIntakeDraft("Name: Rasa", 0);
    bindWorkerIntakeDraft("rasa@example.invalid", 1_000);
    expect(readWorkerIntakeDraftFor(null, 2_000)).toBeNull();
    bindWorkerIntakeDraft("other@example.invalid", 3_000);
    expect(local.size, "an ordinary sign-in with nothing typed in this tab binds nothing").toBe(0);
  });

  it("bounded: a few hours, length capped, empty text not kept, v1 drafts removed", () => {
    expect(DRAFT_MAX_AGE_HOURS).toBeLessThanOrEqual(12);
    writeWorkerIntakeDraft("x".repeat(DRAFT_MAX_CHARS + 50), 0);
    bindWorkerIntakeDraft("a@example.invalid", 0);
    expect(readWorkerIntakeDraftFor("a@example.invalid", DRAFT_MAX_AGE_HOURS * H + 1), "too old").toBeNull();
    writeWorkerIntakeDraft("x".repeat(DRAFT_MAX_CHARS + 50), 0);
    bindWorkerIntakeDraft("a@example.invalid", 0);
    expect(readWorkerIntakeDraftFor("a@example.invalid", 1)?.length).toBe(DRAFT_MAX_CHARS);
    writeWorkerIntakeDraft("   ", 0);
    expect(session.has(INTAKE_DRAFT_KEY)).toBe(false);
    local.set(LEGACY_INTAKE_DRAFT_KEY, JSON.stringify({ v: 1, at: 0, text: "old unbound" }));
    readWorkerIntakeDraftFor("a@example.invalid", 1);
    expect(local.has(LEGACY_INTAKE_DRAFT_KEY)).toBe(false);
  });

  it("sending or signing out removes every copy", () => {
    writeWorkerIntakeDraft("Name: Rasa", 0);
    local.set(INTAKE_DRAFT_KEY, "{}");
    local.set(LEGACY_INTAKE_DRAFT_KEY, "{}");
    clearWorkerIntakeDraft();
    expect(session.size + local.size).toBe(0);
  });

  it("a broken or refused store keeps nothing and throws nothing", () => {
    local.set(INTAKE_DRAFT_KEY, "{not json");
    expect(readWorkerIntakeDraftFor("a@example.invalid")).toBeNull();
    (globalThis as { window?: unknown }).window = {
      get sessionStorage(): Storage {
        throw new Error("denied");
      },
      get localStorage(): Storage {
        throw new Error("denied");
      },
    };
    expect(() => writeWorkerIntakeDraft("Name: Rasa")).not.toThrow();
    expect(() => bindWorkerIntakeDraft("a@example.invalid")).not.toThrow();
    expect(readWorkerIntakeDraftFor("a@example.invalid")).toBeNull();
    expect(() => clearWorkerIntakeDraft()).not.toThrow();
  });
});
