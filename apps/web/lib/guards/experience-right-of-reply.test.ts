import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A RIGHT OF REPLY NOBODY CAN SEE IS NOT A RIGHT OF REPLY.
 *
 * `experience_responses` shipped with the v1 experience migration, a
 * `submit_experience_response` SECURITY DEFINER RPC, a select policy, a form
 * component and a mounted form. Everything a person needed in order to answer
 * an account written about them — except a reader. Nothing in the product ever
 * selected from that table, so a submitted reply was visible to nobody,
 * including its own author.
 *
 * That is EVID-6 in the capability register and SEP-8 in the separations: the
 * data existed, was reachable by RLS, was writable, and was never once
 * rendered. A green suite said nothing, because no test asked the only question
 * that mattered — does anyone read it?
 *
 * These assertions pin the three things that made the fix real:
 *
 *   1. the reply is READ, and the read is bounded and separate;
 *   2. the reply is RENDERED, with its own moderation state — a submitted reply
 *      and a published one are different facts to both sides;
 *   3. "we could not read the replies" and "there are no replies" are DIFFERENT
 *      answers on the surface. Unknown is not zero (SEP-7).
 */

const WEB = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf8");

const DOMAIN = "lib/trust/experience-records.ts";
const RESULT_ACTION = "lib/trust/experience-result-actions.ts";
const SURFACE = "components/app/workspace/experiences-result.tsx";

describe("the reply is read", () => {
  const src = read(DOMAIN);

  it("the domain module selects from experience_responses", () => {
    expect(
      src,
      "the table shipped with an RPC, a policy and a form, and no reader at all",
    ).toMatch(/\.from\("experience_responses"\)/);
    expect(src).toMatch(/experience_record_id, body, moderation_status, created_at/);
  });

  it("the read is bounded and keyed on the records already read", () => {
    expect(src).toMatch(/\.in\("experience_record_id"/);
    expect(src).toMatch(/\.limit\(recordIds\.length\)/);
  });

  it("it stays a SEPARATE read, so one failing relation cannot empty the list", () => {
    // An embedded join would make an unreadable reply table hide a person's
    // experiences entirely — a worse outcome than a card that says nothing
    // about replies.
    expect(src).not.toMatch(/experience_responses\s*\(/);
  });

  it("writes stay RPC-only — reading a reply added no write path", () => {
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
});

describe("unknown is not none", () => {
  it("the domain reports whether replies could be read AT ALL", () => {
    const src = read(DOMAIN);
    expect(src).toMatch(/responsesRead: responses !== null/);
    // A failed read returns null — never an empty map, which would read as
    // "this person has no replies".
    expect(src).toMatch(/if \(error\) return null;/);
  });

  it("the moderation queues claim nothing about replies rather than implying none", () => {
    const src = read(DOMAIN);
    const queues = src.slice(src.indexOf("export async function listModerationQueue"));
    expect(queues).toMatch(/responsesRead: false/);
  });

  it("the result action carries the distinction to the surface", () => {
    const src = read(RESULT_ACTION);
    expect(src).toMatch(/readonly responsesRead: boolean;/);
    expect(src).toMatch(/responsesRead: list\.responsesRead/);
  });

  it("the surface says 'could not read' instead of leaving an absence", () => {
    const src = read(SURFACE);
    expect(src).toMatch(/data-testid="experience-response-unknown"/);
    expect(src).toMatch(/response\.unreadable/);
  });
});

describe("the reply is rendered, with its own state", () => {
  const src = read(SURFACE);

  it("the card renders the reply body", () => {
    expect(src).toMatch(/data-testid="experience-response"/);
    expect(src).toMatch(/row\.response\.body/);
  });

  it("the reply carries its own moderation status, not the record's", () => {
    expect(src).toMatch(/data-response-moderation=\{row\.response\.moderationStatus\}/);
    expect(src).toMatch(/moderation\.\$\{row\.response\.moderationStatus\}/);
  });

  it("an unpublished reply says so rather than looking published", () => {
    expect(src).toMatch(/data-testid="experience-response-not-public"/);
    expect(src).toMatch(/row\.response\.moderationStatus !== "published"/);
  });

  it("an unpublished reply is not disclosed to the author of the experience", () => {
    // The v1 select policy's third branch compares an unqualified
    // `moderation_status` inside a subquery over `experience_records`, so
    // Postgres resolves it to the RECORD's status and the policy hands the
    // experience's author a reply that is still submitted, in moderation or
    // rejected. Correcting the policy is a schema change at the human gate;
    // this surface must not disclose what moderation has not released.
    expect(src).toMatch(
      /row\.response\.moderationStatus === "published" \|\| !row\.isAuthor/,
    );
  });

  it("the reply form closes once a reply exists — one reply per record, by schema", () => {
    // Offering the form again is a door that can only fail: the RPC answers
    // `response_exists`.
    expect(src).toMatch(/r\.response === null \? \(\s*<ExperienceResponseForm/);
  });
});

describe("every shipped locale can say it", () => {
  /**
   * next-intl resolves a MISSING key to the key itself and does not throw, so
   * an unlocalised catalogue ships the literal `response.heading` onto a real
   * person's screen. Only a check over every catalogue catches that — a green
   * build never will.
   */
  const dir = path.join(WEB, "messages");
  const locales = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  it("finds the shipped catalogues", () => {
    expect(locales.length).toBeGreaterThanOrEqual(11);
  });

  for (const locale of locales) {
    it(`${locale} defines the reply strings`, () => {
      const data = JSON.parse(fs.readFileSync(path.join(dir, `${locale}.json`), "utf8")) as {
        experience?: { response?: Record<string, unknown> };
      };
      const block = data.experience?.response;
      expect(block, `${locale}: experience.response block missing`).toBeTruthy();
      for (const key of ["heading", "notPublicYet", "unreadable"]) {
        const value = block![key];
        expect(typeof value, `${locale}.experience.response.${key} missing`).toBe("string");
        expect((value as string).trim().length).toBeGreaterThan(0);
        // A catalogue that "translated" the key by copying it is the same
        // defect wearing a translation's clothes.
        expect(value).not.toBe(key);
        expect(value).not.toBe(`response.${key}`);
      }
    });
  }
});
