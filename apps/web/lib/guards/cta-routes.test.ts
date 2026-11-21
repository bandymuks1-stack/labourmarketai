import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { learnerInviteHref, NEW_ORGANIZATION_HREF, WORKER_INVITE_HREF } from "@/lib/navigation/work-areas";

/**
 * BUTTON = ACTION (owner directive 2026-11-21, P1).
 *
 * The confirmed defect: "Kviesti studentus" led to /dashboard/network with the
 * student invite preset, and the person landed on the relationships overview.
 * Its title and first screen are about "your companies, teams, partners", and
 * the invite form was the fourth block, below the first screen. The button
 * named one action and showed a page about the organisation. The same was true
 * of every "Invite" on the people pages, and "+ Add company" opened the
 * EXISTING company's profile (the setup form edits the active company unless
 * it is asked to create).
 *
 * This guard maps each critical CTA to the route that IS its action, so a
 * label can no longer drift away from where it leads:
 *   - invite a student / a worker → the invite form, opened as the page;
 *   - create an organisation      → the setup form in create mode;
 *   - publish a staffing need / offer workers (agency) → the needs page in
 *     the mode the label names.
 */
const web = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(tsx?|mts)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const params = (href: string) => new URL(href, "https://x.test").searchParams;

describe("critical CTAs lead to the action they name", () => {
  it("invite a student → the invite form, student relationship, opened as the page", () => {
    const href = learnerInviteHref("org-1");
    expect(new URL(href, "https://x.test").pathname).toBe("/dashboard/network");
    const q = params(href);
    expect(q.get("invite")).toBe("1");
    expect(q.get("type")).toBe("join_organization");
    expect(q.get("org")).toBe("org-1");
    expect(q.get("relationship")).toBe("student");
  });

  it("invite a worker → the invite form, employee type, opened as the page", () => {
    const q = params(WORKER_INVITE_HREF);
    expect(new URL(WORKER_INVITE_HREF, "https://x.test").pathname).toBe("/dashboard/network");
    expect(q.get("invite")).toBe("1");
    expect(q.get("type")).toBe("join_as_employee");
  });

  it("create an organisation → the setup form in create mode, never the existing company's profile", () => {
    expect(new URL(NEW_ORGANIZATION_HREF, "https://x.test").pathname).toBe("/dashboard/start/company");
    expect(params(NEW_ORGANIZATION_HREF).get("new")).toBe("1");
    const network = read("app/[locale]/dashboard/network/page.tsx");
    expect(network).not.toMatch(/data-testid="network-add-company"[^>]*href="\/dashboard\/start\/company"/);
    expect(network.match(/href=\{NEW_ORGANIZATION_HREF/g) ?? []).toHaveLength(2);
  });

  it("the network page opens AS the invite action when a CTA asks for it", () => {
    const network = read("app/[locale]/dashboard/network/page.tsx");
    expect(network).toMatch(/if \(invite === "1"\) \{/);
    expect(network).toMatch(/data-view="invite"/);
    expect(network).toMatch(/pageTitle=\{actionTitle\}/);
    // A student invite is titled after its button ("Kviesti studentus").
    expect(network).toMatch(/relationship === "student" \? tLearners\("invite"\)/);
  });

  it("the chat's invite-a-learner chip opens the same action", () => {
    const starters = read("lib/conversation/starters.ts");
    expect(starters).toMatch(/inviteLearner: \{ id: "link:\/dashboard\/network\?invite=1&type=join_organization&relationship=student"/);
  });

  it("the agency's 'Offer workers' and 'Create a demand' open the needs page in the mode they name", () => {
    expect(read("app/[locale]/dashboard/company/partners/page.tsx")).toMatch(
      /\{ key: "offer", href: "\/dashboard\/company\/needs\?audience=offer#demand-intake" \}/,
    );
    const clients = read("components/app/agency-clients-section.tsx");
    expect(clients).not.toMatch(/dashboard\/company\/needs#demand-intake/);
    expect(clients.match(/dashboard\/company\/needs\?audience=need#demand-intake/g) ?? []).toHaveLength(2);
  });

  it("no link to the invite panel leaves out the action (`invite=1`)", () => {
    // Any hand-written /dashboard/network?type=… or ?relationship=… link is an
    // invite CTA; without invite=1 it lands on the relationships overview.
    const offenders: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of sourceFiles(resolve(web, dir))) {
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(/\/dashboard\/network\?(?![^"'`]*invite=1)(?:type|relationship)=[^"'`\s]*/g)) {
          offenders.push(`${relative(web, file)}: ${m[0]}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
