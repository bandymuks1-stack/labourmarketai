import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Company role simplicity + broken-flow guard (owner smoke v1).
 *
 * Pins the six owner-mandated contracts:
 *   1. Agency is a companyType, NOT a root role (start surfaces offer only
 *      worker + company; the catalogue hides agency from add surfaces).
 *   2. Company country validation never exposes a technical error (select
 *      over seeded codes; service maps FK/RPC failures to a calm message).
 *   3. The worker-instruction select can submit a selected worker (controlled
 *      value + localized validation, no native-popup-only path).
 *   4. Header popovers/drawers close on route change + have a visible ✕.
 *   5. A free user can attach 1 work-report photo (server-enforced cap) or
 *      sees the honest limitation — never a forgotten-looking feature.
 *   6. companyType change updates the visible profile/dashboard state from
 *      the saved row (one canonical profile, no stale legacy mode).
 */

const APP = join(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const migDir = resolve(REPO, "supabase", "migrations");
const typeMigFile = readdirSync(migDir).find((f) =>
  f.endsWith("_company_type_and_country_safety.sql"),
);
const typeMig = typeMigFile
  ? readFileSync(join(migDir, typeMigFile), "utf8")
  : "";
const photoMigFile = readdirSync(migDir).find((f) =>
  f.endsWith("_journal_entry_photos.sql"),
);
const photoMig = photoMigFile
  ? readFileSync(join(migDir, photoMigFile), "utf8")
  : "";

const roleChoice = read("components/app/setup-role-choice.tsx");
const onboarding = read("components/app/onboarding-wizard.tsx");
const rolesConfig = read("lib/config/roles.ts");
const setupForm = read("components/app/company-setup-form.tsx");
const setupService = read("lib/company/company-setup.ts");
const sharedProfile = read("lib/company/company-profile-shared.ts");
const setupAction = read("lib/company/setup-actions.ts");
const companyPage = read("app/[locale]/dashboard/company/page.tsx");
const composer = read("components/app/manager-instruction-composer.tsx");
const notifPanel = read("components/app/notification-panel.tsx");
const roleSwitcher = read("components/app/role-switcher.tsx");
const dismissHook = read("lib/hooks/use-popover-dismiss.ts");
const journalComposer = read("components/app/journal-entry-composer.tsx");
const photoUpload = read("lib/journal/photo-upload.ts");
const ltJournal = JSON.parse(read("messages/lt/journal.json")) as {
  photo?: Record<string, string>;
};
const lt = JSON.parse(read("messages/lt.json")) as Record<string, unknown>;

// ── 1. Agency is a companyType, not a root role ─────────────────────────

describe("agency is a companyType, never a root role", () => {
  it("the migration adds company_type with staffing_agency in the allowlist", () => {
    expect(typeMigFile).toBeTruthy();
    expect(typeMig).toMatch(/add column if not exists company_type/);
    expect(typeMig).toMatch(/'staffing_agency'/);
    expect(typeMig).toMatch(/'client_customer'/);
    expect(typeMig).toMatch(/companies_company_type_check/);
  });
  it("onboarding offers only worker + company role cards", () => {
    const cards = onboarding.slice(
      onboarding.indexOf("const ROLE_CARDS"),
      onboarding.indexOf("];", onboarding.indexOf("const ROLE_CARDS")),
    );
    expect(cards).toMatch(/key:\s*"worker"/);
    expect(cards).toMatch(/key:\s*"company"/);
    expect(cards).not.toMatch(/key:\s*"agency"/);
    expect(cards).not.toMatch(/key:\s*"customer"/);
  });
  it("the start role choice offers only worker + company", () => {
    expect(roleChoice).not.toMatch(/representAgency|\/dashboard\/start\/agency/);
    expect(roleChoice).toMatch(/role-choice-worker/);
    expect(roleChoice).toMatch(/role-choice-company/);
  });
  it("the role catalogue hides agency from add/start surfaces", () => {
    const agencyRow = rolesConfig.slice(
      rolesConfig.indexOf('id: "agency"'),
      rolesConfig.indexOf('id: "customer"'),
    );
    expect(agencyRow).toMatch(/availability:\s*"hidden"/);
    expect(agencyRow).toMatch(/safeToShowInRoleSurfaces:\s*false/);
  });
  it("the company form offers the full multi-sector type list", () => {
    for (const t of [
      "construction",
      "staffing_agency",
      "subcontractor",
      "manufacturing",
      "services",
      "client_customer",
      "other",
    ]) {
      expect(sharedProfile).toMatch(new RegExp(`"${t}"`));
    }
    expect(setupForm).toMatch(/company-setup-company-type/);
    expect(setupForm).toMatch(/COMPANY_TYPES\.map/);
  });
});

// ── 2. Country validation never exposes a technical error ───────────────

describe("company country validation is human, never technical", () => {
  it("the form renders a country SELECT over seeded codes (no free text)", () => {
    expect(setupForm).toMatch(/<select[\s\S]{0,200}name="country"/);
    expect(setupForm).toMatch(/COMPANY_COUNTRY_CODES\.map/);
    expect(setupForm).not.toMatch(/<input[\s\S]{0,200}name="country"/);
  });
  it("the v2 RPC validates the country against public.countries", () => {
    expect(typeMig).toMatch(/save_company_setup_v2/);
    expect(typeMig).toMatch(/from public\.countries where code = c_country/);
    expect(typeMig).toMatch(/'invalid_country'/);
  });
  it("the service maps country/FK failures to a tagged result and never returns raw DB text", () => {
    expect(setupService).toMatch(/invalid-country/);
    expect(setupService).toMatch(/organizations_country_fkey/);
    // The SAVE path's generic error returns a constant, not error.message
    // (the read path may keep the message — it never renders in the form).
    const savePath = setupService.slice(
      setupService.indexOf("export async function saveCompanySetup"),
    );
    expect(savePath).toMatch(
      /return \{ kind: "error", message: "save_failed" \}/,
    );
    expect(savePath).not.toMatch(
      /return \{ kind: "error", message: error\.message \}/,
    );
  });
  it("the action + form surface the calm localized message", () => {
    expect(setupAction).toMatch(/invalid_country/);
    expect(setupForm).toMatch(/statusInvalidCountry/);
    const setup = JSON.stringify(
      (lt as { roleDashboards?: { company?: { setup?: unknown } } })
        .roleDashboards?.company?.setup ?? {},
    );
    expect(setup).toMatch(/statusInvalidCountry/);
    expect(setup).toMatch(/Lietuva/);
  });
});

// ── 3. Worker-instruction select submits a selected worker ──────────────

describe("instruction composer select is controlled + localized", () => {
  it("the worker select is CONTROLLED (value survives form-action resets)", () => {
    expect(composer).toMatch(/value=\{workerId\}/);
    expect(composer).toMatch(/setWorkerId\(e\.target\.value\)/);
  });
  it("validation shows the localized message instead of the native popup", () => {
    expect(composer).toMatch(/selectWorkerError/);
    expect(composer).toMatch(/instruction-worker-select-error/);
    // The worker select must NOT rely on native `required` (that's what
    // produced the browser-default "Please select an item in the list").
    const selectBlock = composer.slice(
      composer.indexOf('name="worker_profile_id"'),
      composer.indexOf("</select>"),
    );
    expect(selectBlock).not.toMatch(/\brequired\b/);
  });
  it("a single managed worker is preselected", () => {
    expect(composer).toMatch(/workers\.length === 1 \? workers\[0\]\.profileId/);
  });
});

// ── 4. Popovers close on route change + visible ✕ ───────────────────────

describe("header popovers close on navigation and have a close button", () => {
  it("the shared dismiss hook closes on pathname change, outside click and Escape", () => {
    expect(dismissHook).toMatch(/usePathname/);
    expect(dismissHook).toMatch(/\[pathname\]/);
    expect(dismissHook).toMatch(/mousedown/);
    expect(dismissHook).toMatch(/Escape/);
  });
  it("notification panel + role switcher both use the hook and render ✕", () => {
    for (const src of [notifPanel, roleSwitcher]) {
      expect(src).toMatch(/usePopoverDismiss\(/);
    }
    expect(notifPanel).toMatch(/notification-panel-close/);
    expect(roleSwitcher).toMatch(/role-switcher-close/);
  });
});

// ── 5. Free work-report photo (1) or honest limitation ──────────────────

describe("work-report photo: 1 free photo, server-enforced, honest copy", () => {
  it("the photos migration exists with the 1-photo free cap in the RPC", () => {
    expect(photoMigFile).toBeTruthy();
    expect(photoMig).toMatch(/journal_entry_photos/);
    expect(photoMig).toMatch(/photo_limit_reached/);
    expect(photoMig).toMatch(/if existing_count >= 1 then/);
    // Private bucket, no public CDN.
    expect(photoMig).toMatch(/'journal-entry-photos',\s*false\s*\)/m);
  });
  it("the composer renders the photo field with the exact free-tier promise", () => {
    expect(journalComposer).toMatch(/journal-photo-input/);
    expect(journalComposer).toMatch(/journal-photo-free-tier-note/);
    expect(ltJournal.photo?.freeTierNote).toBe(
      "Nemokamai galite pridėti 1 nuotrauką prie įrašo. Daugiau nuotraukų ir išplėstiniai įrodymai bus VIP funkcija.",
    );
  });
  it("upload degrades honestly when storage is not provisioned", () => {
    expect(photoUpload).toMatch(/"not-ready"/);
    expect(journalComposer).toMatch(/photo\.notReady/);
    expect(ltJournal.photo?.notReady).toMatch(/dar neparuošta/);
  });
  it("the upload helper enforces the same client-side limits", () => {
    expect(photoUpload).toMatch(/JOURNAL_PHOTO_FREE_LIMIT = 1/);
    expect(photoUpload).toMatch(/5 \* 1024 \* 1024/);
    expect(photoUpload).toMatch(/image\/jpeg/);
  });
});

// ── 5b. /dashboard/start carries no stale technical copy ────────────────

describe("activity-setup hub has no outdated technical buyer copy", () => {
  const startPage = read("app/[locale]/dashboard/start/page.tsx");
  it("no longer claims the buyer entity is missing / schema-blocked", () => {
    expect(startPage).not.toMatch(/pilot_drafts/);
    expect(startPage).not.toMatch(/M3 etap|M3 scope/);
    expect(startPage).not.toMatch(/lentelė dar nesukurta|does not yet exist/);
    expect(startPage).not.toMatch(/Migracija atskirame PR|Migration in a separate PR/);
  });
  it("buyer lane reads the REAL customers row and renders live state", () => {
    expect(startPage).toMatch(/from\("customers"\)/);
    expect(startPage).toMatch(/activity-setup-lane-buyer/);
  });
});

// ── 6. companyType change updates the visible workspace ─────────────────

describe("companyType drives the canonical profile/dashboard state", () => {
  it("the dashboard renders the type chip from the SAVED row", () => {
    expect(companyPage).toMatch(/company-dashboard-type-chip/);
    expect(companyPage).toMatch(/companyRow\.companyType/);
    expect(companyPage).toMatch(/setup\.companyTypeOptions/);
  });
  it("agency/client modes re-label the same profile (no separate mode)", () => {
    expect(companyPage).toMatch(/typeNotes\.staffing_agency/);
    expect(companyPage).toMatch(/typeNotes\.client_customer/);
  });
  it("the save action revalidates the whole layout so nav/dashboard recompute", () => {
    expect(setupAction).toMatch(/revalidatePath\("\/", "layout"\)/);
  });
  it("the service reads company_type back with a safe default", () => {
    expect(setupService).toMatch(/company_type/);
    expect(setupService).toMatch(/\?\? "other"/);
  });
});
