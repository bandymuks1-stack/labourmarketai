// Shared work-time parity fixture driver for scripts/db-proof/project-invoice-lifecycle-v1.sh.
//   node work-time-parity.mjs sql <fixture.json> <project-id> <worker-id> <engagement-context-id>
//        -> SQL that writes one journal entry (+ metrics) per fixture case
//   node work-time-parity.mjs compare <fixture.json> <actual.json>
//        -> compares the rows `_invoice_period_evidence_v1` returned with the fixture's expectations
// The SAME fixture is read by apps/web/lib/finance/invoice-evidence-parity.test.ts (TypeScript rule).
import { readFileSync } from "node:fs";

const [mode, fixturePath, a, b, c] = process.argv.slice(2);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const entryId = (i) => `aa000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`;
const lit = (v) => (v === undefined || v === null ? "null" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

if (mode === "sql") {
  const [project, worker, ec] = [a, b, c];
  const out = [];
  fixture.cases.forEach((cs, i) => {
    out.push(
      `insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id, created_at) values ('${entryId(i)}', '${worker}', '${ec}', ${lit("parity " + cs.id)}, ${lit("hp-" + i)}, '${project}', ${lit(cs.createdAt)}::timestamptz);`,
    );
    cs.metrics.forEach((m, j) => {
      const created = `2026-09-01T00:00:${String(j).padStart(2, "0")}Z`;
      out.push(
        `insert into public.journal_entry_metrics (entry_id, metric_slug, value_text, value_numeric, unit_slug, created_at) values ('${entryId(i)}', ${lit(m.slug)}, ${lit(m.text)}, ${lit(m.value)}, ${lit(m.unit)}, ${lit(created)}::timestamptz);`,
      );
    });
  });
  console.log(out.join("\n"));
} else if (mode === "compare") {
  const actual = JSON.parse(readFileSync(a, "utf8").trim() || "[]");
  let bad = 0;
  const lines = [];
  fixture.cases.forEach((cs, i) => {
    const got = actual
      .filter((r) => r.entry === entryId(i))
      .map((r) => ({
        key: r.key,
        kind: r.kind,
        unit: r.unit,
        ...(r.hours !== null && r.hours !== undefined ? { hours: Number(r.hours) } : {}),
        ...(r.quantity !== null && r.quantity !== undefined ? { quantity: Number(r.quantity) } : {}),
      }))
      .sort((x, y) => x.key.localeCompare(y.key));
    const days = [...new Set(actual.filter((r) => r.entry === entryId(i)).map((r) => r.day))];
    const want = [...cs.expected.rows].sort((x, y) => x.key.localeCompare(y.key));
    const sameRows = JSON.stringify(got) === JSON.stringify(want);
    const sameDay = cs.expected.rows.length === 0 || (days.length === 1 && days[0] === cs.expected.day);
    if (!sameRows || !sameDay) {
      bad++;
      lines.push(`MISMATCH ${cs.id}\n  want ${JSON.stringify({ day: cs.expected.day, rows: want })}\n  got  ${JSON.stringify({ day: days, rows: got })}`);
    }
  });
  if (bad) {
    console.log(lines.join("\n"));
    console.log(`PARITY FAILED (${bad} of ${fixture.cases.length})`);
    process.exit(1);
  }
  console.log(`PARITY OK (${fixture.cases.length} cases)`);
} else {
  console.error("usage: sql|compare");
  process.exit(2);
}
