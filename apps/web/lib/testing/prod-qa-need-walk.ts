/**
 * What the production need-intake walk (register row 4.8) and its clean-up
 * script must agree on: how ONE synthetic public need is marked. Kept apart
 * from both so neither can drift from the other.
 *
 * - The company name and the description start with `QA-SYNTHETIC`, the mark
 *   `lib/qa/synthetic-fixture.ts` recognises.
 * - The contact address is on `example.invalid` (RFC 2606: it can never
 *   receive mail), which the commercial-requests feed also labels synthetic.
 * - Run id and attempt make the address unique per attempt: the database
 *   answers an exact repeat within 24 h with the earlier row and stores
 *   nothing, which would make a re-run pass without a submit.
 */
export const NEED_WALK_MARK = "QA-SYNTHETIC";
export const NEED_WALK_SOURCE_PATH = "/en/company-need";

const clean = (v: string | undefined, fallback: string) => (/^[a-z0-9]{1,24}$/i.test(v ?? "") ? (v as string).toLowerCase() : fallback);

export function needWalkRun(env: NodeJS.ProcessEnv = process.env): string {
  return `${clean(env.GITHUB_RUN_ID, "local")}.${clean(env.GITHUB_RUN_ATTEMPT, "1")}`;
}

export function needWalkAddress(run: string = needWalkRun()): string {
  return `qa.synthetic.need.${run}@example.invalid`;
}

export function needWalkCompany(run: string = needWalkRun()): string {
  return `${NEED_WALK_MARK} need walk ${run} (not a real company)`;
}

export function needWalkDescription(run: string = needWalkRun()): string {
  return `${NEED_WALK_MARK}. Production check of the public need form, run ${run}. This is not a real need: nobody is to be contacted.`;
}
