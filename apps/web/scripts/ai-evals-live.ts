/**
 * AI EVALS, LIVE — the Lithuanian eval cases (lib/ai/evals/lithuanian.fixtures.ts)
 * sent to the REAL provider the environment already configures, judged by the
 * same three checks the mock suite uses (lib/ai/evals/harness.ts):
 * output schema, Lithuanian reader-facing text, no invented employer / date /
 * certificate.
 *
 *   AI_PROVIDER_MODE=live AI_PROVIDER=<provider> <that provider's key env> \
 *   pnpm -F web exec tsx --conditions=react-server scripts/ai-evals-live.ts
 *
 * NEVER IN CI: no workflow references this file and vitest only collects
 * lib/**\/*.test.ts. It is a deliberate operator act.
 *
 * What it does NOT do:
 *   - it configures nothing. No mode, provider, key or paid tier is set here;
 *     with no live provider configured it prints why and exits before any
 *     request. The run goes through `runAiAgentCore` with the operator's own
 *     config and provider chain, so the egress gate, the zero-paid-budget
 *     rule and the per-task cost ceilings apply exactly as in the product;
 *   - it writes nothing: no ai_runs audit row, no database, no file;
 *   - it prints case names, verdicts and short check details only — never a
 *     key, never the raw model output.
 *
 * Exit codes: 0 all PASS · 1 at least one FAIL · 2 no live provider configured.
 */
import { judgeLithuanianCase } from "../lib/ai/evals/harness";
import {
  LITHUANIAN_EVAL_CASES,
  LITHUANIAN_EVAL_EXCLUDED,
} from "../lib/ai/evals/lithuanian.fixtures";
import { runAiAgentCore } from "../lib/ai/run-agent";

function notConfigured(why: string): never {
  console.log(`ai-evals-live: no live AI provider configured (${why}).`);
  console.log(
    "Set AI_PROVIDER_MODE=live, AI_PROVIDER and that provider's own key/base URL in the invoking environment to run the live evals. Nothing was sent.",
  );
  process.exit(2);
}

async function main(): Promise<void> {
  // Checked BEFORE the server config is imported: the product's default is
  // `disabled`, and an unconfigured checkout should exit with a sentence,
  // not an env-validation stack trace.
  if (process.env.AI_PROVIDER_MODE !== "live") {
    notConfigured(`AI_PROVIDER_MODE is "${process.env.AI_PROVIDER_MODE ?? "unset"}", not "live"`);
  }

  let config: typeof import("../lib/ai/runtime/config");
  try {
    config = await import("../lib/ai/runtime/config");
  } catch (e) {
    notConfigured(`server env did not load: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
  const cfg = config.getAiRuntimeConfig();
  if (cfg.state !== "live") notConfigured(`runtime state "${cfg.state}", reason "${cfg.reason}"`);
  const providerStates = config.getAiProviderStates();

  console.log(`ai-evals-live: provider ${cfg.provider}, ${LITHUANIAN_EVAL_CASES.length} Lithuanian cases`);
  for (const [agent, why] of Object.entries(LITHUANIAN_EVAL_EXCLUDED)) {
    console.log(`  SKIP  ${agent} — ${why}`);
  }

  let failed = 0;
  for (const { entry, c } of LITHUANIAN_EVAL_CASES) {
    const out = await runAiAgentCore(entry, c.input, cfg, {
      locale: c.locale,
      language: c.locale,
      providerStates,
      ...(c.maxOutputTokens !== undefined ? { maxOutputTokens: c.maxOutputTokens } : {}),
    });
    const v = judgeLithuanianCase(entry, c.input, out);
    if (!v.pass) failed += 1;
    console.log(`  ${v.pass ? "PASS" : "FAIL"}  [${entry.agent}] ${c.name}`);
    for (const [name, r] of [["schema", v.schema], ["language", v.language], ["facts", v.facts]] as const) {
      console.log(`        ${r.ok ? "ok  " : "FAIL"} ${name}: ${r.detail}`);
    }
  }

  console.log(`ai-evals-live: ${LITHUANIAN_EVAL_CASES.length - failed}/${LITHUANIAN_EVAL_CASES.length} PASS`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
