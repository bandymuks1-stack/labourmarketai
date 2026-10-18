/**
 * `ManagerScopeNotice` — RENDER proof over the REAL catalogues (review P2 on
 * #1859, 2026-09-24).
 *
 * The defect: the notice derived only from the governance role, so a manager
 * who is ALSO a platform admin read "creating projects … is shown as refused"
 * while the `is_admin()` arm of `projects_insert` / `company_workers_select`
 * admits their writes and their roster read. It now consults the shell's dual
 * admin signal — AFTER the pure projection, so no role that never sees the
 * notice pays a roles read — and renders nothing for an admin.
 *
 * Also pinned: the body no longer promises "never as an empty list". Only the
 * project write is rendered as a named refusal; the roster read answers zero
 * rows, and the roster list below the notice DOES render empty for a non-admin
 * manager until the RED RLS widening — the sentence says so now.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales, locales } from "@/lib/i18n/config";
import type { GovernanceRole } from "@/lib/company/role-capabilities";

const state = vi.hoisted(() => ({ locale: "en", isAdmin: false }));
const getSessionIsAdmin = vi.hoisted(() => vi.fn(async () => state.isAdmin));

const WEB = join(__dirname, "..", "..");
const catalogs: Record<string, Record<string, unknown>> = {};
const catalog = (loc: string) =>
  (catalogs[loc] ??= JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8")));

/** A `getTranslations`-shaped translator over the REAL catalogue subtree; a
 *  missing key renders a VISIBLE marker so the assertions catch it. */
function scoped(loc: string, ns: string) {
  const root = ns
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], catalog(loc)) as Record<string, unknown>;
  return (key: string) => {
    const v = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], root);
    return typeof v === "string" ? v : `MISSING:${ns}.${key}`;
  };
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => scoped(state.locale, ns)),
}));
vi.mock("@/lib/auth/session-admin-signal", () => ({ getSessionIsAdmin }));

import { ManagerScopeNotice } from "@/components/app/organization/manager-scope-notice";

async function render(role: GovernanceRole): Promise<string | null> {
  const el = await ManagerScopeNotice({ role });
  return el === null ? null : renderToStaticMarkup(el);
}

const body = (loc: string) => scoped(loc, "organizationMembers.managerScope")("body");

beforeEach(() => {
  state.locale = "en";
  state.isAdmin = false;
  getSessionIsAdmin.mockClear();
});

describe("who reads the notice", () => {
  // manager_projects_roster_rls_v1 (owner-approved RED, 2026-09-24): projects
  // select/insert/update and the roster read admit manages_organization, so a
  // manager's operating writes are no longer refused and the sentence would
  // be false for them. The projection now says so for every role.
  it("after the policy widening NO role reads it — manager and external manager included", async () => {
    for (const role of ["manager", "external_manager", "owner", "admin", "member"] as const) {
      expect(await render(role), role).toBeNull();
    }
  });

  it("the projection decides first: no role pays the platform-admin roles read", async () => {
    state.isAdmin = true;
    for (const role of ["manager", "external_manager", "owner", "admin", "member"] as const) {
      expect(await render(role), role).toBeNull();
    }
    expect(getSessionIsAdmin).not.toHaveBeenCalled();
  });
});

describe("the sentence is true for a non-admin manager, in every catalogue", () => {
  /** The promise the roster cannot keep, as each catalogue used to phrase it. */
  const OLD_PROMISE: Record<string, string> = {
    en: "never as an empty list",
    lt: "niekada kaip tuščias sąrašas",
    ru: "а не как пустой список",
    nl: "nooit als een lege lijst",
    de: "nie als leere Liste",
    pl: "nigdy jako pusta lista",
    da: "aldrig som en tom liste",
    et: "mitte kunagi tühja nimekirjana",
    lv: "nekad kā tukšs saraksts",
    no: "aldri som en tom liste",
    sv: "aldrig som en tom lista",
  };

  it("every locale has the old promise on record here (the pin cannot go stale by omission)", () => {
    expect(Object.keys(OLD_PROMISE).sort()).toEqual([...locales].sort());
  });

  for (const loc of locales) {
    it(`${loc}: no longer promises "never as an empty list"`, () => {
      const text = body(loc);
      expect(text).not.toMatch(/^MISSING:/);
      expect(text).not.toContain(OLD_PROMISE[loc]);
    });
  }

  it("en / lt: says the project write is refused AND the roster below can look empty", () => {
    expect(body("en")).toContain("shown as refused");
    expect(body("en")).toContain("can look empty");
    expect(body("lt")).toContain("rodomas kaip atmestas");
    expect(body("lt")).toContain("gali atrodyti tuščias");
  });

  for (const loc of activeLocales.filter((l) => l !== "en")) {
    it(`${loc}: the body is translated, not English`, () => {
      expect(body(loc)).not.toBe(body("en"));
    });
  }

  for (const loc of activeLocales) {
    it(`${loc}: the copy the component would render is complete in the real catalogue`, () => {
      // No role renders the notice after the policy widening; the copy stays
      // complete so the one honest place for a future gap is ready.
      const t = scoped(loc, "organizationMembers.managerScope");
      expect(t("title")).not.toMatch(/^MISSING:/);
      expect(t("body")).not.toMatch(/^MISSING:/);
    });
  }
});
