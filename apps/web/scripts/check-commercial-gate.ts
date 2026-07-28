/**
 * pnpm -C apps/web check:commercial-gate
 *
 * Owner-facing Commercial Gate report (financial safety layer v1).
 * Prints every commercial item, whether it is sellable, whether it has an
 * economic model, and every violation with the principle it breaks.
 *
 * Exit code 1 on RED, so it can be used as a standalone CI step or a
 * pre-activation check. The same logic runs inside
 * lib/guards/commercial-gate.test.ts on every `quality` run.
 *
 * Contract: docs/product/commercial-sustainability-v1.md
 */
import {
  COMMERCIAL_PRINCIPLES,
  ECONOMIC_ASSESSMENTS,
  commercialGateReport,
  commercialItems,
  itemRef,
  machineEnforcedPrinciples,
  reviewOnlyPrinciples,
} from "../lib/commercial/sustainability";

function main(): void {
  const report = commercialGateReport();

  console.log("COMMERCIAL GATE — financial safety v1");
  console.log("=".repeat(60));
  console.log(`Principles:        ${COMMERCIAL_PRINCIPLES.length} (${machineEnforcedPrinciples().length} machine-enforced, ${reviewOnlyPrinciples().length} review-only)`);
  console.log(`Review-only:       ${reviewOnlyPrinciples().join(", ")}`);
  console.log(`Items under gate:  ${report.itemsTotal}`);
  console.log(`  sellable today:  ${report.itemsActivatable}`);
  console.log(`  assessed:        ${report.itemsAssessed}`);
  console.log(`  grandfathered:   ${report.itemsGrandfathered}`);
  console.log("");

  console.log("ITEMS");
  console.log("-".repeat(60));
  for (const item of commercialItems()) {
    const ref = itemRef(item.kind, item.code);
    const a = ECONOMIC_ASSESSMENTS[ref];
    const state = !a
      ? "NO ASSESSMENT ENTRY"
      : a.assessed
        ? `assessed ${a.model.assessedAt} · margin ${a.model.expectedMarginPercent ?? "?"}%`
        : `not assessed (${a.ownerDecision})`;
    const sellable = item.activatable ? "SELLABLE" : "not sellable";
    console.log(`  ${ref.padEnd(34)} ${sellable.padEnd(13)} ${state}`);
  }
  console.log("");

  if (report.violations.length > 0) {
    console.log("VIOLATIONS");
    console.log("-".repeat(60));
    for (const v of report.violations) {
      console.log(`  [${v.principle}] ${v.item} — ${v.code}`);
      console.log(`      ${v.detail}`);
    }
    console.log("");
  }

  console.log(`STATUS: ${report.status}`);
  if (report.status === "RED") {
    console.log("");
    console.log(
      "A commercial item is sellable (or newly added) without an assessed economic model,",
    );
    console.log(
      "or an assessed model breaks a financial-safety rule. See docs/product/commercial-sustainability-v1.md.",
    );
    process.exit(1);
  }
  console.log(
    "GREEN means no unassessed feature is being sold — not that the business model is validated.",
  );
}

main();
