import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { disclosureHashTarget } from "@/components/app/details-hash-opener";

/**
 * PROFILE — SUMMARY FIRST, DETAILS ON DEMAND (owner P0/P1 §17, 2026-09-23).
 *
 * `/dashboard/profile` had grown into a long open sheet by accretion: every
 * "rendered but not reachable" fix (#1770 offers, #1771 linked history, #1773
 * the learner's compass) hoisted a WHOLE section open above the fold, and the
 * editors (avatar upload, the composer with its CV input, the skill-clarify
 * form) all stood open on arrival. The owner saw it as a second, legacy
 * application under the new chrome.
 *
 * The default view is now summary → current state → action → expandable
 * detail. OPEN on arrival: the header, a pending roster offer (somebody is
 * waiting on it), the organization-history SUMMARY line (in its bar's closed
 * state), the learner's compass, and the ONE overview. Everything else is a
 * closed, one-tap bar — and every deep link that pointed at a section still
 * lands on it OPEN, because each bar has a `DetailsHashOpener` that resolves a
 * hash naming the bar or ANY section inside it.
 *
 * This guard pins the composition from the source AND proves the opener's
 * decision against the page's real nesting (the pure `disclosureHashTarget`
 * the component itself calls), with negative controls: a hash aimed at
 * something outside a bar must NOT open it.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const PAGE = read("app/[locale]/dashboard/profile/page.tsx");

/** The page's `<details id=…>` blocks, source-sliced to their own close. */
function block(id: string): { start: number; end: number; text: string } {
  const start = PAGE.indexOf(`id="${id}"`);
  expect(start, `<details id="${id}"> exists`).toBeGreaterThan(-1);
  // The id sits on the <details> element itself.
  const open = PAGE.lastIndexOf("<details", start);
  expect(PAGE.slice(open, start)).not.toContain(">");
  const end = PAGE.indexOf("</details>", start);
  const text = PAGE.slice(start, end);
  // No nested <details> in the page source, so the first close is ours.
  expect(text, `${id} holds no nested <details> literal`).not.toContain("<details");
  return { start: open, end, text };
}

const DISCLOSURES = [
  "organization-history",
  "profile-edit",
  "cv-details",
  "capabilities",
  "profile-about",
] as const;

describe("what stands OPEN on arrival — summary, current state, action", () => {
  const blocks = DISCLOSURES.map(block);
  const insideAny = (at: number) => blocks.some((b) => at > b.start && at < b.end);

  for (const mount of ["<RosterLinkOffers", "<LearningCompassSection", "<ProfileHubOverview"]) {
    it(`${mount} is not inside any disclosure`, () => {
      const at = PAGE.indexOf(mount);
      expect(at, `${mount} is mounted`).toBeGreaterThan(-1);
      expect(insideAny(at), `${mount} must stand open on arrival`).toBe(false);
    });
  }

  it("the organization-history SUMMARY is in its bar's <summary> (visible while closed)", () => {
    const b = block("organization-history");
    const summary = b.text.slice(0, b.text.indexOf("</summary>"));
    expect(summary).toContain("<OrganizationEvidenceSummary");
  });

  it("reading order: offer → history bar → compass → overview → edit → details → capabilities → about", () => {
    const order = [
      PAGE.indexOf("<RosterLinkOffers"),
      PAGE.indexOf('id="organization-history"'),
      PAGE.indexOf("<LearningCompassSection"),
      PAGE.indexOf("<ProfileHubOverview"),
      PAGE.indexOf('id="profile-edit"'),
      PAGE.indexOf('id="cv-details"'),
      PAGE.indexOf('id="capabilities"'),
      PAGE.indexOf('id="profile-about"'),
    ];
    for (const at of order) expect(at).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("the profile carries no quick-nav strip (IA 01 §4 'REMOVE (worker)') — /cv keeps its own", () => {
    expect(PAGE).not.toMatch(/<PageQuickNav\b/);
    expect(PAGE).not.toMatch(/from "@\/components\/app\/page-quick-nav"/);
    expect(read("app/[locale]/cv/page.tsx")).toMatch(/<PageQuickNav\b/);
  });
});

describe("every moved section lives INSIDE its disclosure", () => {
  const cases: ReadonlyArray<[string, readonly string[]]> = [
    [
      "organization-history",
      [
        "<OrganizationEvidenceSection",
        "<OrganizationHistorySkillSuggestionsSection",
        "<RosterLinkWithdrawals links={myOrgEvidence.links} />",
        "<TeamLinkWithdrawals result={myTeamLinks} />",
      ],
    ],
    ["profile-edit", ["<ProfileTextFirstFlow", "<WorkerTradeProfile"]],
    ["cv-details", ['id="profile-identity"', "<ProfileAvatar", 'id="cv-availability"', "<WorkCardEditor"]],
    ["capabilities", ["<CapabilityProfileSection", 'id="candidate-skills"', "<SkillClarifySection"]],
    ["profile-about", ["<TrustBlock", "<FeatureNote"]],
  ];

  for (const [id, mounts] of cases) {
    it(`#${id} holds ${mounts.join(", ")}`, () => {
      const { text } = block(id);
      for (const m of mounts) expect(text, `${m} inside #${id}`).toContain(m);
    });

    it(`#${id} has its DetailsHashOpener, and the moved sections exist ONCE`, () => {
      expect(PAGE).toContain(`<DetailsHashOpener targetId="${id}" />`);
      for (const m of mounts) {
        if (m === "<OrganizationEvidenceSection") continue; // two mounts by design — next test
        // Negative control: nothing was left behind as a second, open copy.
        expect(PAGE.split(m).length - 1, `${m} mounted once`).toBe(1);
      }
    });
  }

  it("the evidence card's OTHER mount is only the empty / not-enabled state inside #cv-details", () => {
    // Two mounts by design: the records inside `#organization-history`, and —
    // when there are none — the quiet "nothing recorded" card among the
    // personal details. Never a second, open copy of the records.
    expect(PAGE.split("<OrganizationEvidenceSection").length - 1).toBe(2);
    const details = block("cv-details").text;
    const at = details.indexOf("<OrganizationEvidenceSection");
    expect(at).toBeGreaterThan(-1);
    expect(details.slice(at, details.indexOf("/>", at))).toContain("records={[]}");
  });
});

describe("DetailsHashOpener's decision, proven against the page's REAL nesting", () => {
  /** Ids a component contributes where it is mounted (read from its source,
   *  so a renamed id fails here rather than silently modelling nothing). */
  const COMPONENT_IDS: Readonly<Record<string, [string, string]>> = {
    "<RosterLinkWithdrawals": ["components/app/organization-evidence-section.tsx", "roster-link-withdrawals"],
    "<TeamLinkWithdrawals": ["components/app/roster-link-end.tsx", "team-link-withdrawals"],
    "<LearningCompassSection": ["components/app/learning-compass-section.tsx", "learning-compass"],
  };

  function idsIn(text: string): Set<string> {
    const ids = new Set([...text.matchAll(/\bid="([a-z0-9-]+)"/g)].map((m) => m[1]));
    for (const [mount, [file, id]] of Object.entries(COMPONENT_IDS)) {
      if (text.includes(mount)) {
        expect(read(file), `${file} still renders id="${id}"`).toContain(`id="${id}"`);
        ids.add(id);
      }
    }
    return ids;
  }

  const allIds = idsIn(PAGE);
  const children = new Map(DISCLOSURES.map((id) => [id, idsIn(block(id).text)]));
  const byId = (id: string) => (allIds.has(id) ? id : null);
  const contains = (outer: string, inner: string) =>
    outer !== inner && (children.get(outer as (typeof DISCLOSURES)[number])?.has(inner) ?? false);
  const opens = (hash: string, disclosure: string) =>
    disclosureHashTarget(hash, disclosure, disclosure, byId, contains);

  const POSITIVE: ReadonlyArray<[string, string]> = [
    // The bar itself.
    ["#organization-history", "organization-history"],
    ["#profile-edit", "profile-edit"],
    ["#cv-details", "cv-details"],
    ["#capabilities", "capabilities"],
    ["#profile-about", "profile-about"],
    // A section INSIDE a bar — the nested case every moved section relies on.
    ["#profile-identity", "cv-details"],
    ["#cv-availability", "cv-details"],
    ["#cv-languages", "cv-details"],
    ["#candidate-skills", "capabilities"],
    ["#roster-link-withdrawals", "organization-history"],
    ["#team-link-withdrawals", "organization-history"],
  ];

  for (const [hash, disclosure] of POSITIVE) {
    it(`${hash} opens #${disclosure}`, () => {
      const target = opens(hash, disclosure);
      expect(target).toBe(hash.slice(1));
    });
  }

  const NEGATIVE: ReadonlyArray<[string, string]> = [
    // A section that lives in ANOTHER bar must not open this one.
    ["#candidate-skills", "cv-details"],
    ["#profile-identity", "capabilities"],
    ["#cv-availability", "organization-history"],
    ["#roster-link-withdrawals", "profile-about"],
    // A section that stands OPEN on arrival opens no bar at all.
    ["#learning-compass", "cv-details"],
    ["#learning-compass", "profile-edit"],
    ["#profile-top", "capabilities"],
    // Nonsense and emptiness open nothing.
    ["#no-such-section", "cv-details"],
    ["#", "cv-details"],
    ["", "cv-details"],
  ];

  for (const [hash, disclosure] of NEGATIVE) {
    it(`${hash || "(empty hash)"} does NOT open #${disclosure}`, () => {
      expect(opens(hash, disclosure)).toBeNull();
    });
  }

  it("the model is not vacuous: every bar resolved at least one id inside it", () => {
    for (const id of ["organization-history", "cv-details", "capabilities"] as const) {
      expect(children.get(id)?.size ?? 0, `#${id} children`).toBeGreaterThan(0);
    }
  });

  it("the component calls the same decision it is proven by here", () => {
    const opener = read("components/app/details-hash-opener.tsx");
    expect(opener).toMatch(/const target = disclosureHashTarget<HTMLElement>\(/);
    expect(opener).toContain("if (!el.open) el.open = true;");
  });

  it("the same link tapped again re-opens the bar — the tap is the signal, not only hashchange", () => {
    // `hashchange` never fires for an unchanged hash (nor for a router
    // pushState), so a closed bar would ignore a second tap on its own link.
    const opener = read("components/app/details-hash-opener.tsx");
    expect(opener).toMatch(/document\.addEventListener\("click", onLinkClick\)/);
    expect(opener).toMatch(/document\.removeEventListener\("click", onLinkClick\)/);
    expect(opener).toMatch(/applyHash\(link\.hash\)/);
    // Only a same-page link, only a plain click — never a new tab or another page.
    expect(opener).toMatch(/link\.pathname !== window\.location\.pathname/);
    expect(opener).toMatch(/event\.metaKey \|\| event\.ctrlKey/);
    // Negative control: the hashchange path is still there.
    expect(opener).toMatch(/window\.addEventListener\("hashchange", onHashChange\)/);
  });
});

describe("the organization record card is progressive", () => {
  it("the ribbon stays on the row, the month list moves into the record's disclosure", () => {
    const share = read("components/app/period-monthly-share.tsx");
    expect(share).toMatch(/part = "all"/);
    // Default draws both halves, so every other caller is unchanged.
    expect(share).toMatch(/part !== "months" \? \(/);
    expect(share).toMatch(/part !== "ribbon" \? \(/);
    const card = read("components/app/organization-evidence-section.tsx");
    expect(card).toMatch(/part="ribbon"/);
    expect(card).toMatch(/part="months"/);
    // The organization-side import preview keeps its full view.
    expect(read("components/app/evidence-import-section.tsx")).not.toMatch(/part="/);
  });

  it("the history card inside the bar does not repeat the bar's title", () => {
    const b = block("organization-history");
    expect(b.text).toMatch(/showTitle=\{false\}/);
  });
});

describe("dead-end deep links into the profile are gone", () => {
  const chat = read("components/app/conversation/chat/conversation-chat.tsx");

  it("'set profession' lands on the section that sets it", () => {
    const chips = [...chat.matchAll(/\{ id: "([^"]+)", label: t\("professionStatement\.chipSetProfession"\) \}/g)];
    expect(chips.length).toBe(3);
    for (const [, id] of chips) expect(id).toBe("link:/dashboard/profile#profile-edit");
  });

  it("…and the flow starts in the profession picker when there is no profession", () => {
    const flow = read("components/app/profile-text-first-flow.tsx");
    expect(flow).toMatch(
      /useState<"compose" \| "review" \| "manual">\(\s*!hasPrimaryProfession && manualSlot \? "manual" : "compose",\s*\)/,
    );
    // Negative control: the picker is still only reachable where it exists.
    expect(flow).toMatch(/if \(stage === "manual" && manualSlot\)/);
    expect(PAGE).toMatch(/hasPrimaryProfession=\{currentProfessionId !== null\}/);
  });
});

describe("one form of address on the profile hub (LT)", () => {
  const lt = JSON.parse(read("messages/lt.json")) as Record<string, Record<string, unknown>>;
  const flat = (node: unknown, prefix = "", out: Record<string, string> = {}) => {
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) flat(v, `${prefix}${k}.`, out);
    } else if (typeof node === "string") out[prefix.slice(0, -1)] = node;
    return out;
  };
  // Formal second-person forms the informal player card does not use.
  const FORMAL = /\b(jūs|jus|jūsų|jums|galite|tinkate|pasirinkite|papasakokite|nurodykite|pažymėkite|patikrinkite|patvirtinkite|įkelkite|ieškote|norite|neįrašėte|papildykite)\b/i;

  it("the hub's namespaces read 'tu' like the player card rendered inside it", () => {
    const hub = {
      ...flat(lt.profileHub, "profileHub."),
      ...flat((lt.setupJourney as Record<string, unknown>).steps, "setupJourney.steps."),
      ...flat(lt.profileState, "profileState."),
      ...flat((lt.skills as Record<string, unknown>).reviewBanner, "skills.reviewBanner."),
      ...flat((lt.playerCard as Record<string, unknown>).live, "playerCard.live."),
    };
    const formal = Object.entries(hub).filter(([, v]) => FORMAL.test(v));
    expect(formal, formal.map(([k, v]) => `${k}: ${v}`).join("\n")).toEqual([]);
    // Positive control: the regex does catch the old wording.
    expect(FORMAL.test("Štai ką apie jus jau žinome.")).toBe(true);
  });
});
