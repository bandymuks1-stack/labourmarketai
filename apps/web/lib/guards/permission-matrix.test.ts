import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MATRIX_ROLES,
  MESSAGING_RULES,
  PERMISSION_MATRIX,
  type MatrixAccess,
} from "@/lib/legal/permission-matrix";

/**
 * Permission-matrix guard (CR train WAGON 7, audit area 12).
 *
 * The matrix on /legal/data-access explains, per role and surface, what can
 * be SEEN and what can be CHANGED. Its honesty is structural:
 *
 *   1. SOURCE-BACKED — every matrix row / messaging rule carries `sources`
 *      pointers that must resolve IN-REPO (file exists; `#fragment` policy /
 *      function name appears in that file). A renamed policy breaks CI, not
 *      the truth of the page.
 *   2. DATA-DRIVEN — the table component renders ONLY from
 *      lib/legal/permission-matrix.ts. No hardcoded rows or source strings in
 *      the component/page, so rendered claims cannot drift from the module.
 *   3. NO OVER-CLAIMS — "everyone can see" style wording (en/lt/ru) is banned
 *      in the matrix copy, as are verified/guaranteed claims. Where the source
 *      is narrower than a label, the matrix must UNDER-claim.
 *   4. HONESTY PINS — the strongest boundaries (admin-only follow-up, own-only
 *      profiles, worker-only board) are pinned to their exact access levels.
 *   5. i18n completeness — every module key has non-empty en/lt/ru copy.
 *
 * The wagon-2 pack guards (compliance-explanation-pack, legal-pages-public-
 * clean) keep covering the page itself; this guard covers the matrix layer.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");

const LOCALES = ["en", "lt", "ru"] as const;
const ACCESS: readonly MatrixAccess[] = ["yes", "own", "limited", "no"];

const ALL_SOURCES: ReadonlyArray<{ owner: string; pointer: string }> = [
  ...PERMISSION_MATRIX.flatMap((r) => r.sources.map((s) => ({ owner: `row ${r.key}`, pointer: s }))),
  ...MESSAGING_RULES.flatMap((r) => r.sources.map((s) => ({ owner: `messaging ${r.key}`, pointer: s }))),
];

describe("1 · every source pointer resolves in-repo", () => {
  it("every row and messaging rule carries at least one source", () => {
    for (const row of PERMISSION_MATRIX) {
      expect(row.sources.length, `row ${row.key} has no sources`).toBeGreaterThan(0);
    }
    for (const rule of MESSAGING_RULES) {
      expect(rule.sources.length, `rule ${rule.key} has no sources`).toBeGreaterThan(0);
    }
  });

  for (const { owner, pointer } of ALL_SOURCES) {
    it(`${owner}: ${pointer}`, () => {
      const [rel, fragment] = pointer.split("#");
      const abs = join(REPO, rel);
      expect(existsSync(abs), `missing source file: ${rel}`).toBe(true);
      if (fragment) {
        const content = readFileSync(abs, "utf8");
        expect(
          content.includes(fragment),
          `${rel} does not contain "${fragment}" — policy/function renamed?`,
        ).toBe(true);
      }
    });
  }
});

describe("2 · matrix data shape is complete and machine-checkable", () => {
  it("has at least 10 surfaces and unique keys", () => {
    expect(PERMISSION_MATRIX.length).toBeGreaterThanOrEqual(10);
    const keys = PERMISSION_MATRIX.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every cell carries a valid access level for every role", () => {
    for (const row of PERMISSION_MATRIX) {
      for (const role of MATRIX_ROLES) {
        expect(ACCESS, `row ${row.key} see.${role}`).toContain(row.see[role]);
        expect(ACCESS, `row ${row.key} edit.${role}`).toContain(row.edit[role]);
      }
    }
  });

  it("covers the wagon-7 required surfaces", () => {
    const keys = new Set(PERMISSION_MATRIX.map((r) => r.key));
    for (const required of [
      "profileAccount",
      "workerCard",
      "workJournal",
      "demandPosting",
      "workerBoard",
      "messages",
      "handover",
      "followUp",
      "adminPanels",
    ]) {
      expect(keys.has(required), `matrix misses surface ${required}`).toBe(true);
    }
  });
});

describe("3 · the table renders from the data module ONLY", () => {
  const component = read("components/marketing/permission-matrix-table.tsx");
  const page = read("app/[locale]/(marketing)/legal/data-access/page.tsx");

  it("component imports the module and maps over it", () => {
    expect(component).toMatch(/from "@\/lib\/legal\/permission-matrix"/);
    expect(component).toMatch(/PERMISSION_MATRIX\.map\(/);
    expect(component).toMatch(/MESSAGING_RULES\.map\(/);
    expect(component).toMatch(/MATRIX_ROLES\.map\(/);
  });

  it("component contains no hardcoded rows or source pointers", () => {
    expect(component).not.toMatch(/supabase\/migrations/);
    expect(component).not.toMatch(/sources:\s*\[/);
    expect(component).not.toMatch(/see:\s*\{/);
    // Row copy comes from i18n keys derived from row.key — never literals.
    expect(component).toMatch(/t\(`rows\.\$\{row\.key\}\.surface`\)/);
  });

  it("data-access page renders the matrix section (anchored)", () => {
    expect(page).toMatch(/PermissionMatrixSection/);
    expect(component).toMatch(/id="matrix"/);
    expect(component).toMatch(/data-testid="permission-matrix"/);
    expect(component).toMatch(/data-testid="permission-matrix-messaging"/);
  });

  it("table is a real accessible table with scoped headers", () => {
    expect(component).toMatch(/<table/);
    expect(component).toMatch(/scope="col"/);
    expect(component).toMatch(/scope="row"/);
    expect(component).toMatch(/overflow-x-auto/);
  });
});

describe("4 · findability: account + admin control room link the matrix", () => {
  it("account privacy section links /legal/data-access (wagon-2 chain intact)", () => {
    const account = read("app/[locale]/dashboard/account/page.tsx");
    expect(account).toMatch(/data-testid="account-privacy-data"/);
    expect(account).toContain('href="/legal/data-access"');
  });

  it("admin control room links the matrix anchor", () => {
    const admin = read("app/[locale]/dashboard/admin/page.tsx");
    expect(admin).toContain('"/legal/data-access#matrix"');
    expect(admin).toContain('"admin-tools-hub-permission-matrix"');
  });
});

// ---------------------------------------------------------------------------
// 5 · over-claim bans in the matrix copy (en/lt/ru).
// ---------------------------------------------------------------------------
const OVER_CLAIMS: Array<{ re: RegExp; why: string }> = [
  { re: /everyone can (see|view|read)/i, why: "EN: 'everyone can see' over-claim" },
  { re: /visible to (everyone|anyone|all)/i, why: "EN: 'visible to everyone' over-claim" },
  { re: /\bverified\b/i, why: "EN: 'verified' claim (no verification wording in matrix)" },
  { re: /\bguaranteed?\b/i, why: "EN: guarantee claim" },
  { re: /visi mato/i, why: "LT: 'visi mato' over-claim" },
  { re: /mato visi\b/i, why: "LT: 'mato visi' over-claim" },
  { re: /matom\w+ visiems/i, why: "LT: 'matoma visiems' over-claim" },
  { re: /garantuo\w*/i, why: "LT: guarantee claim" },
  { re: /все видят/i, why: "RU: 'все видят' over-claim" },
  { re: /вид(ен|но|на)\s+всем/i, why: "RU: 'виден всем' over-claim" },
  { re: /гарантир\w*/i, why: "RU: guarantee claim" },
];

function stringValues(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((v) => stringValues(v, out));
  else if (node && typeof node === "object")
    for (const v of Object.values(node as Record<string, unknown>)) stringValues(v, out);
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadLocale = (loc: string): any => JSON.parse(read(`messages/${loc}.json`));

describe("5 · no over-claim / fake-certainty tokens in matrix copy", () => {
  for (const loc of LOCALES) {
    const matrix = loadLocale(loc).legal?.dataAccess?.matrix;
    const values = stringValues(matrix);
    for (const { re, why } of OVER_CLAIMS) {
      it(`${loc}: ${why}`, () => {
        const hits = values.filter((v) => re.test(v));
        expect(hits, hits.join(" | ")).toEqual([]);
      });
    }
  }
});

describe("6 · honesty pins: strongest boundaries stay pinned to their source", () => {
  const rowByKey = new Map(PERMISSION_MATRIX.map((r) => [r.key, r]));

  it("profiles are own-only for non-admin roles (profiles_select)", () => {
    const row = rowByKey.get("profileAccount")!;
    for (const role of ["worker", "company", "teamOwner"] as const) {
      expect(row.see[role]).toBe("own");
      expect(row.edit[role]).toBe("own");
    }
  });

  it("follow-up tasks are admin-only (fut_select is_admin)", () => {
    const row = rowByKey.get("followUp")!;
    for (const role of ["worker", "company", "teamOwner"] as const) {
      expect(row.see[role]).toBe("no");
      expect(row.edit[role]).toBe("no");
    }
    expect(row.see.admin).toBe("yes");
  });

  it("admin panels are admin-only (requireSuperadmin)", () => {
    const row = rowByKey.get("adminPanels")!;
    for (const role of ["worker", "company", "teamOwner"] as const) {
      expect(row.see[role]).toBe("no");
    }
  });

  it("worker board is worker-only — even admins get nothing from this surface", () => {
    const row = rowByKey.get("workerBoard")!;
    expect(row.see.worker).toBe("limited");
    for (const role of ["company", "teamOwner", "admin"] as const) {
      expect(row.see[role]).toBe("no");
    }
    for (const role of MATRIX_ROLES) expect(row.edit[role]).toBe("no");
  });

  it("messaging rules mirror the exhaustive contact-permission states incl. the closed default", () => {
    const keys = MESSAGING_RULES.map((r) => r.key);
    expect(keys).toContain("none");
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("7 · i18n completeness (en/lt/ru) for every module key", () => {
  for (const loc of LOCALES) {
    const json = loadLocale(loc);
    const matrix = json.legal?.dataAccess?.matrix;

    it(`${loc}: matrix scaffolding copy present`, () => {
      for (const key of [
        "title",
        "intro",
        "surfaceHeader",
        "seeLabel",
        "editLabel",
        "sourceLabel",
        "sourceNote",
      ]) {
        expect(typeof matrix?.[key], `matrix.${key}`).toBe("string");
        expect((matrix[key] as string).trim().length, `matrix.${key} empty`).toBeGreaterThan(0);
      }
      for (const role of MATRIX_ROLES) {
        expect((matrix.roles?.[role] ?? "").trim().length, `roles.${role}`).toBeGreaterThan(0);
      }
      for (const level of ACCESS) {
        expect((matrix.levels?.[level] ?? "").trim().length, `levels.${level}`).toBeGreaterThan(0);
      }
    });

    it(`${loc}: every matrix row has surface/seeNote/editNote`, () => {
      for (const row of PERMISSION_MATRIX) {
        const copy = matrix.rows?.[row.key];
        for (const field of ["surface", "seeNote", "editNote"] as const) {
          expect(
            (copy?.[field] ?? "").trim().length,
            `${loc} rows.${row.key}.${field} missing/empty`,
          ).toBeGreaterThan(0);
        }
      }
      // No orphan i18n rows either — copy and module stay in lockstep.
      expect(Object.keys(matrix.rows).sort()).toEqual(
        PERMISSION_MATRIX.map((r) => r.key).sort(),
      );
    });

    it(`${loc}: every messaging rule has copy (and no orphans)`, () => {
      expect((matrix.messaging?.heading ?? "").trim().length).toBeGreaterThan(0);
      expect((matrix.messaging?.intro ?? "").trim().length).toBeGreaterThan(0);
      for (const rule of MESSAGING_RULES) {
        expect(
          (matrix.messaging.rules?.[rule.key] ?? "").trim().length,
          `${loc} messaging.rules.${rule.key}`,
        ).toBeGreaterThan(0);
      }
      expect(Object.keys(matrix.messaging.rules).sort()).toEqual(
        MESSAGING_RULES.map((r) => r.key).sort(),
      );
    });

    it(`${loc}: admin hub label for the matrix link exists`, () => {
      expect((json.admin?.hub?.permissionMatrix ?? "").trim().length).toBeGreaterThan(0);
    });
  }
});
