/**
 * Minimal in-memory PostgREST-shaped client for unit tests (W10 slice 3).
 *
 * Retrieval defects — "the pool was the 200 newest rows" — are invisible to a
 * pure unit test and cost a live database to reproduce, which is exactly why
 * the W10 audit could only classify P0-3 as UNVERIFIABLE-STATICALLY. This stub
 * makes the read layer testable: it holds tables in memory, applies the subset
 * of PostgREST operators the matching read path actually uses, and RECORDS
 * every query so a test can assert what was asked of the database.
 *
 * Deliberately small. It is not a Postgres emulator and must never become one:
 * it models filtering, ordering and limiting over plain rows, nothing else.
 * Rows are returned as stored, so a fixture supplies embedded relations
 * (`{ worker_id, skills: { slug } }`) exactly as PostgREST would nest them.
 *
 * Not a test file (no `.test.ts` suffix), so vitest loads it only as a helper.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type FakeRow = Record<string, any>;

export interface FakeTables {
  readonly [table: string]: readonly FakeRow[];
}

/** One recorded read, so a test can assert the SHAPE of what was asked. */
export interface RecordedQuery {
  readonly table: string;
  readonly select: string;
  readonly filters: readonly { op: string; column: string; value: unknown }[];
  readonly order: readonly { column: string; ascending: boolean }[];
  readonly limit: number | null;
  readonly rowsReturned: number;
}

const MISSING_RELATION = { code: "42P01", message: "relation does not exist" };

function ilikeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

class FakeQuery implements PromiseLike<{ data: FakeRow[] | null; error: unknown }> {
  private readonly filters: { op: string; column: string; value: unknown }[] = [];
  private readonly orderBy: { column: string; ascending: boolean }[] = [];
  private limitTo: number | null = null;
  private single = false;

  constructor(
    private readonly table: string,
    private readonly rows: readonly FakeRow[] | undefined,
    private readonly selectCols: string,
    private readonly log: RecordedQuery[],
  ) {}

  private push(op: string, column: string, value: unknown): this {
    this.filters.push({ op, column, value });
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.push("eq", column, value);
  }
  neq(column: string, value: unknown): this {
    return this.push("neq", column, value);
  }
  in(column: string, value: readonly unknown[]): this {
    return this.push("in", column, value);
  }
  ilike(column: string, value: string): this {
    return this.push("ilike", column, value);
  }
  overlaps(column: string, value: readonly unknown[]): this {
    return this.push("overlaps", column, value);
  }
  contains(column: string, value: readonly unknown[]): this {
    return this.push("contains", column, value);
  }
  not(column: string, op: string, value: unknown): this {
    return this.push(`not.${op}`, column, value);
  }
  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: opts?.ascending !== false });
    return this;
  }
  limit(n: number): this {
    this.limitTo = n;
    return this;
  }
  maybeSingle(): this {
    this.single = true;
    return this;
  }

  private run(): { data: any; error: unknown } {
    if (this.rows === undefined) {
      this.log.push({
        table: this.table,
        select: this.selectCols,
        filters: this.filters,
        order: this.orderBy,
        limit: this.limitTo,
        rowsReturned: 0,
      });
      return { data: null, error: MISSING_RELATION };
    }

    let out = this.rows.filter((row) =>
      this.filters.every(({ op, column, value }) => {
        const cell = row[column];
        switch (op) {
          case "eq":
            return cell === value;
          case "neq":
            return cell !== value;
          case "in":
            return (value as unknown[]).includes(cell);
          case "ilike":
            return typeof cell === "string" && ilikeToRegExp(String(value)).test(cell);
          case "overlaps":
            return (
              Array.isArray(cell) && (value as unknown[]).some((v) => cell.includes(v))
            );
          case "contains":
            return Array.isArray(cell) && (value as unknown[]).every((v) => cell.includes(v));
          case "not.is":
            return value === null ? cell != null : cell !== value;
          default:
            return true;
        }
      }),
    );

    for (const { column, ascending } of [...this.orderBy].reverse()) {
      out = [...out].sort(
        (a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]),
      );
    }
    if (this.limitTo !== null) out = out.slice(0, this.limitTo);

    this.log.push({
      table: this.table,
      select: this.selectCols,
      filters: this.filters,
      order: this.orderBy,
      limit: this.limitTo,
      rowsReturned: out.length,
    });
    return { data: this.single ? (out[0] ?? null) : out, error: null };
  }

  then<TResult1 = { data: FakeRow[] | null; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: FakeRow[] | null; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run() as any).then(onfulfilled as any, onrejected as any);
  }
}

export interface FakeSupabase {
  /** Cast at the call site — the stub implements only what the read path uses. */
  readonly client: any;
  /** Every read, in order, for shape assertions. */
  readonly queries: RecordedQuery[];
}

/**
 * Build a fake client over the given tables. A table absent from `tables`
 * responds `42P01`, which is how the read layer's feature-detected reads
 * (worker_languages, MP-2 columns) are expected to degrade.
 */
export function createFakeSupabase(tables: FakeTables): FakeSupabase {
  const queries: RecordedQuery[] = [];
  const client = {
    from(table: string) {
      return {
        select(cols = "*") {
          return new FakeQuery(table, tables[table], cols, queries);
        },
      };
    },
  };
  return { client, queries };
}
