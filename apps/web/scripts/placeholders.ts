/**
 * Placeholder governance CLI (brief Rule 5). Run via pnpm:
 *   pnpm placeholders:list      group every placeholder by status
 *   pnpm placeholders:pending   only those flagged pending-real
 *   pnpm placeholders:check     CI gate — non-zero if metadata incomplete
 *   pnpm placeholders:promote <id>   the ONLY way to swap a value
 *
 * Run with cwd = apps/web (pnpm -C apps/web ...).
 */
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { placeholders, type Placeholder } from "../content/placeholders";

const CHANGELOG = join(process.cwd(), "..", "..", "docs", "CHANGELOG.md");

function summarize(p: Placeholder): string {
  const v =
    typeof p.value === "object"
      ? "src" in p.value
        ? p.value.src
        : "lt" in p.value
          ? p.value.en
          : String(p.value)
      : String(p.value);
  return `  ${p.id}  [${p.type}]  ${p.status}  →  ${v}`;
}

function cmdList(): void {
  const statuses = ["placeholder", "pending-real", "replaced"] as const;
  for (const s of statuses) {
    const items = placeholders.filter((p) => p.status === s);
    console.log(`\n${s.toUpperCase()} (${items.length})`);
    items.forEach((p) => console.log(summarize(p)));
  }
  console.log(`\nTotal: ${placeholders.length}`);
}

function cmdPending(): void {
  const items = placeholders.filter((p) => p.status === "pending-real");
  if (items.length === 0) {
    console.log("No placeholders are pending real data.");
    return;
  }
  items.forEach((p) => console.log(summarize(p)));
}

function cmdCheck(): void {
  const problems: string[] = [];
  for (const p of placeholders) {
    if (!p.id) problems.push("an entry is missing `id`");
    if (!p.description?.trim())
      problems.push(`${p.id}: missing \`description\``);
    if (!p.replacementSource?.trim())
      problems.push(`${p.id}: missing \`replacementSource\``);
  }
  const ids = placeholders.map((p) => p.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0)
    problems.push(`duplicate ids: ${[...new Set(dupes)].join(", ")}`);

  if (problems.length > 0) {
    console.error("placeholders:check FAILED");
    problems.forEach((m) => console.error(`  ✗ ${m}`));
    process.exit(1);
  }
  console.log(
    `placeholders:check OK — ${placeholders.length} entries, all metadata present.`,
  );
}

async function cmdPromote(id: string | undefined): Promise<void> {
  if (!id) {
    console.error("Usage: pnpm placeholders:promote <id>");
    process.exit(1);
    return;
  }
  const entry = placeholders.find((p) => p.id === id);
  if (!entry) {
    console.error(`Unknown placeholder id "${id}".`);
    process.exit(1);
    return;
  }

  const interactive = Boolean(process.stdin.isTTY);
  const forced = process.argv.includes("--yes");
  if (!interactive && !forced) {
    console.error(
      "Refusing to promote in non-interactive mode without --yes (Rule 5).",
    );
    process.exit(1);
    return;
  }

  console.log(`\nPlaceholder: ${entry.id}`);
  console.log(`  description:       ${entry.description}`);
  console.log(`  replacementSource: ${entry.replacementSource}`);
  console.log(`  consentRequired:  ${entry.consentRequired}`);

  if (interactive && !forced) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = (
      await rl.question("Record this promotion in CHANGELOG? (yes/no) ")
    )
      .trim()
      .toLowerCase();
    rl.close();
    if (answer !== "yes" && answer !== "y") {
      console.log("Aborted. Nothing changed.");
      return;
    }
  }

  if (!existsSync(CHANGELOG)) {
    console.error(`CHANGELOG not found at ${CHANGELOG}`);
    process.exit(1);
    return;
  }
  const stamp = new Date().toISOString();
  appendFileSync(
    CHANGELOG,
    `- ${stamp} — promote \`${entry.id}\`: edit content/placeholders.ts ` +
      `(set value to real data, status='replaced'). Source: ${entry.replacementSource}\n`,
  );
  console.log(
    `\nRecorded in docs/CHANGELOG.md. Now edit content/placeholders.ts: ` +
      `set the real value and status='replaced' for "${entry.id}".`,
  );
}

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "list":
      cmdList();
      break;
    case "pending":
      cmdPending();
      break;
    case "check":
      cmdCheck();
      break;
    case "promote":
      await cmdPromote(arg);
      break;
    default:
      console.error(
        "Usage: placeholders <list|pending|check|promote <id>>",
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
