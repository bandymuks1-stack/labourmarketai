import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The conversation DELEGATES — it never grows a second copy of a canonical
 * subsystem.
 *
 * `canonical-marketplace-use-case.test.ts` already pins the marketplace half of
 * this (load / rank / explain / mark-shown). This guard pins the other two
 * halves the chat-first surface is most likely to duplicate:
 *
 *   A. PROFILE — "show my profile" / "what's left?" / "where did I stop?" must
 *      be answered from the ONE worker read model, never from a second set of
 *      presence checks or a chat-local completeness rule.
 *   B. INTEREST — acting on a match must use the ONE canonical control and the
 *      ONE canonical write path, never a chat-local interest state machine.
 *
 * Plus the structural rule underneath both: there is exactly ONE conversation
 * surface. A dead parallel shell is how two conversation products start.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");
const rel = (p: string): string => relative(APP_ROOT, p).replaceAll("\\", "/");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
    } else if (
      (p.endsWith(".ts") || p.endsWith(".tsx")) &&
      !p.endsWith(".test.ts") &&
      !p.endsWith(".test.tsx")
    ) {
      out.push(p);
    }
  }
  return out;
}

/** Comments may DESCRIBE a canonical dependency; only real code may violate. */
const codeOf = (p: string): string =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const CONVERSATION_LIB = join(APP_ROOT, "lib", "conversation");
const CONVERSATION_UI = join(APP_ROOT, "components", "app", "conversation");
const conversationFiles = (): string[] => [
  ...walk(CONVERSATION_LIB),
  ...walk(CONVERSATION_UI),
];

/** The canonical worker read model — the single owner of the presence checks. */
const ACTIVITY_MODEL = "lib/conversation/worker-activity.ts";
/** The canonical interest write path. */
const INTEREST_ACTIONS = "lib/opportunities/interest-actions.ts";

describe("A — the profile summary delegates to the ONE worker read model", () => {
  const summary = read("lib/conversation/profile-summary.ts");

  it("reads the canonical activity model instead of the profile tables", () => {
    expect(summary).toMatch(/getWorkerActivity\(/);
    // Auth identity is the only direct supabase use; no profile/worker/skill
    // table is read here — that is the read model's single job.
    expect(summary).not.toMatch(/\.from\(["']/);
    expect(summary).not.toMatch(/\.rpc\(/);
  });

  it("derives the acting user server-side — never from a client-supplied id", () => {
    expect(summary).toMatch(/supabase\.auth\.getUser\(\)/);
    expect(summary).not.toMatch(/userId\s*[:=]\s*(?:input|params|args)/);
  });

  it("only the read model READS the worker profile tables", () => {
    // A second file querying "does this worker have skills / languages / an
    // availability status?" is a second completeness rule, and the two WILL
    // drift apart. (Writing through a canonical server action is fine — this
    // targets direct table reads.)
    // Scoped to the tables the completeness answer is built from. `workers` /
    // `engagement_contexts` are deliberately excluded: the dispatcher's role
    // gate and the work-log's engagement picker read them for unrelated,
    // pre-existing reasons.
    const PROFILE_TABLE_READ =
      /\.from\(\s*["'](profiles|profile_skill_claims|worker_languages|worker_education|worker_achievements)["']/;
    const offenders = conversationFiles()
      .filter((p) => rel(p) !== ACTIVITY_MODEL)
      .filter((p) => PROFILE_TABLE_READ.test(codeOf(p)))
      .map(rel);
    expect(offenders, "profile presence checks belong to the read model").toEqual([]);
  });

  it("no conversation file invents its own completeness percentage", () => {
    const offenders = conversationFiles()
      .filter((p) => rel(p) !== ACTIVITY_MODEL)
      .filter((p) => /completenessPct|\/\s*stepsTotal|Math\.round\([^)]*100\)/.test(codeOf(p)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("what is missing is NAMED, not just counted", () => {
    // A bare percentage tells a worker nothing actionable. The summary must
    // carry the concrete missing checkpoints.
    expect(summary).toMatch(/missing/);
    expect(read("lib/conversation/profile-summary-contract.ts")).toMatch(
      /missing:\s*string\[\]/,
    );
  });
});

describe("B — acting on a match uses the ONE canonical interest path", () => {
  const messages = read("components/app/conversation/chat/messages.tsx");
  const findWork = read("lib/conversation/find-work.ts");

  it("the chat renders the canonical control, not a chat-local one", () => {
    expect(messages).toMatch(
      /from\s+["']@\/components\/app\/worker-interest-button["']/,
    );
    expect(messages).toMatch(/<WorkerInterestButton\b/);
  });

  it("no conversation file calls the interest write directly", () => {
    // The write belongs to the canonical control + its server action. A second
    // caller is a second interest state machine.
    const offenders = conversationFiles()
      .filter((p) => /expressInterestAction\(|withdrawInterestAction\(/.test(codeOf(p)))
      // The Phase B executor is the registry's THIN adapter over that same
      // canonical action — the dispatcher path, not a second machine.
      .filter((p) => rel(p) !== "lib/conversation/worker-executors.ts")
      .map(rel);
    expect(offenders).toEqual([]);
    expect(existsSync(join(APP_ROOT, INTEREST_ACTIONS))).toBe(true);
  });

  it("the interest status shown is the use case's, never recomputed", () => {
    expect(findWork).toMatch(/view\.interestStatusByRequestId\[/);
    // No local defaulting of an absent signal into a concrete status.
    expect(codeOf(join(APP_ROOT, "lib", "conversation", "find-work.ts"))).not.toMatch(
      /\?\?\s*["']interested["']|\?\?\s*["']withdrawn["']/,
    );
  });

  it("no dead button: the control is offered only when the store exists", () => {
    expect(findWork).toMatch(/interestAvailable\s*\n?\s*\?/);
    // …and the card renders it only when those labels really arrived.
    expect(messages).toMatch(/m\.interestLabels\s*&&\s*m\.locale\s*\?/);
  });
});

describe("structure — exactly one conversation surface", () => {
  it("the orphaned second shell does not exist", () => {
    expect(
      existsSync(join(APP_ROOT, "components/app/conversation/conversation-shell.tsx")),
      "a conversation surface no route renders is a parallel product waiting to happen",
    ).toBe(false);
  });

  it("its copy bag is gone from every locale — no resurrection kit", () => {
    const dir = join(APP_ROOT, "messages");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const doc = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
        conversation?: Record<string, unknown>;
      };
      expect(doc.conversation?.shell, `${file} still carries conversation.shell`).toBeUndefined();
    }
  });

  it("/dashboard is the conversation and mounts exactly one chat", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(/<ConversationChat\b/);
    expect(page.match(/<ConversationChat\b/g)).toHaveLength(1);
  });
});

describe("reachability — no fixed control is buried by the chat's bottom stack", () => {
  it("the conversation surface really lifts the language-feedback FAB", () => {
    // The widget exposes `--feedback-fab-bottom` on the contract that "a
    // surface with a bottom bar sets this variable to its own height". The
    // conversation home has two stacked bottom elements AND gives the composer
    // `z-50`, so skipping the lift leaves the FAB visible but unclickable —
    // half a fix is worse than none, because it looks done.
    const widget = read("components/app/language-feedback-widget.tsx");
    expect(widget).toMatch(/--feedback-fab-bottom/);

    // The flag must land on <html>: the FAB is a SIBLING of the chrome, so a
    // custom property set inside the chat subtree could never cascade to it.
    const chrome = read("components/app/dashboard-chrome.tsx");
    expect(chrome).toMatch(/document\.documentElement/);
    expect(chrome).toMatch(/dataset\.surface\s*=\s*["']conversation["']/);
    // …and it must be cleaned up, or every other route inherits the lift.
    expect(chrome).toMatch(/delete\s+root\.dataset\.surface/);

    // Both breakpoints are defined — mobile carries the extra bottom nav.
    const css = read("app/globals.css");
    expect(css).toMatch(
      /html\[data-surface="conversation"\][\s\S]{0,120}--feedback-fab-bottom/,
    );
    expect(css).toMatch(
      /@media\s*\(min-width:\s*768px\)[\s\S]{0,200}--feedback-fab-bottom/,
    );
  });
});

describe("honesty — the chat never promises a mechanism it lacks", () => {
  it("the empty find-work state does not promise a notification", () => {
    // There is no alert/notification mechanism behind the opportunity board, so
    // "I'll let you know when one appears" was a fake promise (§7).
    const dir = join(APP_ROOT, "messages");
    const PROMISE =
      /I'll let you know when|pranešiu|Сообщу, когда|Ich melde mich, sobald|Ik laat het weten zodra/i;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const doc = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
        conversation?: { findWork?: { emptyState?: string } };
      };
      const empty = doc.conversation?.findWork?.emptyState ?? "";
      expect(empty, `${file}: empty state promises a notification`).not.toMatch(PROMISE);
    }
  });

  it("a weak fit is never painted as success", () => {
    // The badge colour carries the same fact as the label. A flat
    // `text-state-success` on every match told the worker "strong" while the
    // label said "weak" — the colour is the louder signal.
    const messages = read("components/app/conversation/chat/messages.tsx");
    expect(messages).toMatch(/FIT_BADGE/);
    expect(messages).toMatch(/weak:\s*["'][^"']*state-warning/);
    expect(messages).toMatch(/insufficient:\s*["'](?![^"']*state-success)/);
    // …and the status really travels from the use case to the card.
    expect(read("lib/conversation/find-work.ts")).toMatch(/fitStatus:\s*m\.status/);
  });

  it("the chat answers state questions from the server, not from canned copy", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toMatch(/loadProfileSummaryForChat\(/);
    for (const dead of ["nextActionAnswer", "resumeAnswer", "profileQuestion", "jobsAnswer"]) {
      expect(chat, `${dead} is a canned answer to a real-state question`).not.toContain(dead);
    }
  });
});
