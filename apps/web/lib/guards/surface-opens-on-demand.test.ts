import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * "WE BUILT A CAPABILITY, THEREFORE WE RENDER ITS ENTIRE UI."
 *
 * The owner audit named /dashboard/network as the proof of this anti-pattern:
 * a page whose job is to answer "who am I connected to?" also unrolled, for
 * every visitor, approval templates, multi-stage workflow configuration,
 * default-workflow installation, the employee-request register, leave limits,
 * development conversations and management decisions.
 *
 * The cost was never only cognitive. Each of those four sections issues its
 * own server reads — and RequestsSection issues one leave-policy query PER
 * member organization — so the reader who only wanted to see who invited them
 * paid for the whole governance stack on every page load. That is why these
 * assertions are about FETCHING, not about markup: hiding the sections behind
 * a `<details>` would satisfy a CSS-shaped test while leaving the real defect
 * in place.
 *
 * Nothing here forbids the capability. It forbids serving it unasked.
 */

const web = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8");

const NETWORK_PAGE = "app/[locale]/dashboard/network/page.tsx";

describe("administration opens on demand, it is not served by default", () => {
  const src = read(NETWORK_PAGE);

  it("still owns every administration section — nothing was deleted", () => {
    for (const section of [
      "ApprovalsSection",
      "RequestsSection",
      "DevelopmentReviewsSection",
      "ManagementDecisionsSection",
    ]) {
      expect(src, `${section} must remain reachable from this surface`).toContain(
        section,
      );
    }
  });

  it("gates them on an explicit area, so the default screen fetches none of them", () => {
    expect(src).toContain("ADMIN_AREAS");
    expect(src).toContain("openArea");
    // The four sections may only be rendered inside the opened-area branch.
    const openIndex = src.indexOf("if (openArea)");
    expect(openIndex, "the opened-area branch must exist").toBeGreaterThan(-1);
    const defaultBody = src.slice(src.indexOf("const search = q ?"));
    for (const section of [
      "<ApprovalsSection",
      "<RequestsSection",
      "<DevelopmentReviewsSection",
      "<ManagementDecisionsSection",
    ]) {
      expect(
        defaultBody,
        `${section} is rendered on the default relationship screen — it must render only under ?area=`,
      ).not.toContain(section);
    }
  });

  it("an outcome notice re-opens its own area, so a completed action is never silent", () => {
    // A form inside approvals redirects back to ?wf=…; if the area did not
    // reopen, the reader would land on a screen that looks like nothing
    // happened.
    expect(src).toContain('workflowNotice ? "approvals"');
    expect(src).toContain('requestNotice ? "requests"');
    expect(src).toContain('rev ? "reviews"');
    expect(src).toContain('dec ? "decisions"');
  });

  it("the relationship reads do not run when an administration area is open", () => {
    // The org list is shared (both screens need it). Everything else belongs
    // to the relationship screen and must sit AFTER the early return.
    const early = src.indexOf("if (openArea)");
    for (const read of [
      "listMyEngagements()",
      "listInvitationsForMe()",
      "listMySentInvitations()",
      "listMyTeamEnquiries()",
    ]) {
      expect(
        src.indexOf(read),
        `${read} runs before the administration early-return — an admin area must not pay for the relationship screen`,
      ).toBeGreaterThan(early);
    }
  });
});

describe("forms open after an explicit action", () => {
  it("the invite form is closed until asked for, but a deep link still opens it", () => {
    const src = read("components/app/invite-panel.tsx");
    // Closed by default…
    expect(src).toContain("const [open, setOpen] = useState(");
    // …unless the caller already named what to invite (?invite=1&type=…&org=…),
    // which is itself the explicit action and a real entry point.
    expect(src).toContain(
      "Boolean(defaultType || defaultOrganizationId || defaultProjectId)",
    );
    expect(src).toContain('data-testid="invite-panel-open"');
  });
});

/**
 * A notification that names an event must land the reader on the thing the
 * event was about. Production held four `interested` signals, none ever
 * marked reviewed, while the page the notification opens auto-selected an
 * arbitrary demand.
 */
describe("the interest notification is not a dead end", () => {
  const src = read("app/[locale]/dashboard/company/scouting/page.tsx");

  it("opens on the demand somebody is actually waiting on", () => {
    expect(src).toContain("listPendingInterestCountsForCompany");
    expect(src).toContain("mostAwaited");
    // An explicit ?request= must still win — this only replaces the guess.
    const sel = src.slice(src.indexOf("const selected ="));
    expect(sel.indexOf("request ??")).toBeLessThan(sel.indexOf("mostAwaited ??"));
  });

  it("shows how many are waiting per demand, so the employer need not open each one", () => {
    expect(src).toContain("scouting-demand-interest-");
  });

  it("counts only people still waiting — never reviewed, contacted or withdrawn", () => {
    const reader = read("lib/opportunities/interest.ts");
    const fn = reader.slice(reader.indexOf("listPendingInterestCountsForCompany"));
    expect(fn).toContain('.eq("status", "interested")');
  });

  it("degrades to an empty map when the owner-gated table is absent", () => {
    const reader = read("lib/opportunities/interest.ts");
    const fn = reader.slice(
      reader.indexOf("export async function listPendingInterestCountsForCompany"),
    );
    // No throw, no error shape — the page keeps its previous selection rule.
    expect(fn).toContain("return empty");
    expect(fn).toContain("catch");
  });
});

/**
 * SERIAL READS ARE A FEATURE OF HOW THE FILE WAS TYPED, NOT OF THE DATA.
 *
 * /dashboard/company held ~40 top-level `await`s, almost all of them
 * independent reads written on consecutive lines, so the page paid the SUM of
 * their latencies before rendering anything. That is the measured answer to
 * the owner's "project/product windows feel slow" (audit §12: measure, do not
 * guess) — not bundle size, not hydration: queueing.
 *
 * A ratchet rather than an exact count: batching more is always allowed,
 * un-batching is what must be caught. `getTranslations` is excluded — next-intl
 * memoizes it per request, so it is not a round trip.
 */
describe("the heaviest dashboard does not queue its reads", () => {
  const src = read("app/[locale]/dashboard/company/page.tsx");

  /** Top-level `const x = await …` data reads, excluding batched ones. */
  const serialReads = src
    .split("\n")
    .filter((l) => /^ {2}(const|let)[^=]*= await /.test(l))
    .filter((l) => !l.includes("getTranslations"))
    .filter((l) => !l.includes("Promise.all"));

  const SERIAL_READ_BASELINE = 3;

  it(`keeps top-level serial reads at or below ${SERIAL_READ_BASELINE}`, () => {
    expect(
      serialReads.length,
      `serial top-level reads grew — independent reads belong in one Promise.all.\nFound:\n${serialReads.join("\n")}`,
    ).toBeLessThanOrEqual(SERIAL_READ_BASELINE);
  });

  it("batches the independent reads instead", () => {
    const batches = src.match(/await Promise\.all\(/g) ?? [];
    expect(batches.length).toBeGreaterThanOrEqual(3);
  });
});

/**
 * AN UNNAMED ORGANIZATION MUST NOT BECOME AN EMPTY ONE.
 *
 * `getOwnedOrganizations` reports a missing name as the EMPTY STRING — right
 * for a data module, and the fix for the literal "—" it used to substitute.
 * But this page hands that array straight to the approvals and requests
 * sections, which put the name in a `<select>` option, in a
 * "mark overdue — {org}" button and in a per-template suffix. Passing "" down
 * turns those into a blank option and a trailing dash: a different defect
 * wearing the fix's clothes.
 *
 * It is also why the owner audit reported "duplicated approval templates".
 * Production holds 16 workflow definitions = eight defaults x TWO
 * organizations, and both of those organizations are the owner's own unnamed
 * ones. The rows were never duplicates — their two owners were
 * indistinguishable.
 */
describe("an organization with no name still has a label", () => {
  const src = read(NETWORK_PAGE);

  it("resolves the label once, before any section receives the list", () => {
    const build = src.slice(
      src.indexOf("const organizations ="),
      src.indexOf("const organizations =") + 900,
    );
    expect(build).toContain('t("organizations.unnamed")');
  });

  it("numbers them only when more than one is nameless", () => {
    // A single unnamed company must read plainly, with no stray "1" — the
    // same rule the workspace switcher uses.
    expect(src).toContain("filter((x) => !x.name).length > 1");
  });

  it("carries the fallback sentence in every active locale", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de"]) {
      const messages = JSON.parse(read(`messages/${loc}.json`));
      const value = messages.network?.organizations?.unnamed;
      expect(
        typeof value,
        `${loc} is missing network.organizations.unnamed`,
      ).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it("no longer hardcodes a punctuation glyph as a company name", () => {
    const data = read("lib/company/owned-organizations.ts");
    // Assert the MAPPER, not the whole file — the module's own comment
    // explains the old em-dash fallback and must stay quotable.
    const mapper = data.slice(
      data.indexOf("const organizations: OwnedOrganization[] = rows.map"),
      data.indexOf('return { kind: "ok", organizations };'),
    );
    expect(mapper.length, "mapper not found — re-anchor this guard").toBeGreaterThan(50);
    expect(
      mapper,
      'the em-dash fallback is what produced the "—" rows in the switcher',
    ).not.toContain('"\u2014"');
    // Absence is reported as absence; each surface localizes it.
    expect(mapper).toContain('""');
  });
});

/**
 * GATING A SURFACE IS ONLY HALF THE JOB.
 *
 * Approvals, employee requests and leave limits now open on an explicit
 * `?area=` instead of unrolling under every visit to /dashboard/network. The
 * owner named the other half in the same breath: "Chat must also be able to
 * route users to these functions naturally", with three literal examples.
 * Those three are pinned here, because a capability that is one click away but
 * unreachable in words has been hidden, not rehomed.
 *
 * The routing uses the EXISTING `link:` chip, which the conversation layer
 * already sanctions for "contextual navigation to a REAL canonical surface" —
 * it goes to the one screen and never grows a second view of it.
 */
describe("the surfaces that moved are still reachable in words", () => {
  const OWNER_EXAMPLES: readonly (readonly [string, string])[] = [
    ["noriu pateikti atostogų prašymą", "admin-requests"],
    ["noriu pateikti atostogu prasyma", "admin-requests"], // no diacritics
    ["ką turiu patvirtinti?", "admin-approvals"],
    ["parodyk laukiančius sprendimus", "admin-approvals"],
    ["what do i need to approve", "admin-approvals"],
    ["leave request", "admin-requests"],
    ["хочу подать заявление на отпуск", "admin-requests"],
  ];

  for (const [sentence, intent] of OWNER_EXAMPLES) {
    it(`"${sentence}" → ${intent}`, () => {
      expect(classifyIntent(sentence).intent).toBe(intent);
    });
  }

  it("routes to the gated area, not to a second copy of the screen", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toContain("link:/dashboard/network?area=approvals");
    expect(chat).toContain("link:/dashboard/network?area=requests");
  });

  it("steals none of the intents that already worked", () => {
    const UNCHANGED: readonly (readonly [string, string])[] = [
      ["reikia darbuotojų", "need-workers"],
      ["ieškau darbo", "find-work"],
      ["kokias galimybes man gali pasiūlyti?", "opportunities"],
      ["kas susidomėjo mano poreikiu?", "interest-inbox"],
      ["parodyk mano projektus", "open-project"],
    ];
    for (const [sentence, intent] of UNCHANGED) {
      expect(classifyIntent(sentence).intent, sentence).toBe(intent);
    }
  });

  it("carries all three routing strings in every active locale", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de"]) {
      const messages = JSON.parse(read(`messages/${loc}.json`));
      const chat = messages.conversation?.chat ?? {};
      for (const key of ["adminRouteHint", "adminApprovalsChip", "adminRequestsChip"]) {
        expect(typeof chat[key], `${loc} is missing conversation.chat.${key}`).toBe(
          "string",
        );
        expect(chat[key].trim().length).toBeGreaterThan(0);
      }
    }
  });
});
