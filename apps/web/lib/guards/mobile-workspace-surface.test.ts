import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

const settings = read("apps/mobile/app/(shell)/settings.tsx");
const shapes = read("apps/mobile/src/capability-shapes.ts");

/**
 * WHAT THIS PROTECTS — the phone can show which organization it is acting for.
 *
 * Before `context.list` the mobile client could sign a person in and had no
 * way to show, or change, which organization they were acting for. The durable
 * pointer decided and nothing on the device surfaced it.
 *
 * THE FIRST VERSION OF THIS SURFACE OVERCLAIMED, in its title, its copy and
 * this guard: it said the pointer decided WHERE RECORDED WORK LANDS. It does
 * not. `resolveDraftEngagementContext` reads `engagement_contexts` and never
 * consults `profiles.active_organization_id`, so a person can act for
 * organization A while a journal entry is drafted against their engagement at
 * B. Belonging to an organization and holding a live work engagement there are
 * different facts, and the composer already shows and asks for the work
 * context. Caught in review on #1735; the copy is narrowed and the claim is
 * pinned below so it cannot creep back.
 *
 * TWO AXES, AND THEY MUST NOT MERGE. A WORKSPACE is an organization the person
 * belongs to. A PARTICIPATION MODE (`ActorContext.mode` — worker / company /
 * agency / customer) is how they take part. `organizationType` says what the
 * ORGANIZATION is and `relationship` says how the person stands in it; neither
 * is the mode. A company-type organization does not make its employee an
 * employer, so deriving a mode from the workspace list would reclassify a real
 * person's role from data that does not carry it (SEP-5, IDENTITY ≠ ROLE).
 *
 * That is the tempting shortcut this guard exists to refuse: the workspace
 * section is real, and `ContextHoldings` stays honestly `unknown` until the
 * participation-mode holdings are themselves readable.
 */
describe("mobile workspace surface — real, and not confused with participation mode", () => {
  it("reads the list through the capability, and never a table", () => {
    expect(settings).toContain('useCapability<ContextListData>("context.list")');
    expect(settings).not.toMatch(/supabase|\.from\(/);
  });

  it("switches through the same durable-pointer capability the web switcher runs", () => {
    expect(settings).toContain('name: "context.switch"');
    // The server's answer is re-read; a local guess is never painted over it.
    expect(settings).toContain("workspaces.reload()");
  });

  it("a failed read renders as a failure, never as an empty list", () => {
    // "You belong to no organization" is a different and false statement.
    expect(settings).toContain('workspace.failed.title');
    expect(settings).toContain("NotAvailable");
  });

  it("offers no switch control where the durable pointer does not exist", () => {
    // pointerAvailable false ⇒ the active workspace shown is the resolver's
    // default, not a stored choice, and a switch would be refused.
    expect(settings).toContain("pointerAvailable");
    expect(settings).toContain("canSwitch");
    expect(settings).toMatch(/disabled=\{!canSwitch/);
    expect(settings).toContain("workspace.pointerUnavailable");
  });

  it("derives no participation mode from a workspace", () => {
    // The workspace section must not reach for the mode vocabulary, and must
    // not feed the ActorContext machinery.
    const from = settings.indexOf('t("workspace.title")');
    const to = settings.indexOf('t("context.title")');
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const block = settings.slice(from, to);
    expect(block).not.toMatch(/switchTo\(|ActorContext|ParticipationMode|\bmode\b/);
  });

  it("no surface claims the pointer routes journal entries", () => {
    // `resolveDraftEngagementContext` resolves from `engagement_contexts` and
    // never reads the pointer — so any copy promising that switching changes
    // where recorded work lands is false.
    const registry = read("apps/web/lib/capabilities/registry.ts");
    const resolver = registry.slice(
      registry.indexOf("async function resolveDraftEngagementContext("),
      registry.indexOf("const journalCreateDraft"),
    );
    expect(resolver.length).toBeGreaterThan(0);
    expect(
      resolver,
      "the draft resolver now reads the workspace pointer — re-read this guard's premise and the copy it protects",
    ).not.toContain("active_organization_id");

    const messages = read("apps/mobile/src/i18n/messages.ts");
    const workspaceCopy = messages
      .split("\n")
      .filter((line) => line.includes("workspace.") || line.trim().startsWith('"'))
      .join("\n");
    // English is the catalogue the others mirror; a routing promise there is
    // the one that would be copied outward.
    expect(workspaceCopy).not.toMatch(/where work you record would land/i);
  });

  it("the shape states that the two axes are separate, and labels come from the server", () => {
    expect(shapes).toContain("ContextListData");
    expect(shapes).toMatch(/SEP-5|IDENTITY ≠ ROLE/);
    // The client renders the server's label; it never builds one.
    expect(shapes).toMatch(/readonly label: string/);
  });

  it("participation modes come from held roles, never from the workspace list", () => {
    // The two axes are wired from different reads, and that separation is the
    // product rule (SEP-5). The provider must map `profile.get`'s heldRoles
    // through the client-core function; it must never reach into the
    // workspace list for a mode.
    const provider = read("apps/mobile/src/context-provider.tsx");
    expect(provider).toContain("holdingsFromHeldRoles(");
    // Through the SHARED read. A second `profile.get` per launch is what an
    // earlier version of this file added while claiming it added none.
    expect(provider).toContain("useProfile()");
    expect(provider).not.toMatch(/useCapability<[^>]*>\(/);
    // The CALL, not the word: the provider's own note explains the separation
    // and names `context.list` in prose, which is documentation worth keeping.
    expect(provider).not.toMatch(/["']context\.list["']/);
    expect(provider).not.toMatch(/organizationType|ContextListData/);
    // Every context this builds names no organization — a role row does not
    // carry one, and inventing one is the collapse this refuses.
    const core = read("packages/client-core/src/actor-context.ts");
    expect(core).toMatch(/organizationId: null/);
  });

  // NB: this counts static CALL SITES, so it proves one shared caller — not
  // one request per session. `useCapability` refetches on a token renewal, a
  // language change or a manual reload, and the provider is not a cache. The
  // checkpoint and the provider both said the stronger thing once; the guard
  // name should not repeat it.
  it("exactly one profile.get call site exists in the whole client", () => {
    const callers = ["src/profile-provider.tsx", "src/context-provider.tsx", "app/(shell)/today.tsx", "app/(shell)/profile.tsx"]
      .filter((f) => read(`apps/mobile/${f}`).includes('useCapability<ProfileGetData>("profile.get")'));
    expect(callers).toEqual(["src/profile-provider.tsx"]);
  });

  it("the participation list REPORTS and does not pretend to switch", () => {
    // A pressable row marked a mode active, persisted it, and changed nothing:
    // no server write, and no surface outside Settings reads the selection.
    // Telling someone they are acting as a company while every request stays
    // identical is worse than the feature being absent (#1737 review).
    expect(settings).not.toContain("switchTo");
    const provider = read("apps/mobile/src/context-provider.tsx");
    expect(provider).not.toContain("switchTo");
    // And with no selection to remember there is no global preference key to
    // leak between accounts on a shared phone.
    // The CODE, not the word. This file's note explains the removed key and
    // why it mattered, and that history is worth keeping readable — three
    // guards in this repo have now fired on their own documentation.
    expect(provider).not.toMatch(/preferenceStore\./);
    expect(provider).not.toMatch(/["']labourmarket\.context\.v1["']/);
    // Active comes from the server's own `activeRole`, not a local choice.
    expect(settings).toContain("profile.state.data.profile.activeRole");
  });

  it("loading, could-not-ask and holds-nothing stay three different states", () => {
    // Rendering a failure as "you hold nothing" was live on the web shell on
    // 2026-08-28. Rendering LOADING that way is the same lie a moment earlier.
    expect(settings).toContain('holdings.status === "unknown"');
    expect(settings).toContain("context.loading");
    expect(settings).toContain("holdings.contexts.length === 0");
    expect(settings).toContain("context.none");
    // And the unavailable arm still renders the NotAvailable block.
    expect(settings).toContain("context.unavailable.title");
  });

  it("every workspace string exists in all five active mobile locales", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    const keys = [
      "workspace.title",
      "workspace.loading",
      "workspace.active",
      "workspace.switching",
      "workspace.failed.title",
      "workspace.failed.body",
      "workspace.pointerUnavailable",
      "workspace.switchFailed",
      "context.loading",
      "context.active",
      "context.none",
    ];
    for (const key of keys) {
      const occurrences = messages.split(`"${key}":`).length - 1;
      expect(occurrences, `${key} appears ${occurrences}× — expected one per active locale`).toBe(5);
    }
  });
});
