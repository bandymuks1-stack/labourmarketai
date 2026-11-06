import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "./prod-walk";

import { sweepCvRows } from "./prod-cv-import-rows";

/**
 * Removes what a stopped `cv-import-duplicates` walk left on the synthetic worker,
 * and nothing else: no browser page, no CV, no case. Dispatch only.
 */
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(resolve(__dirname, ".storage-state.prod-qa.worker2.json"));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");

test("the CV import walk's rows are gone from the synthetic worker", async () => {
  for (const kind of ["education", "certificate"] as const) {
    const { removed, earlier, left } = await sweepCvRows(kind, "none");
    console.info(`[cleanup sweep-only] ${kind}: removed=${removed} from_earlier_runs=${earlier} left=${left}`);
    expect(left, `${kind} rows left`).toBe(0);
  }
});
