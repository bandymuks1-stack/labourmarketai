import "server-only";

/**
 * VACANCY INGESTION RUNNER — the composition layer that finally connects the
 * pipeline to its storage.
 *
 * Layer map, and why this file exists at all:
 *   - `lib/vacancy-sources/**`  PURE stages (no IO) — parse/normalize/dedupe;
 *   - `lib/vacancy-import/**`   the NETWORK layer — may fetch, holds no DB
 *                               client (boundary guard section (i));
 *   - `lib/vacancy-store/**`    the PERSISTENCE layer — holds a DB client,
 *                               may never fetch (section (j));
 *   - `lib/vacancy-runner/**`   THIS — the only place both halves meet.
 *
 * The runner stays PROVIDER-AGNOSTIC: it iterates the registry and reads
 * every country-specific fact off the descriptor. Adding Latvia or Belgium
 * must not change this file — that is the registry's one-entry promise, and
 * the boundary guard pins provider keys out of shared stages.
 *
 * ── ISOLATION ──────────────────────────────────────────────────────────────
 * One session runs one provider+channel. `runVacancyIngestionBatch` runs many
 * sessions SEQUENTIALLY (deliberate: these are open public APIs we were asked
 * to be gentle with — parallel fan-out across providers is a burst we do not
 * need) and isolates each: a thrown error becomes that session's
 * `runner_exception` result and the next provider still runs.
 *
 * ── CURSOR DISCIPLINE ──────────────────────────────────────────────────────
 * The stored checkpoint advances ONLY after a PERSIST-mode run whose fetches
 * all succeeded and whose accepted rows were actually written. Two refusals
 * are deliberate:
 *   - a DRY RUN never writes the cursor. A dry run stores nothing, so
 *     advancing past what it merely looked at would make the next real run
 *     skip records forever;
 *   - a run with a failed page never advances. Partial sight is not sight.
 * Failures still WRITE the cursor row — recording last_failure_at/code and
 * the consecutive-failure streak is what makes source health observable —
 * they just never move `cursor_value` forward.
 *
 * ── ACCOUNTING ─────────────────────────────────────────────────────────────
 * Every number reported here is copied from the importer's own exact-sum
 * metrics or the repository's exact insert/update/unchanged partition. The
 * runner adds NOTHING of its own to the arithmetic — a layer that "adjusts"
 * counts is how fabricated evidence starts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runVacancyImport,
  type VacancyImportMode,
  type VacancyImportResultV1,
} from "@/lib/vacancy-import/vacancy-importer";
import { vacancySwitchState } from "@/lib/vacancy-import/vacancy-kill-switch";
import {
  VACANCY_PROVIDERS,
  type VacancyProviderDescriptorV1,
} from "@/lib/vacancy-sources/vacancy-provider-registry";
import type { VacancyImportChannel } from "@/lib/vacancy-sources/vacancy-contract";
import type { VacancyDedupState } from "@/lib/vacancy-sources/vacancy-dedup";
import { vacancyIdentityKey } from "@/lib/vacancy-sources/vacancy-hash";
import {
  persistVacancies,
  readVacancyCursor,
  writeVacancyCursor,
} from "@/lib/vacancy-store/vacancy-repository";
import {
  INTELLIGENCE_SOURCE_PROFILES,
} from "@/lib/intelligence/source-governance";

type VacancyDbClient = Pick<SupabaseClient, "from">;

export interface VacancyIngestionRequestV1 {
  readonly channel: VacancyImportChannel;
  readonly mode: VacancyImportMode;
  /** The run clock, injected — never Date.now() in here. */
  readonly nowIso: string;
  /** Restrict to specific providers; default is the whole registry. */
  readonly providerKeys?: readonly string[];
}

export interface VacancyIngestionSessionResultV1 {
  readonly providerKey: string;
  readonly channel: VacancyImportChannel;
  readonly mode: VacancyImportMode;
  /**
   * How the session ended:
   *   - `imported`          persist mode, rows written;
   *   - `dry_run_complete`  dry run, nothing written anywhere;
   *   - `blocked`           kill switch or governance said no (expected state
   *                         until the owner activates — NOT an error);
   *   - `fetch_failed`      a page failed; cursor not advanced;
   *   - `runner_exception`  something threw; other providers unaffected.
   */
  readonly status:
    | "imported"
    | "dry_run_complete"
    | "blocked"
    | "fetch_failed"
    | "runner_exception";
  readonly blockedReason: string | null;
  /** The importer's exact-sum metrics, verbatim. Null only on exception. */
  readonly metrics: VacancyImportResultV1["metrics"] | null;
  readonly persisted: {
    readonly inserted: number;
    readonly updated: number;
    readonly unchanged: number;
  };
  readonly cursorAdvanced: boolean;
  /** Bounded machine codes, never secrets. */
  readonly errors: readonly string[];
}

export interface VacancyIngestionBatchResultV1 {
  readonly startedAtIso: string;
  readonly sessions: readonly VacancyIngestionSessionResultV1[];
}

/**
 * Dedup state from what storage already holds for this provider — the input
 * that turns the deduper's three-way classification (replay / revision /
 * withdrawal) from a theory into a fact. Reads ONLY the two identity columns.
 */
async function loadDedupState(
  client: VacancyDbClient,
  providerKey: string,
): Promise<VacancyDedupState> {
  const { data, error } = await client
    .from("public_vacancies")
    .select("external_id, content_hash")
    .eq("provider_key", providerKey);

  if (error) {
    // A missing table (owner has not applied the migration) is a legitimate
    // empty store, not an exception — the importer then treats everything as
    // new, which is exactly right for a first run.
    if (error.code === "42P01") {
      return {
        knownContentHashes: new Set(),
        knownIdentityHashes: new Map(),
      };
    }
    throw new Error(`dedup_state_read_failed:${error.code ?? "unknown"}`);
  }

  const hashes = new Set<string>();
  const identities = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as { external_id: string; content_hash: string };
    hashes.add(r.content_hash);
    identities.set(
      vacancyIdentityKey(providerKey as never, r.external_id),
      r.content_hash,
    );
  }
  return { knownContentHashes: hashes, knownIdentityHashes: identities };
}

/** One provider, one channel, one session. Never throws — every failure is a
 *  classified result, because the batch depends on that. */
export async function runVacancyIngestionSession(
  client: VacancyDbClient,
  provider: VacancyProviderDescriptorV1,
  req: VacancyIngestionRequestV1,
): Promise<VacancyIngestionSessionResultV1> {
  const base = {
    providerKey: provider.key,
    channel: req.channel,
    mode: req.mode,
    persisted: { inserted: 0, updated: 0, unchanged: 0 },
    cursorAdvanced: false,
  };

  try {
    // Fast-path the blocked state so a disabled provider costs zero reads.
    const switchState = vacancySwitchState(provider.key);
    if (!switchState.operational) {
      return {
        ...base,
        status: "blocked",
        blockedReason: switchState.blockedReason,
        metrics: null,
        errors: [],
      };
    }

    const [dedupState, cursor] = await Promise.all([
      loadDedupState(client, provider.key),
      readVacancyCursor(client, provider.key, req.channel),
    ]);

    let persistedInserted = 0;
    let persistedUpdated = 0;
    let persistedUnchanged = 0;

    // One session id for the whole run: the importer logs under it and the
    // writer stamps it onto every stored row, so a row in `public_vacancies`
    // traces back to exactly one ingestion session.
    const sessionId = `${provider.key}-${req.channel}-${req.nowIso}`;

    const result = await runVacancyImport({
      provider,
      channel: req.channel,
      mode: req.mode,
      sessionId,
      startedAtIso: req.nowIso,
      finishedAtIso: req.nowIso,
      capturedAt: req.nowIso,
      dedupState,
      cursor: cursor.cursorValue,
      persist: async (rows) => {
        const outcome = await persistVacancies(client, rows, req.nowIso, sessionId);
        persistedInserted = outcome.inserted;
        persistedUpdated = outcome.updated;
        persistedUnchanged = outcome.unchanged;
        return { inserted: outcome.inserted, updated: outcome.updated };
      },
    });

    const fetchFailed = result.metrics.pagesFailed > 0;
    const errors = result.logs
      .filter((l) => l.level === "error")
      .map((l) => l.code);

    if (!result.activated) {
      // Well-formed records exist but the owner has not said yes. The dry-run
      // evidence (validAfterActivation) is the whole point of this state.
      return {
        ...base,
        status: "blocked",
        blockedReason: result.blockedReason,
        metrics: result.metrics,
        errors,
      };
    }

    if (fetchFailed) {
      // Record the failure on the cursor row — health is observable — but
      // never advance the checkpoint past pages we did not fully see.
      await writeVacancyCursor(client, {
        providerKey: provider.key,
        channel: req.channel,
        succeeded: false,
        nextCursor: null,
        previousFailures: cursor.consecutiveFailures,
        failureCode: errors[0] ?? "page_fetch_failed",
        runAtIso: req.nowIso,
      });
      return {
        ...base,
        status: "fetch_failed",
        blockedReason: null,
        metrics: result.metrics,
        errors,
      };
    }

    if (req.mode === "dry_run") {
      return {
        ...base,
        status: "dry_run_complete",
        blockedReason: null,
        metrics: result.metrics,
        errors,
      };
    }

    // Persist mode, activated, all pages fetched: the ONE state in which the
    // checkpoint may move.
    await writeVacancyCursor(client, {
      providerKey: provider.key,
      channel: req.channel,
      succeeded: true,
      nextCursor: result.nextCursor,
      previousFailures: cursor.consecutiveFailures,
      failureCode: null,
      runAtIso: req.nowIso,
    });

    return {
      ...base,
      status: "imported",
      blockedReason: null,
      metrics: result.metrics,
      persisted: {
        inserted: persistedInserted,
        updated: persistedUpdated,
        unchanged: persistedUnchanged,
      },
      cursorAdvanced: result.nextCursor !== cursor.cursorValue,
      errors,
    };
  } catch (err) {
    return {
      ...base,
      status: "runner_exception",
      blockedReason: null,
      metrics: null,
      // The message is one of OUR stable codes (every layer below throws
      // `code:detail` strings it built itself) — never a provider payload.
      errors: [err instanceof Error ? err.message.slice(0, 200) : "unknown"],
    };
  }
}

/** Every requested provider, sequentially, each isolated. */
export async function runVacancyIngestionBatch(
  client: VacancyDbClient,
  req: VacancyIngestionRequestV1,
): Promise<VacancyIngestionBatchResultV1> {
  const wanted =
    req.providerKeys && req.providerKeys.length > 0
      ? VACANCY_PROVIDERS.filter((p) => req.providerKeys!.includes(p.key))
      : VACANCY_PROVIDERS;

  const sessions: VacancyIngestionSessionResultV1[] = [];
  for (const provider of wanted) {
    sessions.push(await runVacancyIngestionSession(client, provider, req));
  }
  return { startedAtIso: req.nowIso, sessions };
}

// ── SOURCE HEALTH ────────────────────────────────────────────────────────────

export interface VacancySourceHealthV1 {
  readonly providerKey: string;
  readonly countryIso: string;
  readonly displayNameCode: string;
  /** Governance, verbatim from the registry row. */
  readonly legalStatus: string;
  readonly activation: string;
  /** Runtime env truth. */
  readonly operational: boolean;
  readonly switchBlockedReason: string | null;
  /** Channels the provider offers. */
  readonly channels: readonly VacancyImportChannel[];
  /** Per-channel checkpoint health, from vacancy_import_cursors. */
  readonly cursors: readonly {
    readonly channel: string;
    readonly cursorValue: string | null;
    readonly lastRunAt: string | null;
    readonly lastSuccessAt: string | null;
    readonly lastFailureAt: string | null;
    readonly lastFailureCode: string | null;
    readonly consecutiveFailures: number;
  }[];
  /** Live rows currently stored from this provider. */
  readonly storedActive: number;
}

/**
 * The honest per-channel checkpoint state, derived ONLY from cursor truth.
 * There is no sessions table (a run's full accounting lives in the action's
 * return value and nowhere else), so the three states below are everything
 * the store can actually attest after the fact:
 *   - `no_run_yet`  — the channel has never been run (distinct from "ran and
 *                     wrote nothing", which leaves last_run_at set);
 *   - `failing`     — the most recent run(s) failed (consecutive_failures>0);
 *   - `ok`          — the last run completed without a recorded failure.
 * Deeper questions ("how many were inserted last night?") need a persisted
 * session record — an owner-gated schema decision, deliberately NOT inferred
 * here.
 */
export type VacancyChannelCheckpointState = "no_run_yet" | "ok" | "failing";

export function channelCheckpointState(cursor: {
  readonly lastRunAt: string | null;
  readonly consecutiveFailures: number;
}): VacancyChannelCheckpointState {
  if (cursor.lastRunAt === null) return "no_run_yet";
  return cursor.consecutiveFailures > 0 ? "failing" : "ok";
}

/**
 * The registry × governance × env × storage join, one row per provider —
 * SOURCE_REGISTRY / SOURCE_GOVERNANCE / SOURCE_HEALTH / SOURCE_LAST_SUCCESS /
 * SOURCE_LAST_FAILURE in one honest read. Tolerates the unprovisioned store
 * (42P01 → zero cursors, zero rows) because health must be readable BEFORE
 * the owner applies the migration, not only after.
 */
export async function readVacancySourceHealth(
  client: VacancyDbClient,
): Promise<readonly VacancySourceHealthV1[]> {
  const cursorRows: Record<string, unknown>[] = [];
  const countsByProvider = new Map<string, number>();

  const { data: cursors, error: cursorError } = await client
    .from("vacancy_import_cursors")
    .select("*");
  if (cursorError && cursorError.code !== "42P01") {
    throw new Error(`health_cursor_read_failed:${cursorError.code ?? "unknown"}`);
  }
  for (const row of cursors ?? []) cursorRows.push(row as Record<string, unknown>);

  const { data: countRows, error: countError } = await client
    .from("public_vacancies")
    .select("provider_key")
    .eq("is_active", true);
  if (countError && countError.code !== "42P01") {
    throw new Error(`health_count_read_failed:${countError.code ?? "unknown"}`);
  }
  for (const row of countRows ?? []) {
    const key = (row as { provider_key: string }).provider_key;
    countsByProvider.set(key, (countsByProvider.get(key) ?? 0) + 1);
  }

  return VACANCY_PROVIDERS.map((provider) => {
    const governance = INTELLIGENCE_SOURCE_PROFILES.find(
      (p) => p.key === provider.governanceSourceKey,
    );
    const switchState = vacancySwitchState(provider.key);
    return {
      providerKey: provider.key,
      countryIso: provider.countryIso,
      displayNameCode: provider.displayNameCode,
      legalStatus: governance?.legalStatus ?? "unconfirmed",
      activation: governance?.activation ?? "off",
      operational: switchState.operational,
      switchBlockedReason: switchState.blockedReason,
      channels: provider.endpoints.map((e) => e.channel),
      cursors: cursorRows
        .filter((r) => r.provider_key === provider.key)
        .map((r) => ({
          channel: String(r.channel),
          cursorValue: (r.cursor_value as string | null) ?? null,
          lastRunAt: (r.last_run_at as string | null) ?? null,
          lastSuccessAt: (r.last_success_at as string | null) ?? null,
          lastFailureAt: (r.last_failure_at as string | null) ?? null,
          lastFailureCode: (r.last_failure_code as string | null) ?? null,
          consecutiveFailures: Number(r.consecutive_failures ?? 0),
        })),
      storedActive: countsByProvider.get(provider.key) ?? 0,
    };
  });
}
