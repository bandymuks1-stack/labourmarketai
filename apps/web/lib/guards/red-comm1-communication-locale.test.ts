import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { communicationLocales, locales } from "@/lib/i18n/config";

/**
 * COMM-1 (2026-09-20 launch-completion audit): the READ side of the owner
 * contract "each authorized recipient sees the message in THEIR preferred
 * language" (RED-1, 2026-09-17: UI_LANGUAGE ≠ COMMUNICATION_LANGUAGE).
 *
 * WHAT WAS TRUE ON THIS HEAD: the AUTHORED language is preserved
 * (original_language CHECK widened to uk / ka, applied 2026-09-17) and the
 * composer lets the author declare it (#1812) — but the viewer language
 * passed to resolveViewerTexts was the ROUTE locale (lt/en/ru/nl/de), so a
 * Georgian, Ukrainian, Polish … reader could never be rendered their own
 * language. There was no home for the preference.
 *
 * THE FIX IS RED by owner classification (a column on profiles + the code
 * behind it) and lives in
 * supabase/migrations/20260920122000_profiles_communication_locale_v1.sql,
 * applied only after the owner's approval. This guard pins what is true
 * regardless of apply state:
 *   1. the migration is the minimum: ONE nullable column, CHECK-bound to the
 *      canonical `communicationLocales` set (one source of truth — never a
 *      second list), no policy / grant / trigger / function / row change;
 *   2. its rollback drops exactly that column and nothing else;
 *   3. the write path is the person's own row, validated against
 *      isCommunicationLocale, and degrades to `unavailable` on 42703;
 *   4. the read path selects the column, tolerates 42703, and the thread +
 *      instructions pages pass `communication_locale ?? locale` as the
 *      viewer locale; the account page renders the ONE control;
 *   5. the i18n keys exist in all 11 catalogs, real in the active five.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const WEB = join(REPO, "apps", "web");
const MIG_NAME = "20260920122000_profiles_communication_locale_v1";
const MIGRATION = join(REPO, "supabase", "migrations", `${MIG_NAME}.sql`);
const ROLLBACK = join(REPO, "supabase", "rollbacks", `${MIG_NAME}.down.sql`);

const readText = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const strip = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const ws = (s: string) => s.replace(/\s+/g, " ").trim();
const codesIn = (list: string) => [...list.matchAll(/'([a-z]{2})'/g)].map((m) => m[1]).sort();

describe("COMM-1 migration — one nullable column, CHECK = the canonical communication set", () => {
  const raw = readText(MIGRATION);
  const sql = ws(strip(raw));

  it("carries the human-gate annotation on line 1 and the DRAFT sentence (RED, never auto-merged)", () => {
    expect(raw.startsWith("-- @human-gate-approved")).toBe(true);
    expect(raw).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY automatically/);
    expect(raw).toMatch(/^-- ROLLBACK$/m);
  });

  it("adds exactly ONE nullable text column on public.profiles — no default, no NOT NULL", () => {
    expect(sql).toMatch(/alter table public\.profiles add column if not exists communication_locale text check \(/);
    expect((sql.match(/add column/g) ?? []).length).toBe(1);
    expect((sql.match(/alter table/g) ?? []).length).toBe(1);
    expect(sql).not.toMatch(/not null|default /);
  });

  it("the CHECK set == lib/i18n/config `communicationLocales` (13 codes, one source of truth)", () => {
    const check = sql.match(/check \(communication_locale is null or communication_locale in \(([^)]*)\)\)/);
    expect(check, "CHECK must be `is null or in (...)`").toBeTruthy();
    const canonical = [...communicationLocales].sort();
    expect(canonical.length).toBe(13);
    expect(codesIn(check![1])).toEqual(canonical);
    // and it is the COMMUNICATION set, not the narrower UI set
    expect(canonical).toContain("uk");
    expect(canonical).toContain("ka");
    expect([...locales].every((l) => canonical.includes(l))).toBe(true);
  });

  it("touches NO policy, grant, trigger, function or row", () => {
    expect(sql).not.toMatch(/create policy|alter policy|drop policy|\bgrant\b|\brevoke\b|create trigger|create (or replace )?function|drop function|insert into|update public\.|delete from|truncate|drop column|drop table/);
    expect(sql).toMatch(/comment on column public\.profiles\.communication_locale is/);
  });
});

describe("COMM-1 rollback — drops exactly that column", () => {
  it("exists and is the single DROP COLUMN, nothing else", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = ws(strip(readText(ROLLBACK)));
    expect(down).toBe("alter table public.profiles drop column if exists communication_locale;");
    expect(readText(ROLLBACK)).not.toMatch(/(^|\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });
});

describe("COMM-1 write path — the person's own row, validated, degrading on 42703", () => {
  const src = readText(join(WEB, "lib", "i18n", "locale-actions.ts"));

  it("persistCommunicationLocaleAction validates against isCommunicationLocale and clears with null", () => {
    expect(src).toMatch(/import \{ activeLocales, isCommunicationLocale \} from "@\/lib\/i18n\/config"/);
    expect(src).toMatch(/export async function persistCommunicationLocaleAction\(\s*value: string \| null,?\s*\)/);
    expect(src).toMatch(/if \(value !== null && \(typeof value !== "string" \|\| !isCommunicationLocale\(value\)\)\) \{\s*return \{ kind: "invalid" \};/);
  });

  it("writes ONLY communication_locale on the caller's own row (profiles_update RLS, unchanged)", () => {
    const fn = src.slice(src.indexOf("export async function persistCommunicationLocaleAction"));
    expect(ws(fn)).toContain('.from("profiles") .update({ communication_locale: value }) .eq("id", user.id)');
    expect(fn).not.toMatch(/service_role|createAdminClient|createServiceClient/);
    expect(fn).toMatch(/if \(!user\) return \{ kind: "error" \};/);
  });

  it("reports `unavailable` on 42703 / PGRST204 and never claims success on an error", () => {
    expect(src).toMatch(/const MISSING_COLUMN_CODES = new Set\(\["42703", "PGRST204"\]\);/);
    const fn = src.slice(src.indexOf("export async function persistCommunicationLocaleAction"));
    expect(fn).toMatch(/if \(MISSING_COLUMN_CODES\.has\(error\.code\)\) return \{ kind: "unavailable" \};/);
    expect(fn.indexOf("if (error)")).toBeLessThan(fn.indexOf('return { kind: "ok" }'));
  });
});

describe("COMM-1 read path — tolerant select, viewer locale = preference ?? UI locale", () => {
  const helper = readText(join(WEB, "lib", "i18n", "communication-locale.ts"));

  it("selects the column on the own row and reports unavailable on 42703 / PGRST204 (never a silent null)", () => {
    expect(helper).toMatch(/^import "server-only";/m);
    expect(ws(helper)).toContain('.from("profiles") .select("communication_locale") .eq("id", profileId) .maybeSingle()');
    expect(helper).toMatch(/const MISSING_COLUMN_CODES = new Set\(\["42703", "PGRST204"\]\);/);
    expect(helper).toMatch(/if \(isMissingCommunicationLocaleColumn\(error\.code\)\) return \{ kind: "unavailable" \};/);
    expect(helper).toMatch(/return \{ kind: "error" \};/);
    // Only a value in the canonical set is ever returned as a preference.
    expect(helper).toMatch(/typeof raw === "string" && isCommunicationLocale\(raw\) \? raw : null/);
    expect(helper).toMatch(/return read\.kind === "ok" && read\.value \? read\.value : uiLocale;/);
  });

  for (const [label, rel] of [
    ["the thread page", join("app", "[locale]", "dashboard", "communication", "[conversationId]", "page.tsx")],
    ["the instructions page", join("app", "[locale]", "dashboard", "instructions", "page.tsx")],
  ] as const) {
    it(`${label} passes the viewer's communication locale (?? UI locale) to resolveViewerTexts`, () => {
      const page = readText(join(WEB, rel));
      expect(page).toMatch(/import \{ readCommunicationLocale, viewerLocaleFor \} from "@\/lib\/i18n\/communication-locale";/);
      expect(page).toMatch(/const communicationLocale = await readCommunicationLocale\(supabase, user\.id\);/);
      expect(page).toMatch(/const viewerLocale = viewerLocaleFor\(communicationLocale, locale\);/);
      // the ONLY resolveViewerTexts call takes viewerLocale, never the raw route locale
      const calls = page.match(/resolveViewerTexts\(([\s\S]*?)\);/g) ?? [];
      expect(calls.length).toBe(1);
      const call = ws(calls[0] ?? "");
      expect(call).toMatch(/viewerLocale, user\.id, ?\);$/);
      expect(call).not.toMatch(/\blocale, user\.id/);
    });
  }

  it("the account page renders the ONE control from the stored value and states unavailability", () => {
    const page = readText(join(WEB, "app", "[locale]", "dashboard", "account", "page.tsx"));
    expect(page).toMatch(/import \{ CommunicationLocaleSection \} from "@\/components\/app\/communication-locale-select";/);
    expect(page).toMatch(/const communicationLocale = await readCommunicationLocale\(supabase, user\.id\);/);
    expect(page).toMatch(/await getTranslations\("communicationLocale"\)/);
    expect(ws(page)).toContain('<CommunicationLocaleSection value={communicationLocale.kind === "ok" ? communicationLocale.value : null} available={communicationLocale.kind !== "unavailable"}');
    expect((page.match(/<CommunicationLocaleSection/g) ?? []).length).toBe(1);
  });

  it("the control offers `same as the interface` + every communication language named in itself, and reverts on failure", () => {
    const cmp = readText(join(WEB, "components", "app", "communication-locale-select.tsx"));
    expect(cmp).toMatch(/^"use client";/m);
    expect(cmp).toMatch(/import \{ persistCommunicationLocaleAction \} from "@\/lib\/i18n\/locale-actions";/);
    expect(cmp).toMatch(/<option value="">\{labels\.sameAsInterface\}<\/option>/);
    expect(cmp).toMatch(/\{communicationLocales\.map\(\(code\) => \(/);
    expect(cmp).toMatch(/\{communicationLanguageNames\[code\]\}/);
    expect(cmp).toMatch(/persistCommunicationLocaleAction\(next === "" \? null : next\)/);
    expect(cmp).toMatch(/setCurrent\(previous\);/);
    expect(cmp).toMatch(/disabled=\{status === "unavailable" \|\| pending\}/);
  });
});

describe("COMM-1 i18n — keys in all 11 catalogs, real copy in the active five", () => {
  const KEYS = ["title", "intro", "label", "sameAsInterface", "saved", "error", "unavailable"];
  const ACTIVE = ["lt", "en", "ru", "nl", "de"];
  for (const loc of locales) {
    it(`${loc}.json carries communicationLocale.{${KEYS.join(",")}}`, () => {
      const cat = JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8")) as Record<string, unknown>;
      const ns = cat.communicationLocale as Record<string, unknown> | undefined;
      expect(ns, `communicationLocale namespace missing in ${loc}.json`).toBeTruthy();
      for (const k of KEYS) {
        const v = ns![k];
        expect(typeof v === "string" && v.trim().length > 0, `${loc}.communicationLocale.${k}`).toBe(true);
        if (ACTIVE.includes(loc)) expect(v as string, `${loc}.communicationLocale.${k} must be real copy`).not.toMatch(/^\[EN\]/);
      }
    });
  }
});
