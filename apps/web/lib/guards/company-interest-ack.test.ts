import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COMPANY_ACK_STATUSES,
  isCompanyAckStatus,
  WORKER_WRITABLE_INTEREST_STATUSES,
} from "@/lib/opportunities/interest-snapshot";

/**
 * COMPANY INTEREST ACKNOWLEDGEMENT GUARDS (PR7).
 *
 * The company acknowledgement must be: ownership-gated (only the demand
 * owner, enforced INSIDE the SECURITY DEFINER RPC), status-whitelisted
 * (reviewed/contacted only — never interested/withdrawn), respectful of the
 * worker's withdrawal (immutable to the company), internal-only (no external
 * sending), and honestly labeled on both sides.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

describe("status sets stay disjoint and closed", () => {
  it("company set is exactly reviewed/contacted; worker set unchanged", () => {
    expect([...COMPANY_ACK_STATUSES].sort()).toEqual(["contacted", "reviewed"]);
    expect([...WORKER_WRITABLE_INTEREST_STATUSES].sort()).toEqual([
      "interested",
      "withdrawn",
    ]);
    // No overlap: the company can never impersonate a worker act and
    // vice versa.
    for (const s of COMPANY_ACK_STATUSES) {
      expect(WORKER_WRITABLE_INTEREST_STATUSES).not.toContain(s);
    }
    expect(isCompanyAckStatus("interested")).toBe(false);
    expect(isCompanyAckStatus("withdrawn")).toBe(false);
    expect(isCompanyAckStatus("verified")).toBe(false);
  });

  it("the server flow rejects non-ack statuses before touching the DB", () => {
    const src = read("lib/opportunities/interest.ts");
    const fn = src.slice(src.indexOf("export async function acknowledgeInterest"));
    expect(fn).toMatch(/"reviewed"/);
    expect(fn).toMatch(/"contacted"/);
    expect(fn).toMatch(/kind: "invalid"/);
    expect(fn).toMatch(/acknowledge_demand_interest/);
  });
});

describe("the RPC migration enforces ownership + whitelist + withdrawal (SQL pins)", () => {
  const migration = readFileSync(
    join(REPO_ROOT, "supabase", "migrations", "20260705120000_demand_interest_company_ack.sql"),
    "utf8",
  );
  const code = migration
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

  it("caller must own the demand (checked inside the function)", () => {
    expect(code).toMatch(/profile_id into v_owner/);
    expect(code).toMatch(/v_owner is null or v_owner <> uid/);
    expect(code).toMatch(/auth\.uid\(\)/);
  });

  it("status whitelist is reviewed/contacted only", () => {
    expect(code).toMatch(/p_status not in \('reviewed','contacted'\)/);
  });

  it("a withdrawn signal is immutable to the company", () => {
    expect(code).toMatch(/v_cur = 'withdrawn'/);
    expect(code).toMatch(/status <> 'withdrawn'/);
  });

  it("only status + updated_at are written", () => {
    const update = code.slice(code.indexOf("update public.demand_interest_signals"));
    const setClause = update.slice(0, update.indexOf("where"));
    expect(setClause).toMatch(/set status = p_status/);
    expect(setClause).toMatch(/updated_at = now\(\)/);
    expect(setClause).not.toMatch(/note|match_snapshot|worker_id|request_id\s*=/);
  });

  it("definer hygiene: pinned search_path, revoked public/anon, authenticated-only execute", () => {
    expect(code).toMatch(/set search_path = public/);
    expect(code).toMatch(/revoke all on function[\s\S]*?from public/);
    expect(code).toMatch(/revoke all on function[\s\S]*?from anon/);
    expect(code).toMatch(/grant execute on function[\s\S]*?to authenticated/);
    expect(migration).toMatch(/@human-gate-approved/);
  });

  it("no table/policy change and no data DML beyond the gated update", () => {
    expect(code).not.toMatch(/create table|alter table|create policy|drop policy|drop table/i);
    expect(code).not.toMatch(/\bdelete from\b/i);
    expect(code).not.toMatch(/\binsert into\b/i);
  });

  it("rollback exists and drops the function only", () => {
    const rollback = readFileSync(
      join(REPO_ROOT, "supabase", "rollbacks", "20260705120000_demand_interest_company_ack.down.sql"),
      "utf8",
    );
    expect(rollback).toMatch(/drop function if exists public\.acknowledge_demand_interest/);
    expect(rollback).not.toMatch(/drop table|delete from|truncate/i);
  });
});

describe("no external sending; honest internal-only copy", () => {
  const FORBIDDEN = [
    /\bfetch\s*\(/,
    /mailto:/i,
    /nodemailer|sendgrid|resend|postmark|mailgun/i,
    /twilio|whatsapp|telegram/i,
    /smtp/i,
    /webhook/i,
    /https?:\/\//i,
  ];

  it("ack component and actions contain no outbound primitive", () => {
    for (const rel of [
      "components/app/company-interest-ack.tsx",
      "lib/opportunities/interest-actions.ts",
      "lib/opportunities/interest.ts",
    ]) {
      const src = stripComments(read(rel));
      for (const re of FORBIDDEN) {
        expect(re.test(src), `${rel} matches ${re}`).toBe(false);
      }
    }
  });

  it("company-side internal-only copy exists in all active locales", () => {
    for (const [locale, needle] of [
      ["en", "nothing is sent"],
      ["lt", "niekas nesiunčiama"],
      ["ru", "ничего не отправляется"],
    ] as const) {
      const j = JSON.parse(read(`messages/${locale}.json`)) as {
        scouting?: { ack?: { internalNote?: string } };
      };
      expect(j.scouting?.ack?.internalNote ?? "", `${locale}`).toContain(needle);
    }
  });

  it("worker-side status labels are honest acknowledgements, not applications", () => {
    for (const locale of ["en", "lt", "ru"] as const) {
      const j = JSON.parse(read(`messages/${locale}.json`)) as {
        opportunities?: { interest?: Record<string, string> };
      };
      const interest = j.opportunities?.interest ?? {};
      expect(interest.reviewed, `${locale} reviewed label`).toBeTruthy();
      expect(interest.contacted, `${locale} contacted label`).toBeTruthy();
      const blob = JSON.stringify(interest).toLowerCase();
      // No application-status theater.
      expect(blob).not.toMatch(/hired|accepted|application status|job offer/);
    }
  });

  it("the scouting ack panel renders ONLY for real signals", () => {
    const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
    expect(page).toMatch(/result\.interestByWorker\[c\.workerId\]\s*\?[\s\S]{0,80}CompanyInterestAck/);
    expect(page).not.toMatch(/mailto:|apply now/i);
  });

  it("no function props cross the server→client boundary into CompanyInterestAck", () => {
    // 2026-07-23 employer-response E2E first break: the server page passed
    // `statusLabel: (s) => …` into the "use client" ack component. RSC cannot
    // serialize a function prop, so the WHOLE scouting page crashed the first
    // time any interest signal rendered — the company could never see an
    // interested candidate. Labels must stay a plain serializable map.
    const component = read("components/app/company-interest-ack.tsx");
    expect(component).toMatch(/statusLabels:\s*Record<string,\s*string>/);
    expect(component).not.toMatch(/statusLabel\??:\s*\(/);

    const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
    const ackCall = page.slice(page.indexOf("<CompanyInterestAck"));
    const labelsBlock = ackCall.slice(0, ackCall.indexOf("/>"));
    // The label value must be the serializable map, never a function-valued
    // `statusLabel:` prop. (Arrows are fine only when EXECUTED server-side,
    // e.g. inside Object.fromEntries — what matters is the prop value type.)
    expect(labelsBlock).not.toMatch(/statusLabel:\s*\(/);
    expect(labelsBlock).toMatch(/statusLabels:\s*Object\.fromEntries/);
  });
});
