import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the web push channel (COM-3, 2026-10-23).
 *
 *   · OFF by default: one env flag plus owner-entered VAPID keys; the opt-in
 *     is not rendered and no service worker is registered while it is off.
 *   · One spine: push is a hop AFTER the durable notification_events insert,
 *     never a second notification system; the opt-in lives in
 *     notification_preferences.
 *   · No keys in the repository, no SSRF, no message content on a lock screen.
 */
const root = resolve(__dirname, "..", "..");
const repo = resolve(root, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const readRepo = (rel: string) => readFileSync(resolve(repo, rel), "utf8");
const MIGRATION = "supabase/migrations/20261023170000_web_push_subscriptions_v1.sql";

describe("off by default, hidden while off", () => {
  it("the flag must be exactly 'true' and every key present", () => {
    const config = read("lib/notifications/web-push-config.ts");
    expect(config).toMatch(/clean\(env\.WEB_PUSH_ENABLED\) !== "true"/);
    expect(config).not.toMatch(/WEB_PUSH_ENABLED\s*\?\?\s*"true"/);
  });

  it("the account page mounts the opt-in only when the channel is active", () => {
    const page = read("app/[locale]/dashboard/account/page.tsx");
    expect(page).toMatch(/webPushClientConfig\(\)/);
    expect(page).toMatch(/push\.active && push\.publicKey \? \(\s*<WebPushOptIn/);
  });

  it("the service worker is registered on the person's click, never on load", () => {
    const optIn = read("components/app/web-push-opt-in.tsx");
    const registerAt = optIn.indexOf('serviceWorker.register("/sw.js"');
    expect(registerAt).toBeGreaterThan(optIn.indexOf("const turnOn = async"));
    for (const file of walk(resolve(root, "app")).concat(walk(resolve(root, "components")))) {
      if (file.endsWith("web-push-opt-in.tsx")) continue;
      expect(readFileSync(file, "utf8"), file).not.toMatch(/serviceWorker\.register\(/);
    }
  });

  it("the server refuses to subscribe while the channel is off; turning off always works", () => {
    const actions = read("lib/notifications/web-push-actions.ts");
    const on = actions.slice(actions.indexOf("export async function registerWebPushSubscriptionAction"));
    expect(on).toMatch(/if \(!webPushStatus\(\)\.active\) return \{ kind: "not_active" \}/);
    const off = actions.slice(actions.indexOf("export async function unregisterWebPushSubscriptionAction"));
    expect(off).not.toMatch(/webPushStatus/);
  });
});

describe("one notification spine", () => {
  it("push runs after the durable insert, beside the e-mail hop, never instead of it", () => {
    const emitters = read("lib/notifications/event-emitters.ts");
    const deliver = emitters.slice(emitters.indexOf("async function deliverDetailed("));
    const insertAt = deliver.indexOf("emitNotificationEvent(admin, input)");
    const pushAt = deliver.indexOf("maybeDispatchWebPush(admin, input, prefRows)");
    expect(insertAt).toBeGreaterThan(0);
    expect(pushAt).toBeGreaterThan(insertAt);
    expect(deliver.slice(0, pushAt)).toMatch(/if \(outcome\.kind === "written"\)/);
  });

  it("the opt-in is a notification_preferences row, not a second preference store", () => {
    const prefs = read("lib/notifications/notification-preferences.ts");
    expect(prefs).toMatch(/PUSH_OPT_IN_TYPE = "\*"/);
    expect(prefs).toMatch(/\.from\("notification_preferences"\)/);
    const sql = readRepo(MIGRATION);
    expect(sql).toMatch(/check \(channel in \('in_app', 'email', 'push'\)\)/);
    expect(sql.match(/create table/gi)?.length).toBe(1);
  });

  it("the push payload is the bell's type title and link — no message text", () => {
    const dispatch = read("lib/notifications/web-push-dispatch.ts");
    expect(dispatch).toMatch(/JSON\.stringify\(\{ title: rendered\.subject, url: rendered\.deepLink, tag: input\.eventType \}\)/);
    expect(dispatch).not.toMatch(/rendered\.text/);
  });
});

describe("safety", () => {
  it("only allowlisted push services are called (no server-side request to a chosen URL)", () => {
    const dispatch = read("lib/notifications/web-push-dispatch.ts");
    expect(dispatch).toMatch(/filter\(\(s\) => isAllowedPushEndpoint\(s\.endpoint\)\)/);
    expect(dispatch).toMatch(/redirect: "error"/);
    expect(read("lib/notifications/web-push-actions.ts")).toMatch(/isValidSubscription\(input\)/);
  });

  it("no VAPID private key is committed anywhere in the app or the repo env examples", () => {
    const offenders: string[] = [];
    for (const file of walk(root)) {
      if (!/\.(ts|tsx|js|mjs|json|md|env|example)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      if (/WEB_PUSH_VAPID_PRIVATE_KEY\s*=\s*[A-Za-z0-9_-]{40,}/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the service worker caches nothing and opens same-origin links only", () => {
    const sw = read("public/sw.js");
    expect(sw).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(sw).not.toMatch(/caches\./);
    expect(sw).toMatch(/u\.origin === self\.location\.origin/);
  });

  it("the table is own-row only, written through the command, and registered for erasure", () => {
    const sql = readRepo(MIGRATION)
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/using \(profile_id = auth\.uid\(\)\)/);
    expect(sql).toMatch(/revoke all on public\.web_push_subscriptions from authenticated;/);
    expect(sql).toMatch(/grant select, delete on public\.web_push_subscriptions to authenticated;/);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).not.toMatch(/using \(true\)/i);
    expect(sql).toMatch(/'web_push_subscriptions', 'profile_id', 'profiles', 'cascade', 'allow_cascade'/);
    expect(readRepo("supabase/rollbacks/20261023170000_web_push_subscriptions_v1.down.sql")).toMatch(/rollback refused/);
  });
});

describe("copy in the six active locales", () => {
  it("every opt-in string exists", () => {
    for (const locale of ["lt", "en", "ru", "de", "pl", "nl"]) {
      const cat = JSON.parse(read(`messages/${locale}.json`));
      for (const k of ["title", "intro", "turnOn", "turnOff", "working", "on", "off", "unsupported", "blocked", "error"]) {
        expect(cat.notificationPrefs?.push?.[k], `${locale} notificationPrefs.push.${k}`).toBeTruthy();
      }
    }
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
