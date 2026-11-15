import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WORKER_PROFILE_DOOR_HREF, WORKER_PROFILE_DOOR_NEXT } from "@/lib/marketing/worker-profile-door";
import {
  DRAFT_MAX_AGE_DAYS,
  DRAFT_MAX_CHARS,
  INTAKE_DRAFT_KEY,
  clearWorkerIntakeDraft,
  intakeDraftText,
  readWorkerIntakeDraft,
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
    expect(flow).toContain("readWorkerIntakeDraft()");
    expect(flow, "cleared only when the person sends it").toMatch(/if \(raw\.trim\(\)\.length > 0\) clearWorkerIntakeDraft\(\);/);
    expect(flow, "never over the person's own saved text").toContain("if (initialText.trim().length > 0) return;");
    expect(flow, "shown, not left in the picker stage or a closed section").toContain('setStage("compose");');
    expect(flow).toContain('composeRef.current?.closest("details")?.setAttribute("open", "");');
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
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("one 'label: value' line per filled field; empty ones left out", () => {
    expect(
      intakeDraftText([
        { label: "Name", value: " Rasa  P. " },
        { label: "Languages", value: "" },
        { label: "Comment", value: "Tiles, 6 years" },
      ]),
    ).toBe("Name: Rasa P.\nComment: Tiles, 6 years");
  });

  it("survives a reload, and is gone once sent", () => {
    writeWorkerIntakeDraft("Name: Rasa", 1_000);
    expect(readWorkerIntakeDraft(2_000)).toBe("Name: Rasa");
    clearWorkerIntakeDraft();
    expect(readWorkerIntakeDraft(3_000)).toBeNull();
  });

  it("bounded: length capped, an old draft dropped, empty text not kept", () => {
    writeWorkerIntakeDraft("x".repeat(DRAFT_MAX_CHARS + 50), 0);
    expect(readWorkerIntakeDraft(1)?.length).toBe(DRAFT_MAX_CHARS);
    expect(readWorkerIntakeDraft(DRAFT_MAX_AGE_DAYS * 86_400_000 + 1)).toBeNull();
    expect(store.has(INTAKE_DRAFT_KEY), "the old draft is removed").toBe(false);
    writeWorkerIntakeDraft("   ", 0);
    expect(store.has(INTAKE_DRAFT_KEY)).toBe(false);
  });

  it("a broken or refused store keeps nothing and throws nothing", () => {
    store.set(INTAKE_DRAFT_KEY, "{not json");
    expect(readWorkerIntakeDraft()).toBeNull();
    (globalThis as { window?: unknown }).window = {
      get localStorage(): Storage {
        throw new Error("denied");
      },
    };
    expect(() => writeWorkerIntakeDraft("Name: Rasa")).not.toThrow();
    expect(readWorkerIntakeDraft()).toBeNull();
  });
});
