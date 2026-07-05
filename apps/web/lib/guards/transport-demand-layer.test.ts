import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TRANSPORT DEMAND LAYER guards (product-tree branch 15, train §8.5).
 *
 * The transport condition is a CLONE of the accommodation enum path on the
 * REAL demand → RPC → worker-board pipeline (reality-map 2026-07-05 §branch
 * 15: transport previously existed only in the non-persisted marketing
 * preview engine). These pins keep every hop of the clone in lockstep:
 *
 *   - ONE closed enum set — app-side whitelist (demand-request.ts), wizard
 *     options, RPC projection whitelist and worker-board i18n keys must all
 *     agree EXACTLY. No free text can reach the worker board through
 *     transport.
 *   - The RPC recreate stays a strict superset of the prior definition
 *     (Model A verified gate + location label untouched) and remains
 *     human-gated with a rollback restoring the applied Model-A definition.
 *   - The wizard field is optional and honest ("" = not stated → null).
 *   - The app degrades honestly while the migration is not applied (loader
 *     tolerates the missing field; board shows "—").
 */

const APP = join(process.cwd());
const REPO = join(APP, "..", "..");
const MIGRATION = "supabase/migrations/20260705200000_worker_demand_transport.sql";
const ROLLBACK = "supabase/rollbacks/20260705200000_worker_demand_transport.down.sql";

const TRANSPORT_ENUM = ["provided", "compensated", "not_provided", "unknown"];

const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const readWeb = (rel: string) => readFileSync(join(APP, rel), "utf8");
// CRLF-safe comment strip — prose comments may legitimately DISCUSS banned
// shapes; only executable SQL is checked.
const stripSql = (src: string) =>
  src
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

describe("transport migration — strict enum whitelist on the worker RPC", () => {
  const migration = read(MIGRATION);
  const code = stripSql(migration);

  it("projects payload->>'transport' through the exact closed set", () => {
    const m = code.match(
      /when cr\.payload ->> 'transport' in \(([\s\S]*?)\)/i,
    );
    expect(m, "transport whitelist CASE must exist").toBeTruthy();
    const values = [...(m as RegExpMatchArray)[1].matchAll(/'([a-z_]+)'/g)].map(
      (x) => x[1],
    );
    expect([...values].sort()).toEqual([...TRANSPORT_ENUM].sort());
    // Outside the whitelist → NULL, never a raw payload value.
    expect(code).toMatch(/else null[\s\S]{0,40}end as transport/i);
  });

  it("stays a superset of the prior definition (Model A + location label)", () => {
    expect(code).toMatch(
      /join public\.companies c[\s\S]{0,120}verification_status = 'verified'/i,
    );
    expect(code).toMatch(/'approved_direct_partner'::text as route_status/);
    expect(code).toMatch(/as location_label/);
    expect(code).toMatch(/from public\.workers w where w\.profile_id = uid/i);
    // Accommodation whitelist unchanged (the pattern being cloned).
    expect(code).toMatch(/when cr\.payload ->> 'accommodation' in \(/i);
  });

  it("projection stays curated — no free text, no ids beyond the need id", () => {
    for (const banned of [
      "need_summary",
      "notes",
      "payload ->> 'role'",
      "payload ->> 'location'",
      "customer_id",
    ]) {
      expect(code, `must not project ${banned}`).not.toContain(banned);
    }
    const returnsBlock = code.match(/returns table \(([\s\S]*?)\)/i)?.[1] ?? "";
    expect(returnsBlock.length).toBeGreaterThan(0);
    expect(returnsBlock).not.toMatch(/profile_id|company_id|customer/i);
  });

  it("adds NO table/column change — the enum rides the existing payload", () => {
    expect(code).not.toMatch(/alter table/i);
    expect(code).not.toMatch(/add column/i);
    expect(code).not.toMatch(/create table/i);
  });

  it("grant surface unchanged and no policy statements", () => {
    expect(code).toMatch(/revoke all on function/i);
    expect(code).toMatch(/grant execute on function[\s\S]{0,120}to authenticated/i);
    expect(code).not.toMatch(/to anon|to public\b/i);
    expect(code).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/set search_path = public/i);
  });

  it("is a human-gated DRAFT (owner-gated prod apply, never db push)", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
    expect(migration).toMatch(/needs-human-gate/);
    expect(migration).toMatch(/DO NOT APPLY automatically/i);
  });

  it("ships a rollback restoring the applied Model-A definition", () => {
    expect(existsSync(join(REPO, ROLLBACK))).toBe(true);
    const down = stripSql(read(ROLLBACK));
    // The restored body keeps the Model-A counterpart columns…
    expect(down).toMatch(/company_name\s+text/i);
    expect(down).toMatch(/route_status\s+text/i);
    expect(down).toMatch(/'approved_direct_partner'::text as route_status/);
    expect(down).toMatch(/verification_status = 'verified'/);
    // …and carries NO transport artifacts (executable SQL, comments stripped).
    expect(down).not.toMatch(/transport/i);
    expect(down).toMatch(/revoke all on function/i);
    expect(down).toMatch(/grant execute on function[\s\S]{0,120}to authenticated/i);
  });
});

describe("app-side closed set mirrors the RPC whitelist exactly", () => {
  const action = readWeb("lib/demand/demand-request.ts");

  it("demand-request.ts pins the same closed transport set", () => {
    const m = action.match(
      /TRANSPORT_OFFER_VALUES = new Set\(\[([\s\S]*?)\]\)/,
    );
    expect(m, "TRANSPORT_OFFER_VALUES must exist").toBeTruthy();
    const values = [...(m as RegExpMatchArray)[1].matchAll(/"([a-z_]+)"/g)].map(
      (x) => x[1],
    );
    expect([...values].sort()).toEqual([...TRANSPORT_ENUM].sort());
  });

  it("the payload key is set ONLY from the validated enum (never raw input)", () => {
    // transport is derived through the Set membership check…
    expect(action).toMatch(
      /TRANSPORT_OFFER_VALUES\.has\(fields\.transport\)[\s\S]{0,60}\? fields\.transport[\s\S]{0,60}: null/,
    );
    // …and the payload carries the derived const, not fields.transport.
    expect(action).toMatch(/accommodation,\s*\n\s*transport,/);
    expect(action).not.toMatch(/transport:\s*fields\?\.transport/);
    expect(action).not.toMatch(/transport:\s*clamp\(/);
  });
});

describe("wizard field — optional, honest, closed options only", () => {
  const wizard = readWeb("components/app/demand-request-button.tsx");

  it("offers exactly the closed enum values", () => {
    const m = wizard.match(
      /transportOptions: \{ value: string; label: string \}\[\] = \[([\s\S]*?)\];/,
    );
    expect(m, "transportOptions must exist").toBeTruthy();
    const values = [
      ...(m as RegExpMatchArray)[1].matchAll(/value: "([a-z_]+)"/g),
    ].map((x) => x[1]);
    expect([...values].sort()).toEqual([...TRANSPORT_ENUM].sort());
    // Closed select, never a free-text input for transport.
    expect(wizard).toMatch(/testId="demand-transport"/);
  });

  it("is optional — unset submits undefined, never a fabricated value", () => {
    expect(wizard).toMatch(/transport: transport \|\| undefined/);
  });
});

describe("worker board — honest degradation + enum-only display", () => {
  it("the loader tolerates the missing RPC field (pre-apply honesty)", () => {
    const loader = readWeb("lib/opportunities/load-worker-opportunities.ts");
    expect(loader).toMatch(/transport: \(row\.transport as string \| null\) \?\? null/);
  });

  it("the need model documents transport as an optional enum", () => {
    const fit = readWeb("lib/opportunities/opportunity-fit.ts");
    expect(fit).toMatch(/readonly transport\?: string \| null/);
  });

  it("the board renders localized enum labels or an honest dash", () => {
    const page = readWeb("app/[locale]/dashboard/opportunities/page.tsx");
    expect(page).toMatch(/t\("fieldTransport"\)/);
    expect(page).toMatch(/t\.has\(`transport\.\$\{need\.transport\}`\)/);
    expect(page).toMatch(/data-testid="opportunity-transport"/);
  });
});

describe("i18n — transport keys present and non-empty in en/lt/ru", () => {
  for (const locale of ["en", "lt", "ru"]) {
    it(`${locale}.json carries the board + wizard transport catalogue`, () => {
      const messages = JSON.parse(readWeb(`messages/${locale}.json`));
      // Worker board.
      expect(String(messages.opportunities.fieldTransport ?? "").length).toBeGreaterThan(0);
      const board = messages.opportunities.transport ?? {};
      expect(Object.keys(board).sort()).toEqual([...TRANSPORT_ENUM].sort());
      for (const v of TRANSPORT_ENUM) {
        expect(String(board[v] ?? "").length, `${locale} transport.${v}`).toBeGreaterThan(0);
      }
      // Demand wizard (companyNeed catalogue, mirroring the acc* keys).
      for (const key of [
        "transportOffer",
        "transProvided",
        "transCompensated",
        "transNone",
        "transUnknown",
      ]) {
        expect(
          String(messages.companyNeed[key] ?? "").length,
          `${locale} companyNeed.${key}`,
        ).toBeGreaterThan(0);
      }
    });
  }
});
