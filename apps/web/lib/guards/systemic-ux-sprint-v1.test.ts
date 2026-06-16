import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLE_BY_ID, baseIdentityForRole } from "@/lib/config/roles";

/**
 * systemic-ux-sprint-v1 — anti-regression guards for the systemic audit fixes:
 * role identity, dark pickers, and the project work-object (location + chat).
 * The skill-recognition / evidence / taxonomy / term-leak guards live in their
 * own dedicated files.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

describe("role switcher shows base identities, not 'Agentūra'/'Pirkėjas' as top-level roles", () => {
  const switcher = read("components/app/role-switcher.tsx");

  it("renders BASE IDENTITIES (Asmuo / Įmonė), not raw per-role labels", () => {
    expect(switcher).toMatch(/baseIdentityForRole/);
    expect(switcher).toMatch(/baseIdentityLabelKey/);
    expect(switcher).toMatch(/heldIdentities/);
    // The old leak: rendering every held role via t(`signup.role.${r}`).
    expect(switcher).not.toMatch(/signup\.role\.\$\{r\}/);
  });

  it("agency + customer fold into the company identity (never their own space)", () => {
    expect(baseIdentityForRole("agency")).toBe("company");
    expect(baseIdentityForRole("customer")).toBe("company");
    expect(baseIdentityForRole("worker")).toBe("person");
    expect(baseIdentityForRole("company")).toBe("company");
  });

  it("customer + agency are HIDDEN from the role catalogue (config-level)", () => {
    expect(ROLE_BY_ID.customer.availability).toBe("hidden");
    expect(ROLE_BY_ID.customer.safeToShowInRoleSurfaces).toBe(false);
    expect(ROLE_BY_ID.agency.availability).toBe("hidden");
    expect(ROLE_BY_ID.agency.safeToShowInRoleSurfaces).toBe(false);
  });

  it("base-identity space labels exist in every active locale", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      expect(m.auth.roleSwitcher.personSpace, `${loc} personSpace`).toBeTruthy();
      expect(m.auth.roleSwitcher.companySpace, `${loc} companySpace`).toBeTruthy();
    }
  });
});

describe("dark premium pickers — no native white <select> in the demand form", () => {
  const demand = read("components/app/demand-request-button.tsx");
  it("uses DarkListbox for profession / country / accommodation", () => {
    expect(demand).toMatch(/DarkListbox/);
    expect(demand).not.toMatch(/<select\b/);
  });
});

describe("project page is a real work object — location + communication", () => {
  const page = read("app/[locale]/dashboard/projects/[id]/page.tsx");

  it("renders an honest location block (no fake marker without verified coords)", () => {
    expect(page).toMatch(/data-testid="project-location"/);
    expect(page).toMatch(/deriveProjectLocation/);
    // The no-marker note renders whenever the location is not mappable.
    expect(page).toMatch(/project-location-no-marker/);
    expect(page).toMatch(/location\.mappable/);
  });

  it("renders a project-scoped communication entry (real inbox, no fake chat)", () => {
    expect(page).toMatch(/data-testid="project-communication"/);
    expect(page).toMatch(/data-testid="project-chat-cta"/);
    expect(page).toMatch(/dashboard\/communication/);
  });

  it("location status copy + communication copy exist in every active locale", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const loc1 = m.projectOps.stadium.location;
      const comm = m.projectOps.stadium.communication;
      expect(loc1?.statusTextOnly, `${loc} statusTextOnly`).toBeTruthy();
      expect(loc1?.noMarkerNote, `${loc} noMarkerNote`).toBeTruthy();
      expect(comm?.cta, `${loc} comm.cta`).toBeTruthy();
    }
  });
});

describe("project cards expose a communication entry", () => {
  it("project-map card renders a chat CTA", () => {
    const map = read("components/app/arena/project-map.tsx");
    expect(map).toMatch(/data-testid="project-card-chat-cta"/);
    expect(map).toMatch(/chatCta/);
  });
});
