/**
 * CLOSE EVERY OPEN SYNTHETIC NEED — the workflow's `if: always()` net, run
 * after every production walk and BEFORE the sessions are revoked.
 *
 * Each walk that can post a need already sweeps in its own `test.afterAll`
 * (tests/e2e/prod-synthetic-needs.ts). This step covers what no hook covers:
 * a cancelled run, a job timeout, a crash before the hook. It uses only the
 * minted synthetic sessions' OWN tokens and the product's own close RPC; no
 * service role, no delete. Prints counts only.
 *
 * Exit 1 when a synthetic need may still be open, so the run is red.
 *
 *   PROD_QA_SUPABASE_URL=… PROD_QA_ANON_KEY=… pnpm exec tsx scripts/prod-qa-close-synthetic-needs.ts
 */
import { closeOpenSyntheticNeeds } from "../tests/e2e/prod-synthetic-needs";

async function main(): Promise<void> {
  const r = await closeOpenSyntheticNeeds("workflow");
  if (r.failed.length > 0) {
    console.error(`::error::${r.failed.length} synthetic need(s) may still be open after the walk`);
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error("::error::the synthetic need sweep did not complete");
  process.exitCode = 1;
});
