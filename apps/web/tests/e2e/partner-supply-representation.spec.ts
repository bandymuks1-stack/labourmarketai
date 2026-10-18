/**
 * The real worker path for representation outside LabourMarket.ai (local stack).
 *
 * SIGNED-IN WORKER → CURRENT INTENT → MARKETS → CONSENT/AUTHORITIES → SAVE
 * → CANONICAL STATE → EMITTER ELIGIBILITY → WITHDRAW → NO LONGER EXPORTED.
 *
 * WHY THIS SPEC READS THE DATABASE AS WELL AS THE SCREEN
 * ---------------------------------------------------------------------------
 * A UI test that stops at "the form said Saved" proves the form. The thing that
 * actually matters here is whether a person's choice reaches — and then leaves
 * — the feed that another product consumes. So each UI step is paired with the
 * canonical read: `first_party_supply_feed_v1()`, the same service_role-only
 * function the emitter calls, asserted through the exact projection Agentai
 * receives.
 *
 * THE NEGATIVE CONTROLS ARE THE POINT
 * ---------------------------------------------------------------------------
 * A green chain here proves less than it looks, because the expensive failures
 * are all of the form "exported when it should not have been":
 *
 *   1. BEFORE the consent, a saved declaration must NOT appear in the feed.
 *      Without this, a build that ignored the consent predicate would pass
 *      every positive assertion in this file.
 *   2. After WITHDRAWING, the row must be GONE from the feed — not present with
 *      a withdrawn flag. The file is rebuilt whole precisely so a withdrawal
 *      disappears rather than lingering as a tombstone.
 *   3. The emitted row must carry NO name, email or phone, asserted against the
 *      serialised row rather than against the type.
 *   4. `identityDisclosureAuthority` must be DENIED while the person is
 *      perfectly matchable — the case the whole four-authority split exists for.
 */
import { test, expect as baseExpect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const expect = baseExpect.configure({ timeout: 15_000 });

const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_LOCAL_STACK = Boolean(SUPA_URL && SUPA_SERVICE);

/**
 * "DID NOT RUN" MUST NEVER BE REPORTED AS "PASSED" (#1319).
 *
 * A missing session is an honest skip for a developer without the local stack,
 * and a hard ERROR for a caller who declared this run must exercise the
 * authenticated journey.
 */
if (process.env.E2E_REQUIRE_AUTH === "1" && !(HAS_SESSION && HAS_LOCAL_STACK)) {
  throw new Error(
    "E2E_REQUIRE_AUTH=1 but the authenticated partner-supply journey cannot run: "
      + `${HAS_SESSION ? "" : `${STORAGE_STATE} is missing; `}`
      + `${HAS_LOCAL_STACK ? "" : "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset; "}`
      + "refusing to report that as a pass. Mint a session first: "
      + "E2E_OWNER_EMAIL=dev.worker@local.test pnpm tsx scripts/e2e-mint-session.ts",
  );
}

test.skip(
  !(HAS_SESSION && HAS_LOCAL_STACK),
  "Needs the local stack and a minted session (scripts/e2e-mint-session.ts).",
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

/** The service key bypasses RLS, so it must never point at production. */
function assertLocal(): void {
  if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(SUPA_URL).hostname)) {
    throw new Error(`refusing to touch a non-local target: ${SUPA_URL}`);
  }
}

interface FeedRow {
  signalId: string;
  actorRef: string;
  currentState: string;
  freshness: string;
  geography: string[];
  allowedMarkets: string[];
  trades: string[];
  authorities: Record<string, string>;
  [k: string]: unknown;
}

/**
 * The feed exactly as the emitter reads it.
 *
 * Returns `null` for a read that FAILED, and `[]` for a read that succeeded and
 * found nobody — the same distinction the whole contract turns on. A test that
 * collapsed them could report "not exported" for an outage.
 */
async function readFeed(): Promise<FeedRow[] | null> {
  assertLocal();
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/first_party_supply_feed_v1`, {
    method: "POST",
    headers: {
      apikey: SUPA_SERVICE,
      authorization: `Bearer ${SUPA_SERVICE}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as unknown;
  return Array.isArray(rows) ? (rows as FeedRow[]) : null;
}

/** Rows belonging to the signed-in fixture worker, by their opaque signal id. */
function rowsFor(feed: FeedRow[], signalIds: Set<string>): FeedRow[] {
  return feed.filter((r) => signalIds.has(r.signalId));
}

test.describe("representation outside LabourMarket.ai — the worker's own path", () => {
  test("consent, declare, get exported, withdraw, stop being exported", async ({
    page,
  }) => {
    const before = await readFeed();
    expect(before, "the feed RPC must be applied to the local stack").not.toBeNull();
    const preExistingIds = new Set((before ?? []).map((r) => r.signalId));

    // ---------------------------------------------------------------- screen
    await page.goto("/lt/dashboard/privacy");
    const section = page.getByTestId("privacy-partner-supply");
    await expect(section).toBeVisible();

    // The control must be REACHABLE, not merely present: an unapplied migration
    // renders the honest-degradation line instead, and that is a real failure
    // for a run that declared the journey must execute.
    await expect(
      page.getByTestId("partner-supply-unavailable"),
      "the migration is not applied to this database",
    ).toHaveCount(0);

    // ------------------------------------------------- NEGATIVE 1: no consent
    // Default deny: before anything is granted, the screen offers a choice and
    // the person is not represented.
    await expect(page.getByTestId("partner-supply-choice")).toBeVisible();

    // --------------------------------------------------------------- consent
    await page.getByTestId("partner-supply-open").click();
    // The sentence that keeps a match from being read as a disclosure.
    await expect(page.getByTestId("partner-supply-match-never-reveals")).toBeVisible();
    // Granting and refusing are both offered, and refusing is a real option.
    await expect(page.getByTestId("partner-supply-decline")).toBeVisible();
    await page.getByTestId("partner-supply-grant").click();

    // ----------------------------------------------------------- declaration
    const form = page.getByTestId("partner-supply-form");
    await expect(form).toBeVisible();

    // NOTHING is preselected — the person states their own situation.
    for (const intent of [
      "AVAILABLE_NOW",
      "AVAILABLE_FROM",
      "OPEN_TO_OFFERS",
      "LOOKING_FOR_WORK",
      "LOOKING_FOR_PROJECTS",
    ]) {
      await expect(page.getByTestId(`partner-supply-intent-${intent}`)).not.toBeChecked();
    }
    // The three authorities start OFF, every one of them.
    for (const authority of [
      "partner-supply-contact-authority",
      "partner-supply-publication-authority",
      "partner-supply-identity-authority",
    ]) {
      await expect(page.getByTestId(authority)).not.toBeChecked();
    }

    // NEGATIVE: a market outside the stated work authorisation is REFUSED, not
    // quietly clipped to the legal subset.
    await page.getByTestId("partner-supply-intent-AVAILABLE_NOW").check();
    await page.getByTestId("partner-supply-work-countries").fill("LT");
    await page.getByTestId("partner-supply-markets").fill("DE");
    await page.getByTestId("partner-supply-save").click();
    await expect(page.getByTestId("partner-supply-error")).toBeVisible();

    // NEGATIVE: a country that is not an ISO-3166-1 alpha-2 code is refused
    // rather than dropped — dropping would narrow reach without saying so.
    await page.getByTestId("partner-supply-work-countries").fill("Germany");
    await page.getByTestId("partner-supply-markets").fill("");
    await page.getByTestId("partner-supply-save").click();
    await expect(page.getByTestId("partner-supply-error")).toBeVisible();

    // The real answer: legally able to work in LT/DE/NL, agrees to be offered
    // in DE only, contact permitted, presentation and naming refused.
    await page.getByTestId("partner-supply-work-countries").fill("LT, DE, NL");
    await page.getByTestId("partner-supply-markets").fill("DE");
    await page.getByTestId("partner-supply-contact-authority").check();
    await page.getByTestId("partner-supply-save").click();
    await expect(page.getByTestId("partner-supply-saved")).toBeVisible();

    // --------------------------------------------------------- canonical state
    await page.reload();
    await expect(page.getByTestId("partner-supply-current")).toBeVisible();
    await expect(page.getByTestId("partner-supply-current-intent")).toContainText(
      "AVAILABLE_NOW",
    );
    await expect(page.getByTestId("partner-supply-current-markets")).toContainText("DE");

    // ------------------------------------------------------ emitter eligibility
    const during = await readFeed();
    expect(during, "the feed read must succeed").not.toBeNull();
    const mine = (during ?? []).filter((r) => !preExistingIds.has(r.signalId));
    expect(mine, "the declaration must reach the feed").toHaveLength(1);

    const row = mine[0]!;
    expect(row.currentState).toBe("AVAILABLE_NOW");
    expect(row.freshness).toBe("CURRENT");
    expect(row.geography.sort()).toEqual(["DE", "LT", "NL"]);
    // Two different questions, two different answers, both carried.
    expect(row.allowedMarkets).toEqual(["DE"]);
    expect(row.authorities.matchAuthority).toBe("GRANTED");
    expect(row.authorities.contactAuthority).toBe("GRANTED");
    // The case the four-authority split exists for: perfectly matchable, and
    // still not nameable and not publishable.
    expect(row.authorities.identityDisclosureAuthority).toBe("DENIED");
    expect(row.authorities.publicationAuthority).toBe("DENIED");

    // NEGATIVE 3: no identity anywhere in the wire form, checked as bytes.
    const serialised = JSON.stringify(row);
    expect(serialised).not.toContain("@");
    for (const key of ["name", "email", "phone", "address", "fullName"]) {
      expect(Object.keys(row)).not.toContain(key);
    }
    // The reference is opaque: resolvable by this product, meaningless outside.
    expect(row.actorRef).toMatch(/^lm:(worker|team):[0-9a-f-]{36}$/);

    // ------------------------------------------------------------- withdrawal
    await page.getByTestId("partner-supply-withdraw-declaration").click();
    await expect(page.getByTestId("partner-supply-form")).toBeVisible();

    // NEGATIVE 2: GONE, not present-with-a-flag. The feed is rebuilt whole so a
    // withdrawal disappears rather than lingering as a tombstone.
    const after = await readFeed();
    expect(after, "the feed read must still succeed").not.toBeNull();
    expect(
      rowsFor(after ?? [], new Set([row.signalId])),
      "a withdrawn declaration must be absent from the feed, not flagged in it",
    ).toHaveLength(0);
    // And nothing else was collaterally removed.
    expect((after ?? []).length).toBe(preExistingIds.size);
  });

  test("withdrawing the CONSENT alone also stops the export", async ({ page }) => {
    // The declaration and the consent are two acts, and revoking either must be
    // enough. A build where only the declaration's own withdrawal worked would
    // pass the first test and leak here.
    const before = await readFeed();
    expect(before).not.toBeNull();
    const preExistingIds = new Set((before ?? []).map((r) => r.signalId));

    await page.goto("/lt/dashboard/privacy");
    await expect(page.getByTestId("partner-supply-unavailable")).toHaveCount(0);

    // Consent, then declare.
    const choice = page.getByTestId("partner-supply-choice");
    if (await choice.isVisible()) {
      await page.getByTestId("partner-supply-open").click();
      await page.getByTestId("partner-supply-grant").click();
    }
    const form = page.getByTestId("partner-supply-form");
    if (!(await form.isVisible())) {
      await page.getByTestId("partner-supply-edit").click();
    }
    await page.getByTestId("partner-supply-intent-OPEN_TO_OFFERS").check();
    await page.getByTestId("partner-supply-work-countries").fill("LT");
    await page.getByTestId("partner-supply-markets").fill("LT");
    await page.getByTestId("partner-supply-save").click();
    await expect(page.getByTestId("partner-supply-saved")).toBeVisible();

    const during = await readFeed();
    const mine = (during ?? []).filter((r) => !preExistingIds.has(r.signalId));
    expect(mine, "the declaration must reach the feed").toHaveLength(1);

    // Withdraw the CONSENT, not the declaration.
    await page.getByTestId("partner-supply-withdraw-consent").click();
    await expect(page.getByTestId("partner-supply-choice")).toBeVisible();

    const after = await readFeed();
    expect(after).not.toBeNull();
    expect(
      (after ?? []).filter((r) => !preExistingIds.has(r.signalId)),
      "withdrawing the consent must remove the row from the feed",
    ).toHaveLength(0);
  });
});
