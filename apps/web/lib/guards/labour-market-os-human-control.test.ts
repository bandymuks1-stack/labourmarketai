import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  AI_TASK_TYPES,
  TASK_POLICIES,
} from "@/lib/ai/runtime/task-routing";
import {
  PROVIDER_ADAPTER_REGISTRY,
} from "@/lib/ai/runtime/providers/adapter-contract";
import { RECOMMENDED_ACTION_TYPES } from "@/lib/workforce/gap-timeline";

/**
 * Labour Market OS constitution §4 (human control) — P11 hard bans.
 *
 * The system never auto-rejects/accepts candidates, auto-publishes
 * positions, auto-sends communication, auto-merges profiles, or ships a
 * CV to multiple providers at once. High-impact outputs stay explainable,
 * editable, confirmable, rejectable, audited.
 *
 * Companion guards: workforce-canonical.test.ts (create_position gate),
 * external-profiles-consent.test.ts (AUTO_MERGE_ENABLED=false, no hard
 * deletes), ai-task-routing.test.ts (routing policy invariants).
 */

const APP_ROOT = join(__dirname, "..", "..");

// lib/talent was deleted 2026-08-17 (consolidation slice 1): the
// talent_source_records consumer family was dead code — zero importers and
// the backing table was never applied to production. If the directory ever
// returns, add it back here so the P11 bans cover it again.
const SCANNED_DIRS = [
  "lib/workforce",
  "lib/identity",
] as const;

const SCANNED_FILE_PREFIXES = ["lib/worker/external-profiles"] as const;

function collectSources(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  for (const dir of SCANNED_DIRS) {
    const abs = join(APP_ROOT, dir);
    for (const name of readdirSync(abs)) {
      const p = join(abs, name);
      if (statSync(p).isFile() && /\.tsx?$/.test(name)) {
        out.push({ path: `${dir}/${name}`, text: readFileSync(p, "utf8") });
      }
    }
  }
  const workerDir = join(APP_ROOT, "lib/worker");
  for (const name of readdirSync(workerDir)) {
    if (
      SCANNED_FILE_PREFIXES.some((prefix) =>
        `lib/worker/${name}`.startsWith(prefix),
      ) &&
      /\.tsx?$/.test(name)
    ) {
      out.push({
        path: `lib/worker/${name}`,
        text: readFileSync(join(workerDir, name), "utf8"),
      });
    }
  }
  return out;
}

describe("labour-market-os human control (P11)", () => {
  it("recommended actions contain no automatic execution kinds", () => {
    for (const kind of RECOMMENDED_ACTION_TYPES) {
      expect(kind).not.toMatch(/auto/i);
      expect(kind).not.toMatch(/send|publish|reject|accept|merge/i);
    }
  });

  it("workforce/talent/identity/external-profile sources never send, publish, or contact anyone", () => {
    const forbidden =
      /sendEmail|sendMessage|sendSms|nodemailer|telegram|\.rpc\(\s*["']send|\.rpc\(\s*["']publish|autoPublish|autoApprove|autoReject|autoAccept/i;
    for (const { path, text } of collectSources()) {
      expect(text, `${path} must not contain outbound/auto-action calls`).not.toMatch(
        forbidden,
      );
    }
  });

  it("every AI task policy minimizes data: prohibited fields set and disjoint from allowed", () => {
    for (const taskType of AI_TASK_TYPES) {
      const policy = TASK_POLICIES[taskType];
      expect(
        policy.prohibitedFields.length,
        `${taskType} must prohibit at least one field`,
      ).toBeGreaterThan(0);
      const allowed = new Set(policy.allowedFields);
      for (const field of policy.prohibitedFields) {
        expect(
          allowed.has(field),
          `${taskType}: field "${field}" is both allowed and prohibited`,
        ).toBe(false);
      }
    }
  });

  it("high-risk AI tasks always require human review", () => {
    for (const taskType of AI_TASK_TYPES) {
      const policy = TASK_POLICIES[taskType];
      if (policy.riskLevel === "high") {
        expect(
          policy.humanReview,
          `${taskType} is high risk and must require human review`,
        ).toBe(true);
      }
    }
  });

  it("exactly one provider adapter is active — a CV can never fan out to multiple providers", () => {
    const active = PROVIDER_ADAPTER_REGISTRY.filter(
      (adapter) => adapter.status === "active",
    );
    expect(active.map((adapter) => adapter.id)).toEqual(["anthropic"]);
  });
});
