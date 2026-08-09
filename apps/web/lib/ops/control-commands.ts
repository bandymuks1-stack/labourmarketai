/**
 * Operator control commands — PURE contract, parser and safety classification.
 *
 * WHO OWNS THE BOT. `lib/notifications/telegram-owner-alerts.ts` already
 * settled this for the outbound direction: **Agentai OS owns the Telegram
 * channel**, and LabourMarket.ai deliberately holds no bot token of its own.
 * Inbound control follows the same rule rather than contradicting it. This
 * module is NOT a Telegram bot and never will be — it is the command contract
 * Agentai OS calls once it has already authenticated the human on its side.
 *
 * That is why none of this is blocked on a credential. A missing bot token
 * blocks the LIVE CHANNEL. It does not block the command vocabulary, the
 * parser, the authorization model, the rate limiter, the audit record or the
 * refusal of everything dangerous — all of which are the parts worth reviewing
 * carefully, and all of which are here.
 *
 * THE SAFETY PROPERTY, stated so it can be checked rather than believed:
 * **there is no command that executes caller-supplied text.** Not shell, not
 * SQL, not a prompt forwarded to a model. The command set is a CLOSED
 * ENUMERATION of read-only questions; anything not in it is rejected by the
 * parser before authorization is even consulted. A mutation is not "disabled
 * pending review" — it is unrepresentable, because no mutating command type
 * exists to represent it. `lib/guards/control-command-safety.test.ts` pins that.
 *
 * Pure. No IO, no env, no server-only, no network.
 */

/** The complete, closed set of commands. READ-ONLY BY CONSTRUCTION. */
export const CONTROL_COMMANDS = [
  "status",
  "ci",
  "pr",
  "deploy",
  "testers",
  "errors",
  "health",
  "roadmap",
  "next",
  "help",
] as const;
export type ControlCommand = (typeof CONTROL_COMMANDS)[number];

/**
 * What a command is allowed to do.
 *
 * Only `read` exists today, and the type is a union of ONE on purpose: adding a
 * mutating command must be a deliberate widening of this type that a reviewer
 * cannot miss, not a new entry in a list that already tolerates mutation.
 */
export type ControlEffect = "read";

export interface ControlCommandSpec {
  readonly command: ControlCommand;
  readonly effect: ControlEffect;
  /** One line, shown by /help. */
  readonly summary: string;
  /**
   * Where the answer comes from. `local` = this application can answer from its
   * own runtime and database. `agentai_os` = the caller already holds it (git,
   * CI, PRs) and this app must NOT pretend to know it.
   */
  readonly answeredBy: "local" | "agentai_os";
}

/**
 * The registry.
 *
 * `answeredBy` is the honest half of this design. LabourMarket.ai's web app has
 * no GitHub token and no git checkout — it genuinely cannot know the current
 * main SHA, whether CI is green, or how many PRs are open. Agentai OS already
 * has all three. Marking those `agentai_os` means this app returns an explicit
 * "not mine to answer" instead of a stale or invented value, which is the
 * failure mode a hardcoded SHA in a status message would have produced.
 */
export const CONTROL_COMMAND_REGISTRY: readonly ControlCommandSpec[] = [
  {
    command: "status",
    effect: "read",
    summary: "Runtime + supply snapshot this deployment can actually see",
    answeredBy: "local",
  },
  {
    command: "health",
    effect: "read",
    summary: "Is the app serving, and is its database reachable",
    answeredBy: "local",
  },
  {
    command: "testers",
    effect: "read",
    summary: "Recent tester feedback volume (counts only, never content)",
    answeredBy: "local",
  },
  {
    command: "errors",
    effect: "read",
    summary: "Recent error-class counts (counts only, never payloads)",
    answeredBy: "local",
  },
  {
    command: "roadmap",
    effect: "read",
    summary: "Open owner gates recorded in the repo",
    answeredBy: "agentai_os",
  },
  {
    command: "next",
    effect: "read",
    summary: "The next queued step",
    answeredBy: "agentai_os",
  },
  {
    command: "ci",
    effect: "read",
    summary: "CI state for the current main",
    answeredBy: "agentai_os",
  },
  {
    command: "pr",
    effect: "read",
    summary: "Open pull requests",
    answeredBy: "agentai_os",
  },
  {
    command: "deploy",
    effect: "read",
    summary: "Latest deployment state",
    answeredBy: "agentai_os",
  },
  {
    command: "help",
    effect: "read",
    summary: "List the available commands",
    answeredBy: "local",
  },
];

export function specFor(c: ControlCommand): ControlCommandSpec {
  const found = CONTROL_COMMAND_REGISTRY.find((s) => s.command === c);
  // Total by construction — CONTROL_COMMANDS and the registry are checked
  // against each other in control-commands.test.ts.
  if (!found) throw new Error(`no spec for control command "${c}"`);
  return found;
}

export type ParseResult =
  | { readonly ok: true; readonly command: ControlCommand }
  | {
      readonly ok: false;
      readonly reason:
        | "empty"
        | "not_a_command"
        | "unknown_command"
        | "arguments_not_accepted"
        | "too_long";
      /** Safe to show the operator. Never echoes the rejected input. */
      readonly detail: string;
    };

/** Anything longer than this is refused unread. */
export const MAX_COMMAND_LENGTH = 64;

/**
 * Parse one inbound line into a command, or refuse it.
 *
 * ARGUMENTS ARE REFUSED OUTRIGHT, and that is the single most important line in
 * this file. Every dangerous control bot in the world got that way by accepting
 * an argument — `/run <cmd>`, `/sql <query>`, `/deploy <branch>` — because an
 * argument is the seam through which caller-supplied text becomes execution.
 * With no arguments there is nothing to inject INTO: the entire input is
 * matched against a closed enumeration, and the parser's output is a member of
 * that enumeration rather than anything derived from what was typed.
 *
 * The rejected input is never echoed back. A control channel that quotes what
 * it refused is a reflection surface, and the operator already knows what they
 * typed.
 */
export function parseControlCommand(raw: string): ParseResult {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") {
    return { ok: false, reason: "empty", detail: "no command given" };
  }
  if (text.length > MAX_COMMAND_LENGTH) {
    return {
      ok: false,
      reason: "too_long",
      detail: `commands are at most ${MAX_COMMAND_LENGTH} characters`,
    };
  }
  if (!text.startsWith("/")) {
    return {
      ok: false,
      reason: "not_a_command",
      detail: "commands start with /",
    };
  }

  // Split on ANY whitespace so a trailing argument is detected rather than
  // silently absorbed into the command word.
  const parts = text.slice(1).split(/\s+/);
  const word = parts[0].toLowerCase();
  // Telegram addresses a bot as /status@somebot in group chats. Accept that
  // shape, but only the shape — the suffix is discarded, never interpreted.
  const bare = word.split("@")[0];

  if (!(CONTROL_COMMANDS as readonly string[]).includes(bare)) {
    return {
      ok: false,
      reason: "unknown_command",
      detail: "not a recognised command — send /help",
    };
  }
  if (parts.length > 1) {
    return {
      ok: false,
      reason: "arguments_not_accepted",
      detail: `/${bare} takes no arguments`,
    };
  }
  return { ok: true, command: bare as ControlCommand };
}

/** /help text, generated from the registry so it can never drift from it. */
export function helpText(): string {
  return CONTROL_COMMAND_REGISTRY.map(
    (s) => `/${s.command} — ${s.summary}`,
  ).join("\n");
}
