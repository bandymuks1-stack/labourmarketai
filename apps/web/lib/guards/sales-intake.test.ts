import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SALES / LEAD-INTAKE PANEL guards (product-tree branch 23, train §8.14 —
 * the final mapped wagon).
 *
 * The wagon rule (reality-map 2026-07-05 row 8): "read-only lead/intake
 * panel in existing admin (app-side only)". These pins keep that true:
 *
 *   - APP-SIDE ONLY: NO new migration ships with this wagon (the pinned
 *     migration ratchet stays at 109 — see product-readiness.test.ts).
 *   - READ-ONLY: the sales layer performs NO insert/update/delete/upsert
 *     and NO rpc of its own against leads / waitlist / customer_requests.
 *     Its ONLY write is the REUSED §8.13 follow-up action
 *     (create_follow_up_task_v1 via createFollowUpTaskAction) — no
 *     duplicate follow-up path.
 *   - EXISTING SURFACE ONLY: the panel renders on the EXISTING admin
 *     control room behind requireSuperadmin; no new dashboard/route.
 *   - SERVICE-ROLE READ IS FENCED: only the waitlist read (which BY DESIGN
 *     has no authenticated read policy — 0005) may use createAdminClient,
 *     and only after an explicit isSuperadmin() re-check. The client
 *     panel and the pure model never import the admin client.
 *   - HONEST DEGRADATION: 42P01/42501 probe → readable:false → an honest
 *     "not readable yet" state; an unreadable source is NEVER shown as an
 *     empty (zero) list.
 *   - PII BOUNDARY: intake emails render only on the superadmin panel;
 *     the follow-up note is built ONLY by buildIntakeFollowUpNote (kind +
 *     id prefix + non-PII reference) — no email/name/phone is ever copied
 *     into a follow-up task, and no real-looking email appears in this
 *     test or any fixture.
 *   - NO EXTERNAL TRANSPORT: no outbound call of any kind — no fetch, no
 *     mail/SMS/push provider import; nothing enters package.json.
 *   - NO FAKE CRM CLAIMS: stored status values are shown verbatim as
 *     recorded data; the copy never claims anyone was contacted and no
 *     scoring/urgency layer exists.
 *   - i18n en/lt/ru presence for the new namespace.
 */

const APP = join(process.cwd());

const readWeb = (rel: string) => readFileSync(join(APP, rel), "utf8");

const LIB = "lib/sales/lead-intake.ts";
const MODEL = "lib/sales/lead-intake-model.ts";
const PANEL = "components/app/sales-intake-panel.tsx";
const ADMIN_PAGE = "app/[locale]/dashboard/admin/page.tsx";

describe("sales intake — read-only, app-side only (no migration, no CRM writes)", () => {
  const lib = readWeb(LIB);
  const model = readWeb(MODEL);
  const panel = readWeb(PANEL);

  it("reads ONLY the three existing intake tables — no other relation, no parallel read model", () => {
    const fromCalls = [...lib.matchAll(/\.from\("([a-z_]+)"\)/g)].map(
      (m) => m[1],
    );
    expect(new Set(fromCalls)).toEqual(
      new Set(["leads", "waitlist", "customer_requests"]),
    );
    // The pure model and the panel query nothing themselves.
    for (const src of [model, panel]) {
      expect(src).not.toMatch(/\.from\(/);
    }
  });

  it("performs NO write of its own: no insert/update/delete/upsert, no own rpc", () => {
    for (const src of [lib, model, panel]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    }
  });

  it("the ONLY action is the REUSED §8.13 follow-up create action — no duplicate follow-up path", () => {
    expect(panel).toMatch(
      /import\s*\{[^}]*createFollowUpTaskAction[^}]*\}\s*from\s*"@\/lib\/followup\/follow-up-actions"/,
    );
    // No second create path: the sales layer defines no server action and
    // never calls the RPC name directly.
    for (const src of [lib, model, panel]) {
      expect(src).not.toMatch(/create_follow_up_task_v1/);
      expect(src).not.toMatch(/"use server"/);
    }
  });

  it("service-role read is FENCED: waitlist-only, behind an explicit isSuperadmin() re-check", () => {
    // The read service may use the admin client (waitlist has no
    // authenticated read policy by design — 0005), but only after the
    // superadmin re-check, and nowhere else in the sales layer.
    expect(lib).toMatch(/createAdminClient/);
    expect(lib).toMatch(/if \(!\(await isSuperadmin\(\)\)\)/);
    // The re-check appears BEFORE the admin client is constructed.
    expect(lib.indexOf("await isSuperadmin()")).toBeLessThan(
      lib.indexOf("createAdminClient()"),
    );
    // Only the waitlist reader touches the admin client: the leads and
    // customer_requests readers take the user-scoped client parameter.
    expect(lib).toMatch(/async function readLeads\(\s*supabase: SupabaseClient/);
    expect(lib).toMatch(
      /async function readRequests\(\s*supabase: SupabaseClient/,
    );
    expect(lib).toMatch(/async function readWaitlist\(\): Promise/);
    for (const src of [model, panel]) {
      expect(src).not.toMatch(/createAdminClient|supabase\/admin/);
    }
  });

  it("degrades honestly: 42P01/42501 probe → readable:false — never a false zero", () => {
    expect(lib).toMatch(/RELATION_NOT_FOUND_CODE = "42P01"/);
    expect(lib).toMatch(/PERMISSION_DENIED_CODE = "42501"/);
    expect(lib).toMatch(/readable: false/);
    expect(lib).toMatch(/service_key_missing/);
    // The panel renders a distinct unreadable state per source — an
    // unreadable source is never rendered through the empty-list branch.
    expect(panel).toMatch(/intake-leads-unreadable/);
    expect(panel).toMatch(/intake-waitlist-unreadable/);
    expect(panel).toMatch(/intake-requests-unreadable/);
    expect(panel).toMatch(/!data\.leads\.readable/);
    expect(panel).toMatch(/!data\.waitlist\.readable/);
    expect(panel).toMatch(/!data\.requests\.readable/);
  });

  it("PII boundary: the follow-up note is built ONLY by the non-PII builder", () => {
    expect(model).toMatch(/export function buildIntakeFollowUpNote/);
    // The builder body carries kind + id prefix + bounded reference and
    // never an email/name/phone field.
    const builder = model.slice(model.indexOf("buildIntakeFollowUpNote"));
    expect(builder).not.toMatch(/email|phone|fullName|companyName/);
    // The panel passes ONLY the builder output as the note.
    expect(panel).toMatch(/note: buildIntakeFollowUpNote\(kind, id, reference\)/);
    // And the values fed into it are id + source/title — never r.email.
    expect(panel).not.toMatch(/buildIntakeFollowUpNote\([^)]*email/);
    expect(panel).not.toMatch(/addFollowUp\([^)]*email/i);
  });

  it("performs NO external transport anywhere in the sales layer", () => {
    for (const src of [lib, model, panel]) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|firebase|@sendgrid)/i,
      );
    }
    const pkg = readWeb("package.json");
    expect(pkg).not.toMatch(
      /nodemailer|twilio|sendgrid|mailgun|postmark|telegram|web-push/i,
    );
  });

  it("is surfaced on the EXISTING admin control room only (no new dashboard/route)", () => {
    const adminPage = readWeb(ADMIN_PAGE);
    expect(adminPage).toMatch(/getLeadIntakeOverview\(\)/);
    expect(adminPage).toMatch(/<SalesIntakePanel/);
    expect(adminPage).toMatch(/await requireSuperadmin\(locale\)/);
    for (const dir of ["sales", "leads", "intake", "crm"]) {
      expect(
        existsSync(join(APP, "app", "[locale]", "dashboard", "admin", dir)),
        `no new admin route: ${dir}`,
      ).toBe(false);
      expect(
        existsSync(join(APP, "app", "[locale]", "dashboard", dir)),
        `no new dashboard route: ${dir}`,
      ).toBe(false);
    }
  });

  it("copy stays honest: read-only note present, no fake CRM claims, no old terminology", () => {
    expect(panel).toMatch(/t\("honestNote"\)/);
    const en = JSON.parse(readWeb("messages/en.json")).salesIntake;
    expect(en.honestNote).toMatch(/contacts anyone|contacts nobody/i);
    const blob = JSON.stringify(en).toLowerCase();
    // Never a claim the product cannot prove (stored pipeline values from
    // the DB render verbatim in mono type — they are data, not copy).
    expect(blob).not.toMatch(
      /we contacted|contacted them|message sent|email sent|lead score|qualified automatically/,
    );
    // No old project terminology anywhere in the new layer.
    for (const src of [readWeb(LIB), readWeb(MODEL), readWeb(PANEL)]) {
      expect(src).not.toMatch(/LABMA/);
    }
  });

  it("no synthetic/example emails enter the layer or this guard's fixtures", () => {
    for (const src of [readWeb(LIB), readWeb(MODEL), readWeb(PANEL)]) {
      expect(src).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    }
  });
});

describe("i18n — salesIntake namespace present in en/lt/ru", () => {
  for (const locale of ["en", "lt", "ru"]) {
    it(`${locale} carries the full salesIntake catalogue`, () => {
      const messages = JSON.parse(readWeb(`messages/${locale}.json`));
      const ns = messages.salesIntake;
      expect(ns, `${locale} salesIntake namespace`).toBeTruthy();
      for (const key of [
        "title",
        "intro",
        "honestNote",
        "requestsHeading",
        "waitlistHeading",
        "leadsHeading",
        "sourceLabel",
        "intentLabel",
        "roleLabel",
        "createdLabel",
        "openSubject",
        "noDetails",
        "followUpRecorded",
      ]) {
        expect(
          String(ns[key] ?? "").length,
          `${locale} salesIntake.${key}`,
        ).toBeGreaterThan(0);
      }
      for (const key of [
        "empty",
        "needsAdminRead",
        "serviceKeyMissing",
        "error",
      ]) {
        expect(
          String(ns.state?.[key] ?? "").length,
          `${locale} salesIntake.state.${key}`,
        ).toBeGreaterThan(0);
      }
      expect(
        String(ns.actions?.addFollowUp ?? "").length,
        `${locale} salesIntake.actions.addFollowUp`,
      ).toBeGreaterThan(0);
    });
  }
});
