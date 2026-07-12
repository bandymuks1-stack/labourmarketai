import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  acceptedDestination,
  buildInviteLink,
  INVITATION_TYPES,
  MAX_EMAILS_PER_ACTION,
  parseEmailList,
} from "@/lib/invitations/model";
import { getDashboardModule, getModuleRoute } from "@/lib/dashboard/dashboard-module-registry";
import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";
import { PRIMARY_ROUTES } from "./primary-route-smoke";
import { activeLocales } from "@/lib/i18n/config";

/**
 * Canonical invitations + network contract (core-network area B).
 *
 * The invitation system is ONE typed model whose acceptance creates the
 * CANONICAL relationship (engagement_contexts / project_worker_assignments),
 * with hashed single-use tokens, enforced expiry, revoke/resend, truthful
 * email delivery, and no email enumeration.
 */

const webRoot = join(__dirname, "..", "..");
const repoRoot = join(webRoot, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const MIGRATION = "supabase/migrations/20260712200000_canonical_invitations_v1.sql";
const ROLLBACK = "supabase/rollbacks/20260712200000_canonical_invitations_v1.down.sql";

describe("invitations migration — token security + canonical acceptance", () => {
  const sql = readRepo(MIGRATION);
  const executable = sql.replace(/--[^\n]*/g, " ");

  it("is a DRAFT with the needs-human-gate header and owner-programme marker", () => {
    expect(sql).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY automatically/);
    expect(sql).toMatch(/@human-gate-approved/);
    expect(sql).toMatch(/NOT applied/);
  });

  it("ships a paired rollback file that reverses only this change", () => {
    expect(existsSync(join(repoRoot, ROLLBACK))).toBe(true);
    const down = readRepo(ROLLBACK);
    expect(down).toMatch(/drop table if exists public\.invitations/);
    // Rollback never deletes real memberships created by acceptance.
    expect(down).not.toMatch(/delete from public\.engagement_contexts/i);
    expect(down).not.toMatch(/drop table[^;]*engagement_contexts/i);
  });

  it("stores ONLY sha256(token) — no raw token column, 64-hex enforced", () => {
    expect(executable).toMatch(/token_hash\s+text not null unique check \(char_length\(token_hash\) = 64\)/);
    expect(executable).not.toMatch(/\btoken\s+text\b/);
    expect(executable).toMatch(/\^\[0-9a-f\]\{64\}\$/);
  });

  it("acceptance is single-use with server-side expiry and row locking", () => {
    expect(executable).toMatch(/for update/);
    expect(executable).toMatch(/expires_at <= now\(\)/);
    expect(executable).toMatch(/set status = 'expired'/);
    expect(executable).toMatch(/'already_accepted'/);
  });

  it("acceptance creates the CANONICAL relationship, not a legacy link", () => {
    expect(executable).toMatch(/insert into public\.engagement_contexts/);
    expect(executable).toMatch(/insert into public\.project_worker_assignments/);
    expect(executable).toMatch(/relationship_slug/);
    expect(executable).toMatch(/'collaboration'/);
    // The legacy tables are never written by the canonical accept path.
    expect(executable).not.toMatch(/insert into public\.company_workers/);
    expect(executable).not.toMatch(/insert into public\.agency_workers/);
  });

  it("sender permission is checked server-side per context", () => {
    expect(executable).toMatch(/manages_organization\(p_organization_id\)/);
    expect(executable).toMatch(/can_manage_project\(p_project_id\)/);
    expect(executable).toMatch(/owner_profile_id/);
  });

  it("abuse caps + one-live-invitation dedup are enforced in the RPC", () => {
    expect(executable).toMatch(/>= 100/);
    expect(executable).toMatch(/interval '24 hours'/);
    expect(executable).toMatch(/'rate_limited'/);
    expect(executable).toMatch(/'duplicate_pending'/);
    expect(executable).toMatch(/'limit_reached'/);
  });

  it("no email enumeration: the in-app path matches only the caller's own JWT email", () => {
    expect(executable).toMatch(/auth\.jwt\(\) ->> 'email'/);
    // Wrong-email probes read as not_found — indistinguishable from absent.
    expect(executable).toMatch(/lower\(v_token_row\.invited_email\) <> v_email/);
  });

  it("resend ROTATES the token and is bounded", () => {
    expect(executable).toMatch(/set token_hash = p_new_token_hash/);
    expect(executable).toMatch(/resend_count \+ 1/);
    expect(executable).toMatch(/'resend_limit'/);
  });

  it("delivery state is truthful-only: sent/delivery_failed via a dedicated RPC", () => {
    expect(executable).toMatch(/p_outcome not in \('sent','delivery_failed'\)/);
    expect(sql).toMatch(/provider returned a real accepted\/failed result/i);
  });

  it("RLS: inviter-or-admin SELECT, RPC-only writes, authenticated-only grants", () => {
    expect(executable).toMatch(/enable row level security/);
    expect(executable).toMatch(/inviter_profile_id = auth\.uid\(\) or public\.is_admin\(\)/);
    // No INSERT/UPDATE/DELETE policies on the table.
    expect(executable).not.toMatch(/create policy [^;]*for (insert|update|delete)/i);
    // Never anon.
    expect(executable).not.toMatch(/to anon\b/i);
    expect(executable).toMatch(/grant select on public\.invitations to authenticated/);
    // Every function is definer with a pinned search_path and audit logging.
    const definerCount = (executable.match(/security definer/g) ?? []).length;
    expect(definerCount).toBeGreaterThanOrEqual(9);
    expect((executable.match(/set search_path = public/g) ?? []).length).toBe(definerCount);
    expect(executable).toMatch(/insert into public\.audit_logs/);
  });
});

describe("email adapter — provider-neutral, truthful, server-only", () => {
  const src = read("lib/email/transactional.ts");

  it("is server-only and reads only server env (never NEXT_PUBLIC)", () => {
    expect(src).toMatch(/import "server-only"/);
    expect(src).toMatch(/INVITE_EMAIL_PROVIDER/);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/NEXT_PUBLIC/);
  });

  it("returns 'sent' ONLY on a provider 2xx acknowledgement", () => {
    expect(src).toMatch(/if \(res\.ok\) return \{ status: "sent" \}/);
    expect(src).toMatch(/not_configured/);
    expect(src).toMatch(/transport_error/);
  });

  it("never logs the address or the API key", () => {
    expect(src).not.toMatch(/console\.(log|error|warn|info)/);
  });

  it("no provider names leak into user-facing copy", () => {
    const collectValues = (node: unknown, out: string[]) => {
      if (typeof node === "string") out.push(node);
      else if (node && typeof node === "object") {
        for (const v of Object.values(node as Record<string, unknown>)) {
          collectValues(v, out);
        }
      }
    };
    for (const loc of activeLocales) {
      const values: string[] = [];
      collectValues(JSON.parse(read(`messages/${loc}.json`)).network ?? {}, values);
      const blob = values.join(" • ").toLowerCase();
      expect(blob, `${loc}: provider name in network copy`).not.toMatch(
        /\bresend\.com\b|postmark|sendgrid|mailgun|smtp/,
      );
    }
  });
});

describe("server actions — token custody + truthful delivery", () => {
  const src = read("lib/invitations/actions.ts");

  it("mints 32-byte tokens and stores only the sha256 hash", () => {
    expect(src).toMatch(/randomBytes\(32\)\.toString\("base64url"\)/);
    expect(src).toMatch(/createHash\("sha256"\)/);
    expect(src).toMatch(/p_token_hash: hash/);
  });

  it("records delivery ONLY from the real provider result", () => {
    expect(src).toMatch(/sendResult\.status === "sent" \? "sent" : "delivery_failed"/);
    expect(src).toMatch(/mark_invitation_delivery_v1/);
    // Without a configured provider the outcome stays 'created' (link mode).
    expect(src).toMatch(/if \(!emailConfigured\)/);
  });

  it("degrades honestly while the owner-gated migration is unapplied", () => {
    expect(src).toMatch(/needs-migration/);
    expect(src).toMatch(/42P01/);
    expect(src).toMatch(/42883/);
  });
});

describe("invitation model — pure parsing and destinations", () => {
  it("splits, validates, dedupes and caps a pasted address list", () => {
    const parsed = parseEmailList(
      "a@b.lt, A@B.LT bad-address;c@d.eu\nne pastas d@e.eu",
    );
    expect(parsed.valid).toEqual(["a@b.lt", "c@d.eu", "d@e.eu"]);
    expect(parsed.invalid).toEqual(["bad-address", "ne", "pastas"]);
    expect(parsed.overflow).toEqual([]);
  });

  it("one bad address never cancels the valid ones", () => {
    const parsed = parseEmailList("valid@x.lt, %%%");
    expect(parsed.valid).toEqual(["valid@x.lt"]);
    expect(parsed.invalid).toEqual(["%%%"]);
  });

  it(`caps a single action at ${MAX_EMAILS_PER_ACTION} addresses, listing the overflow`, () => {
    const many = Array.from({ length: 14 }, (_, i) => `p${i}@x.lt`).join(",");
    const parsed = parseEmailList(many);
    expect(parsed.valid).toHaveLength(MAX_EMAILS_PER_ACTION);
    expect(parsed.overflow).toHaveLength(14 - MAX_EMAILS_PER_ACTION);
  });

  it("invite links carry locale + token; acceptance lands in the exact context", () => {
    expect(buildInviteLink("https://labourmarket.ai/", "lt", "tok123")).toBe(
      "https://labourmarket.ai/lt/invite/tok123",
    );
    expect(
      acceptedDestination({ invitationType: "join_project", projectId: "p1" }),
    ).toBe("/dashboard/projects/p1");
    expect(
      acceptedDestination({ invitationType: "join_organization" }),
    ).toBe("/dashboard");
  });

  it("the seven canonical invitation types are frozen", () => {
    expect([...INVITATION_TYPES]).toEqual([
      "join_platform",
      "join_organization",
      "join_team",
      "join_as_employee",
      "collaborate_partner",
      "join_project",
      "invite_company",
    ]);
  });
});

describe("network surface — registered, private, no second dashboard", () => {
  it("module registry: network → /dashboard/network, grid+command, ALL roles", () => {
    const m = getDashboardModule("network");
    expect(getModuleRoute("network")).toBe("/dashboard/network");
    expect(m.surfaces).toContain("grid");
    expect(m.surfaces).toContain("command");
    expect([...m.roles].sort()).toEqual(
      ["agency", "company", "customer", "worker"].sort(),
    );
  });

  it("command registry + smoke inventory carry the route with 5-locale copy", () => {
    const entry = COMMAND_REGISTRY.find((e) => e.id === "network");
    expect(entry).toBeTruthy();
    expect(entry!.route).toBe("/dashboard/network");
    for (const loc of activeLocales) {
      expect(entry!.labels[loc]?.trim().length, `label ${loc}`).toBeGreaterThan(0);
    }
    const smoke = PRIMARY_ROUTES.find((r) => r.urlPattern === "/dashboard/network");
    expect(smoke).toBeTruthy();
    expect(smoke!.requiresAuth).toBe(true);
  });

  it("the public search never selects email, phone or exact location", () => {
    const src = read("lib/invitations/network.ts");
    // Scope to the searchPeopleAndCompanies function body (the inviter's own
    // sent-invitations list legitimately shows the address the inviter typed).
    const start = src.indexOf("export async function searchPeopleAndCompanies");
    const end = src.indexOf("export ", start + 10);
    const body = src.slice(start, end === -1 ? undefined : end);
    const selects = [...body.matchAll(/\.select\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(selects.length).toBeGreaterThan(0);
    for (const cols of selects) {
      expect(cols).not.toMatch(/email/);
      expect(cols).not.toMatch(/phone/);
      expect(cols).not.toMatch(/address|latitude|longitude|geo/);
    }
  });

  it("people contact goes through the permission-gated message flow", () => {
    const page = read("app/[locale]/dashboard/network/page.tsx");
    expect(page).toMatch(/MessageButton/);
    expect(page).not.toMatch(/mailto:|tel:/);
  });

  it("company + project surfaces link the ONE canonical invite action", () => {
    expect(read("app/[locale]/dashboard/company/page.tsx")).toMatch(
      /dashboard\/network\?type=join_as_employee/,
    );
    expect(read("app/[locale]/dashboard/projects/[id]/operations/page.tsx")).toMatch(
      /dashboard\/network\?type=join_project&project=/,
    );
  });
});

describe("invite deep link survives auth + onboarding", () => {
  it("the invite page bounces unauthenticated visitors with ?next back to itself", () => {
    const page = read("app/[locale]/invite/[token]/page.tsx");
    expect(page).toMatch(/auth\/login\?next=/);
    expect(page).toMatch(/get_invitation_preview_v1/);
  });

  it("onboarding completion honors a safe ?next (invite links included)", () => {
    const actions = read("lib/auth/actions.ts");
    expect(actions).toMatch(/isSafeReturnPath\(nextRaw\)/);
    expect(actions).toMatch(/getSafeReturnPath\(nextRaw, locale\)/);
    const onboarding = read("app/[locale]/onboarding/page.tsx");
    expect(onboarding).toMatch(/isSafeReturnPath\(next\)/);
    expect(read("components/app/onboarding-wizard.tsx")).toMatch(
      /form\.set\("next", returnTo\)/,
    );
  });
});

describe("env gate is documented, secrets never client-side", () => {
  it(".env.example documents the owner-gated email activation", () => {
    const env = readRepo(".env.example");
    expect(env).toMatch(/INVITE_EMAIL_PROVIDER/);
    expect(env).toMatch(/INVITE_EMAIL_API_KEY/);
    expect(env).toMatch(/INVITE_EMAIL_FROM/);
    expect(env).toMatch(/SPF \+ DKIM/);
    expect(env).not.toMatch(/NEXT_PUBLIC_INVITE/);
  });
});
