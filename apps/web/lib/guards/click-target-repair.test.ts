import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Click-target repair guard (root-cause audit PR4, 2026-07-06).
 *
 * Pins the ten repaired click targets so none of them silently regresses to a
 * dead/misleading state:
 *   1. learning queue rows state WHAT/WHO before Approve (never blind);
 *   2. accepted marketplace rows carry a Message next step (never inert);
 *   3. #capabilities deep links land on an OPEN disclosure;
 *   4. work-card inline "+" chips open the editor (never self-anchor);
 *   5. the role gate never bounces silently (?notice= + dashboard banner);
 *   6. company "submit for real" switches workspace first (no branch-dependent
 *      anchor link);
 *   7. chain actions land on the #company-team control;
 *   8. "manage spaces" leads to the spaces hub;
 *   9. demand submit success links scouting + refreshes the read-back;
 *  10. instruction clarify surfaces failure and links the thread.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const LOCALES = ["lt", "en", "ru"] as const;
const catalog = (loc: string) =>
  JSON.parse(read(`messages/${loc}.json`)) as Record<string, never>;

describe("1. learning review queue is never a blind approve", () => {
  const section = read("components/app/learning-review-section.tsx");
  it("every row renders the suggestion kind + subject before any decision button", () => {
    expect(section).toMatch(/data-testid="learning-item-kind"/);
    expect(section).toMatch(/data-testid="learning-item-subject"/);
    expect(section).toMatch(/subjectWorkerName/);
    expect(section).toMatch(/subjectSkillSlug/);
  });
  it("the viewer's own rows are transparency rows, split from the manager queue", () => {
    expect(section).toMatch(/viewerWorkerId/);
    expect(section).toMatch(/data-testid="learning-own-row"/);
    // Decision buttons render only inside the org-items branch.
    expect(section).toMatch(/orgItems\.map/);
  });
  it("the enriched read joins worker + skill display fields", () => {
    const lib = read("lib/learning/learning.ts");
    expect(lib).toMatch(/workers\(profiles\(full_name, email\)\), skills\(slug\)/);
  });
});

describe("2. accepted marketplace rows open the next step", () => {
  const loop = read("components/app/marketplace-loop-section.tsx");
  it("both accepted row variants render the message CTA", () => {
    expect(loop).toMatch(/marketplace-outgoing-message-cta/);
    expect(loop).toMatch(/marketplace-incoming-message-cta/);
  });
  it("the grant is verified server-side on the ACCEPTED status only", () => {
    const action = read("lib/marketplace/service-request-conversation.ts");
    expect(action).toMatch(/status !== "accepted"/);
    expect(action).toMatch(/allowed_accepted_service_request/);
    // Counterpart is resolved server-side — rows never expose profile ids.
    expect(action).toMatch(/buyer_id/);
    expect(loop).not.toMatch(/buyerProfileId|providerProfileId/);
  });
});

describe("3. #capabilities deep links land on an open disclosure", () => {
  it("the profile page mounts the hash opener next to the details target", () => {
    const page = read("app/[locale]/dashboard/profile/page.tsx");
    expect(page).toMatch(/DetailsHashOpener targetId="capabilities"/);
    expect(page).toMatch(/<details id="capabilities"/);
  });
  it("the opener opens on initial hash AND later hash changes", () => {
    const opener = read("components/app/details-hash-opener.tsx");
    expect(opener).toMatch(/hashchange/);
    expect(opener).toMatch(/HTMLDetailsElement/);
  });
});

describe("4. work-card inline '+' chips open the editor, never self-anchor", () => {
  it("the card no longer emits the #work-card self-anchor fallback", () => {
    const card = read("components/app/work-card.tsx");
    expect(card).not.toMatch(/"#work-card"/);
    expect(card).toMatch(/WorkCardMissingChip/);
  });
  it("inline chips dispatch the open event; the editor listens", () => {
    const chip = read("components/app/work-card-missing-chip.tsx");
    const editor = read("components/app/work-card-editor.tsx");
    expect(chip).toMatch(/WORK_CARD_OPEN_EDITOR_EVENT/);
    expect(editor).toMatch(/addEventListener\(WORK_CARD_OPEN_EDITOR_EVENT/);
  });
});

describe("5. role gate never bounces silently", () => {
  it("the redirect carries a notice param", () => {
    const gate = read("lib/auth/require-role.ts");
    expect(gate).toMatch(/\?notice=needs_\$\{expectedRole\}_role/);
  });
  it("the dashboard renders the notice banner with a connected next action", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(/data-testid="dashboard-role-notice"/);
    expect(page).toMatch(/roleNotice\.cta/);
  });
  it("banner copy exists in every active locale", () => {
    for (const loc of LOCALES) {
      const d = catalog(loc) as never as {
        auth: { dashboard: { roleNotice: Record<string, string> } };
      };
      for (const k of [
        "needs_worker_role",
        "needs_company_role",
        "needs_agency_role",
        "needs_customer_role",
        "cta",
      ]) {
        expect(d.auth.dashboard.roleNotice[k], `${loc}:${k}`).toBeTruthy();
      }
    }
  });
});

describe("6. company 'submit for real' works for every held-role user", () => {
  const page = read("app/[locale]/dashboard/company/page.tsx");
  it("no raw link into the branch-dependent #demand-intake anchor remains", () => {
    expect(page).not.toMatch(/href=\{"\/dashboard#demand-intake"/);
  });
  it("both entry points go through the workspace-switching action", () => {
    const matches = page.match(/openDemandIntakeAsCompanyAction/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3); // import + 2 forms
    const action = read("lib/company/demand-intake-navigation.ts");
    expect(action).toMatch(/switchActiveRole\("company"\)/);
    expect(action).toMatch(/#demand-intake/);
  });
});

describe("7. chain actions land on the exact team control", () => {
  it("invite + enable-review use the #company-team anchor, which exists", () => {
    const chain = read("components/app/dashboard-chain-actions.tsx");
    expect(chain).toMatch(/\/dashboard\/company#company-team/);
    const company = read("app/[locale]/dashboard/company/page.tsx");
    expect(company).toMatch(/id="company-team"/);
  });
});

describe("8. 'manage spaces' leads to the spaces hub", () => {
  it("identity-manage-spaces targets /dashboard/start (not the read-only account page)", () => {
    const ia = read("components/app/identity-actions.tsx");
    const block = ia.slice(ia.indexOf("function ManageSpacesLink"));
    expect(block).toMatch(/"\/dashboard\/start"/);
    expect(block).not.toMatch(/"\/dashboard\/account"/);
  });
});

describe("9. demand submit success is not a dead end", () => {
  const btn = read("components/app/demand-request-button.tsx");
  it("success refreshes the server read-back and links scouting", () => {
    expect(btn).toMatch(/if \(res\.ok\) router\.refresh\(\)/);
    expect(btn).toMatch(/demand-done-scouting-link/);
  });
  it("the link label exists in every active locale", () => {
    for (const loc of LOCALES) {
      const d = catalog(loc) as never as {
        auth: { dashboard: { wow: { demand: { form: Record<string, string> } } } };
      };
      expect(d.auth.dashboard.wow.demand.form.doneScoutingLink, loc).toBeTruthy();
    }
  });
});

describe("10. instruction clarify surfaces failure and links the thread", () => {
  const card = read("components/app/worker-instruction-card.tsx");
  it("failure renders an error; success links the conversation", () => {
    expect(card).toMatch(/data-testid="instruction-clarify-error"/);
    expect(card).toMatch(/data-testid="instruction-clarify-thread-link"/);
    expect(card).toMatch(/\/dashboard\/communication\/\$\{instruction\.conversationId\}/);
  });
  it("clarify copy exists in every active locale", () => {
    for (const loc of LOCALES) {
      const d = catalog(loc) as never as {
        instructions: { card: Record<string, string> };
      };
      expect(d.instructions.card.clarifyError, loc).toBeTruthy();
      expect(d.instructions.card.clarifyViewThread, loc).toBeTruthy();
    }
  });
});

describe("i18n parity for the other PR4 keys", () => {
  it("learning + marketplace keys exist in every active locale", () => {
    for (const loc of LOCALES) {
      const d = catalog(loc) as never as {
        learning: Record<string, unknown> & { kind: Record<string, string> };
        marketplace: Record<string, string>;
      };
      expect(d.learning.kind.confirm_skill, loc).toBeTruthy();
      expect(d.learning.kind.review_skill, loc).toBeTruthy();
      expect(d.learning.kind.dismiss, loc).toBeTruthy();
      for (const k of [
        "skillFallback",
        "workerFallback",
        "noteLabel",
        "managerContextLink",
        "ownContextLink",
      ]) {
        expect(d.learning[k], `${loc}:learning.${k}`).toBeTruthy();
      }
      expect(d.marketplace.messageCta, loc).toBeTruthy();
    }
  });
});
