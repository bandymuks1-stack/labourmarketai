/**
 * Guard — THE OPERATOR CONTROL SURFACE CANNOT EXECUTE ANYTHING.
 *
 * A remote control channel is the highest-consequence surface in a product: it
 * is reachable from a phone, it is authenticated by whatever the messaging
 * platform says, and every catastrophic example of the genre got that way by
 * the same route — a command that takes an ARGUMENT and does something with it.
 * `/run`, `/sql`, `/exec`, `/deploy <branch>`, or a command that forwards its
 * text to a model that then has tools.
 *
 * So this guard does not check that such commands are disabled. It checks that
 * they DO NOT EXIST, and that the shape which would make them possible — an
 * argument, a mutating effect, a caller-supplied string reaching an executor —
 * is absent from the module by construction.
 *
 * It also pins the ownership rule: LabourMarket.ai does not run a Telegram bot.
 * Agentai OS owns that channel (see lib/notifications/telegram-owner-alerts.ts),
 * and a second bot appearing here would be a duplicate control plane with its
 * own token, its own allowlist and its own way of being wrong.
 *
 * Pure source assertions plus behavioural checks on the parser.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTROL_COMMANDS,
  CONTROL_COMMAND_REGISTRY,
  MAX_COMMAND_LENGTH,
  parseControlCommand,
  specFor,
} from "../ops/control-commands";
import {
  DEFAULT_CONTROL_POLICY,
  authorizeControlCommand,
  buildControlAudit,
  newRateState,
} from "../ops/control-authorization";

const APP_ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(APP_ROOT, p), "utf8");

/**
 * Strip comments so scans check real CODE, not the prose that explains a ban.
 *
 * THE `//` IN A URL IS NOT A COMMENT. The obvious line-comment pattern — match
 * a double slash then everything to end of line — deletes the rest of any line
 * containing a URL, which silently blinds every host check to exactly the
 * string it exists to find. Requiring the double slash NOT to be preceded by a
 * colon keeps `https://…` intact while still removing a real `// like this`.
 *
 * A caught instance of this, not a hypothetical: this guard's own negative
 * control failed to fire because of it. See the self-test at the bottom.
 */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const OPS_MODULES = [
  "lib/ops/control-commands.ts",
  "lib/ops/control-authorization.ts",
] as const;

// ── 1. The dangerous commands do not exist ─────────────────────────────────

describe("no command can execute caller-supplied input", () => {
  it.each(["run", "exec", "sql", "shell", "eval", "query", "migrate", "apply"])(
    "there is no /%s command",
    (name) => {
      expect(CONTROL_COMMANDS as readonly string[]).not.toContain(name);
    },
  );

  it("every registered command is read-only", () => {
    for (const spec of CONTROL_COMMAND_REGISTRY) {
      expect(spec.effect, `/${spec.command} is not read-only`).toBe("read");
    }
  });

  it("the registry and the command list agree exactly", () => {
    // A command in one and not the other is how a surface acquires an entry
    // nobody reviewed.
    expect([...CONTROL_COMMAND_REGISTRY.map((s) => s.command)].sort()).toEqual(
      [...CONTROL_COMMANDS].sort(),
    );
    for (const c of CONTROL_COMMANDS) expect(specFor(c).command).toBe(c);
  });

  it("the ops modules import no executor, no shell, no db client", () => {
    const FORBIDDEN =
      /child_process|node:child_process|\bexecSync\b|\bspawn\b|\beval\s*\(|new Function\s*\(|createClient|@supabase|\bfetch\s*\(/;
    for (const m of OPS_MODULES) {
      const src = code(read(m));
      expect(FORBIDDEN.test(src), `${m} reaches an executor or a network/db client`).toBe(
        false,
      );
    }
  });

  it("the ops modules read no env and are not server-only", () => {
    // They are PURE: policy comes in as an argument, so a test can construct
    // any deployment's configuration without one existing.
    for (const m of OPS_MODULES) {
      const src = code(read(m));
      expect(/process\.env/.test(src), `${m} reads env`).toBe(false);
      expect(/["']server-only["']/.test(src), `${m} is server-only`).toBe(false);
    }
  });
});

// ── 2. Arguments are refused — the injection seam is closed ────────────────

describe("the parser refuses arguments outright", () => {
  it.each([
    "/status extra",
    "/status --force",
    "/deploy main",
    "/errors 2026-01-01",
    "/status ; rm -rf /",
    "/status && curl evil.example",
    "/status\nDROP TABLE workers",
  ])("refuses %j", (input) => {
    const r = parseControlCommand(input);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("arguments_not_accepted");
  });

  it("never echoes the rejected input back", () => {
    // A control channel that quotes what it refused is a reflection surface.
    const hostile = "/status <img src=x onerror=alert(1)>";
    const r = parseControlCommand(hostile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.detail).not.toContain("<img");
    expect(r.detail).not.toContain("onerror");
  });

  it("accepts the bare commands and nothing else", () => {
    for (const c of CONTROL_COMMANDS) {
      const r = parseControlCommand(`/${c}`);
      expect(r.ok && r.command, `/${c} should parse`).toBe(c);
    }
    expect(parseControlCommand("/statuss").ok).toBe(false);
    expect(parseControlCommand("status").ok).toBe(false);
    expect(parseControlCommand("").ok).toBe(false);
    expect(parseControlCommand("   ").ok).toBe(false);
  });

  it("tolerates Telegram's /cmd@botname shape without interpreting the suffix", () => {
    const r = parseControlCommand("/status@labourmarket_ops_bot");
    expect(r.ok && r.command).toBe("status");
  });

  it("refuses anything over the length cap without reading it", () => {
    const r = parseControlCommand("/" + "a".repeat(MAX_COMMAND_LENGTH + 10));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("too_long");
  });

  it("is case-insensitive on the command word only", () => {
    expect(parseControlCommand("/STATUS").ok).toBe(true);
    // …and still refuses an argument regardless of case.
    expect(parseControlCommand("/STATUS DROP").ok).toBe(false);
  });
});

// ── 3. Fail-closed authorization ──────────────────────────────────────────

describe("the control surface is OFF until an operator is named", () => {
  it("an empty allowlist answers nobody (not everybody)", () => {
    const r = authorizeControlCommand(
      { senderId: "anyone" },
      DEFAULT_CONTROL_POLICY,
      newRateState(),
      1_000,
    );
    expect(r.allowed).toBe(false);
    expect(!r.allowed && r.reason).toBe("surface_disabled");
  });

  it("the shipped default allowlist is empty", () => {
    expect(DEFAULT_CONTROL_POLICY.allowedSenderIds).toEqual([]);
  });

  it("an unlisted sender is refused even when the surface is on", () => {
    const policy = { ...DEFAULT_CONTROL_POLICY, allowedSenderIds: ["owner-1"] };
    const r = authorizeControlCommand(
      { senderId: "someone-else" },
      policy,
      newRateState(),
      1_000,
    );
    expect(r.allowed).toBe(false);
    expect(!r.allowed && r.reason).toBe("sender_not_allowed");
  });

  it("an unauthorized sender cannot burn an operator's rate budget", () => {
    // Rejection happens BEFORE counting, so spamming with someone else's id
    // must not lock them out.
    const policy = {
      allowedSenderIds: ["owner-1"],
      maxPerWindow: 2,
      windowMs: 60_000,
    };
    const state = newRateState();
    for (let i = 0; i < 50; i++) {
      authorizeControlCommand({ senderId: "attacker" }, policy, state, 1_000);
    }
    expect(state.get("attacker")).toBeUndefined();
    expect(
      authorizeControlCommand({ senderId: "owner-1" }, policy, state, 1_000).allowed,
    ).toBe(true);
  });
});

describe("rate limiting is per sender and windowed", () => {
  const policy = {
    allowedSenderIds: ["owner-1", "owner-2"],
    maxPerWindow: 3,
    windowMs: 60_000,
  };

  it("allows up to the budget then refuses", () => {
    const state = newRateState();
    for (let i = 0; i < 3; i++) {
      expect(
        authorizeControlCommand({ senderId: "owner-1" }, policy, state, 1_000).allowed,
      ).toBe(true);
    }
    const r = authorizeControlCommand({ senderId: "owner-1" }, policy, state, 1_000);
    expect(r.allowed).toBe(false);
    expect(!r.allowed && r.reason).toBe("rate_limited");
  });

  it("one sender's budget does not affect another's", () => {
    const state = newRateState();
    for (let i = 0; i < 3; i++) {
      authorizeControlCommand({ senderId: "owner-1" }, policy, state, 1_000);
    }
    expect(
      authorizeControlCommand({ senderId: "owner-2" }, policy, state, 1_000).allowed,
    ).toBe(true);
  });

  it("the window rolls forward", () => {
    const state = newRateState();
    for (let i = 0; i < 3; i++) {
      authorizeControlCommand({ senderId: "owner-1" }, policy, state, 1_000);
    }
    expect(
      authorizeControlCommand({ senderId: "owner-1" }, policy, state, 1_000).allowed,
    ).toBe(false);
    // Past the window, the budget is available again.
    expect(
      authorizeControlCommand({ senderId: "owner-1" }, policy, state, 70_000).allowed,
    ).toBe(true);
  });

  it("a refused burst does not extend its own lockout", () => {
    const state = newRateState();
    for (let i = 0; i < 3; i++) {
      authorizeControlCommand({ senderId: "owner-1" }, policy, state, 1_000);
    }
    // 40 refusals at t=2000 must not push the window's tail past t=61_000.
    for (let i = 0; i < 40; i++) {
      authorizeControlCommand({ senderId: "owner-1" }, policy, state, 2_000);
    }
    expect(
      authorizeControlCommand({ senderId: "owner-1" }, policy, state, 62_000).allowed,
    ).toBe(true);
  });
});

// ── 4. The audit records the fact, not the payload ────────────────────────

describe("the audit record carries no raw input and no secret", () => {
  it("records the command name and outcome only", () => {
    const rec = buildControlAudit("status", "owner-1", "answered", null, 123);
    expect(rec).toEqual({
      command: "status",
      senderId: "owner-1",
      outcome: "answered",
      refusedBecause: null,
      atMs: 123,
    });
    // No field can hold the inbound text.
    expect(Object.keys(rec)).not.toContain("text");
    expect(Object.keys(rec)).not.toContain("raw");
  });

  it("a refusal records a reason but still no input", () => {
    const rec = buildControlAudit(null, "owner-1", "refused", "unknown_command", 1);
    expect(rec.command).toBeNull();
    expect(rec.refusedBecause).toBe("unknown_command");
  });
});

// ── 5. One Telegram owner — no second bot ─────────────────────────────────

describe("LabourMarket.ai does not run its own control bot", () => {
  it("no ops module holds bot mechanics", () => {
    // THERE IS DELIBERATELY NO HOSTNAME CHECK HERE, and it is worth saying why
    // rather than leaving its absence to be read as an oversight.
    //
    // An earlier version asserted the source does not mention the Telegram API
    // host. CodeQL flagged it twice — as an unanchored host regex, then, once
    // rewritten with `includes`, as incomplete URL sanitization. Both alerts
    // are false here (this searches SOURCE TEXT in a test; there is no URL and
    // no request), and the tempting move is to disguise the literal until the
    // scanner stops noticing. That is worse than the alert: it leaves a check
    // whose shape lies about what it does.
    //
    // The honest resolution is that the check was REDUNDANT. Section 1 already
    // asserts these modules contain no `fetch(` at all, which strictly
    // subsumes "does not call Telegram" — a module that cannot make a request
    // cannot make one to any host. What remains worth checking is the bot
    // MECHANICS, which no network assertion covers: a token or a sendMessage
    // payload assembled here would mean this file is trying to become the bot,
    // whoever ends up sending it.
    for (const m of OPS_MODULES) {
      const src = code(read(m));
      expect(/BOT_TOKEN|bot\$\{|sendMessage/.test(src), `${m} holds bot mechanics`).toBe(
        false,
      );
    }
  });

  it("the outbound alert path still prefers the Agentai OS bridge", () => {
    // The ownership rule this module follows lives there; if it were ever
    // inverted, inbound control would be following a rule that no longer holds.
    const src = read("lib/notifications/telegram-owner-alerts.ts");
    expect(src).toMatch(/Agentai OS bridge \(PREFERRED\)/);
    expect(src).toMatch(/needs NO Telegram bot token/i);
  });

  it("the comment stripper does not blind the host check (regression)", () => {
    // The bug this guard shipped with for about ten minutes: a naive line-
    // comment strip eats the rest of any line containing a URL, so a real
    // `fetch("https://api.telegram.org/…")` became `fetch("https:` and the
    // check passed. The stripper must remove PROSE without removing the thing
    // being searched for.
    // A neutral host stands in for a vendor one on purpose: what is under test
    // is whether the `//` of a URL survives the stripper, and that is true of
    // any URL. Using a real API host here would make this assertion look like
    // host validation to a scanner, which is the confusion the check above
    // exists to avoid repeating.
    const realLeak = 'const u = "https://vendor.example.com/v1/send";';
    expect(code(realLeak)).toContain("vendor.example.com");
    // …while a genuine line comment is still removed.
    expect(code("const x = 1; // mentions vendor.example.com")).not.toContain(
      "vendor.example.com",
    );
    // …and a block comment too.
    expect(code("/* mentions vendor.example.com */ const x = 1;")).not.toContain(
      "vendor.example.com",
    );
  });

  it("commands this deployment cannot truthfully answer are marked as such", () => {
    // The app has no GitHub token and no checkout: it cannot know main's SHA,
    // CI state or open PRs. Marking them `agentai_os` is what stops a status
    // message from carrying a hardcoded or stale value.
    for (const c of ["ci", "pr", "deploy", "roadmap", "next"] as const) {
      expect(specFor(c).answeredBy, `/${c}`).toBe("agentai_os");
    }
    for (const c of ["status", "health", "testers", "errors", "help"] as const) {
      expect(specFor(c).answeredBy, `/${c}`).toBe("local");
    }
  });
});
