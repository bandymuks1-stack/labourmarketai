import "server-only";

/**
 * VACANCY IMPORTER — the server-only orchestrator that runs the §13 pipeline
 * end to end:
 *
 *   fetch → parse → normalize → translate → categorize → validate
 *         → deduplicate → account → (gated) persist
 *
 * It is PROVIDER-AGNOSTIC. Everything country-specific is reached through the
 * descriptor and the parser dispatch, so this file never learns that Sweden
 * exists and a second country needs no change here.
 *
 * It NEVER bypasses a gate, in this order:
 *   1. the env kill switch is asserted before any network request;
 *   2. the SOURCE GOVERNANCE gate (owner activation) is evaluated once per
 *      batch through the shared import boundary — the same boundary the
 *      Eurostat path uses;
 *   3. persistence happens only in "persist" mode, only when both gates are
 *      open, and only through the caller's writer.
 *
 * Two run modes, and the distinction matters:
 *   - "dry_run" fetches, parses and validates but persists NOTHING. This is
 *     the mode that produces the evidence an owner needs in order to decide
 *     about activation: how many ads are well-formed, how many are junk, how
 *     many would be imported if they said yes.
 *   - "persist" additionally writes accepted records. Reachable only once the
 *     owner has activated the source in code AND enabled it in env.
 *
 * Accounting is exact-sum (scanned = accepted + rejected + duplicated) and is
 * built by the SAME buildImportSession the Eurostat importer uses — one
 * accounting contract for every external ingest, so the two can be read side
 * by side and a rollback reference is mandatory for both.
 */
import {
  buildImportSession,
  type ImportSessionReasonCountV1,
  type ImportSessionV1,
} from "@/lib/intelligence/import-session";
import {
  buildImportReport,
  type ImportReportV1,
} from "@/lib/intelligence/import-report";
import {
  translateInstruction,
  NO_PROVIDER_CONFIGURED,
  type TranslationProvider,
} from "@/lib/translation/translation-service";
import {
  dedupeVacancies,
  emptyDedupState,
  type VacancyDedupState,
} from "@/lib/vacancy-sources/vacancy-dedup";
import {
  computeNextVacancyCursor,
  cursorRequestBound,
  decodeRecordOffsetCursor,
  encodeRecordOffsetCursor,
  planVacancyWindows,
} from "@/lib/vacancy-sources/vacancy-cursor";
import {
  evaluateVacancyBatchGate,
  validateVacancyRecord,
} from "@/lib/vacancy-sources/vacancy-validation";
import {
  isActivationGatedOnly,
  type PublicVacancyV1,
  type VacancyImportChannel,
} from "@/lib/vacancy-sources/vacancy-contract";
import {
  getVacancyEndpoint,
  resolveProviderBounds,
  type VacancyProviderDescriptorV1,
} from "@/lib/vacancy-sources/vacancy-provider-registry";
import { getVacancyParser } from "@/lib/vacancy-sources/providers";
import { fetchVacancyJsonLines, fetchVacancyPage } from "./vacancy-adapter";
import { vacancySwitchState } from "./vacancy-kill-switch";

export type VacancyImportMode = "dry_run" | "persist";

/** MONITORING — one flat counter set per run. Every number is derived from
 *  what actually happened; none of them is estimated. */
export interface VacancyImportMetricsV1 {
  readonly pagesRequested: number;
  readonly pagesFailed: number;
  readonly bytesFetched: number;
  readonly itemsSeen: number;
  readonly itemsParsed: number;
  readonly itemsRejectedByParser: number;
  readonly itemsRejectedByValidation: number;
  readonly itemsAccepted: number;
  readonly itemsDuplicate: number;
  readonly itemsRevision: number;
  readonly itemsRemoval: number;
  /** Well-formed records blocked SOLELY by the owner-activation gate. */
  readonly validAfterActivation: number;
  readonly translationsRequested: number;
  readonly translationsAvailable: number;
  readonly translationsUnavailable: number;
  readonly retriesUsed: number;
  /** Time slices this session planned to walk (0 for a non-windowed channel). */
  readonly windowsPlanned: number;
  /** Time slices actually fetched and parsed — the checkpoint moved by each. */
  readonly windowsCompleted: number;
  /**
   * Records crossed WITHOUT being read, to reach this session's resume point
   * on a record-offset walk. Reported because it is the real cost of resuming
   * a body the publisher will not let us seek into, and an operator watching a
   * cold start deserves to see it rather than wonder where the time went.
   */
  readonly recordsSkipped: number;
}

/** LOGGING — one structured, secret-free line per notable event. The importer
 *  never console.logs: it hands events to the caller, which decides where
 *  they go. That keeps this module testable and keeps a token out of a log by
 *  construction (there is no field here that could hold one). */
export interface VacancyImportLogEventV1 {
  readonly level: "info" | "warn" | "error";
  /** Stable machine code — never a sentence to be parsed. */
  readonly code: string;
  readonly providerKey: string;
  readonly channel: VacancyImportChannel;
  /** Bounded, secret-free detail (a count, a status, a reason code). */
  readonly detail: string | null;
}

export interface VacancyImportRequestV1 {
  readonly provider: VacancyProviderDescriptorV1;
  readonly channel: VacancyImportChannel;
  readonly mode: VacancyImportMode;
  /** Query for the first page. Later pages advance offset when the endpoint
   *  paginates by offset/limit. */
  readonly query?: Readonly<Record<string, string | number>>;
  readonly sessionId: string;
  readonly startedAtIso: string;
  readonly finishedAtIso: string;
  /** Capture clock — deterministic, never Date.now inside the module. */
  readonly capturedAt: string;
  /** What is already stored — the dedup input. */
  readonly dedupState?: VacancyDedupState;
  /** Translation provider. Defaults to the platform's honest no-provider,
   *  which answers `unavailable` and leaves the publisher's words intact. */
  readonly translationProvider?: TranslationProvider;
  /** Target locale for the translation stage. Defaults to the descriptor's. */
  readonly targetLanguage?: string;
  /** Owner-provisioned API key, for a key-requiring endpoint. Never logged.
   *  No JobTech endpoint needs one — the descriptor declares that, and the
   *  adapter refuses rather than silently calling unauthenticated. */
  readonly apiKey?: string | null;
  /**
   * STREAM CHECKPOINT: the last-seen publisher timestamp. A checkpointed
   * channel resumes from here (minus a small overlap) instead of re-reading.
   * Passing null on a checkpointed channel is refused — an unbounded stream
   * request is a full re-read, and the correct cold-start is a snapshot.
   */
  readonly cursor?: string | null;
  /** REQUIRED for mode "persist": the writer. Given the exact accepted
   *  records, it stores them idempotently and reports what it wrote. */
  readonly persist?: (
    rows: readonly PublicVacancyV1[],
  ) => Promise<{ inserted: number; updated: number }>;
}

export interface VacancyImportResultV1 {
  readonly mode: VacancyImportMode;
  readonly providerKey: string;
  readonly channel: VacancyImportChannel;
  /** True when the env switch permits network work. */
  readonly operational: boolean;
  /** True when source governance permits records to ENTER. */
  readonly activated: boolean;
  readonly blockedReason: string | null;
  readonly acceptedVacancies: readonly PublicVacancyV1[];
  readonly session: ImportSessionV1 | null;
  readonly report: ImportReportV1 | null;
  readonly metrics: VacancyImportMetricsV1;
  readonly logs: readonly VacancyImportLogEventV1[];
  readonly persistedInserted: number;
  readonly persistedUpdated: number;
  /**
   * The checkpoint to pass to the NEXT run of a checkpointed channel. Moves
   * forward only, and stays put when the batch added nothing newer or the run
   * was blocked — a lost checkpoint costs a re-read, a wrong one costs
   * skipped records.
   */
  readonly nextCursor: string | null;
  /**
   * For a time-windowed channel: whether the walk reached the present, i.e.
   * this session drained the whole backlog. False means slices remain and
   * another run is needed — reported rather than hidden, because a truncated
   * catch-up that reads as "done" is how stale supply goes unnoticed.
   * `null` for channels that are not walked.
   */
  readonly caughtUp: boolean | null;
}

export async function runVacancyImport(
  req: VacancyImportRequestV1,
): Promise<VacancyImportResultV1> {
  const { provider, channel } = req;
  const bounds = resolveProviderBounds(provider);
  const logs: VacancyImportLogEventV1[] = [];
  const reasonCounts = new Map<string, number>();
  const errors: string[] = [];

  const log = (
    level: VacancyImportLogEventV1["level"],
    code: string,
    detail: string | null = null,
  ): void => {
    logs.push({ level, code, providerKey: provider.key, channel, detail });
  };
  const tally = (code: string): void => {
    reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);
  };

  const counters = {
    pagesRequested: 0,
    pagesFailed: 0,
    bytesFetched: 0,
    itemsSeen: 0,
    itemsParsed: 0,
    itemsRejectedByParser: 0,
    itemsRejectedByValidation: 0,
    itemsAccepted: 0,
    itemsDuplicate: 0,
    itemsRevision: 0,
    itemsRemoval: 0,
    validAfterActivation: 0,
    translationsRequested: 0,
    translationsAvailable: 0,
    translationsUnavailable: 0,
    retriesUsed: 0,
    windowsPlanned: 0,
    windowsCompleted: 0,
    recordsSkipped: 0,
  };

  const switchState = vacancySwitchState(provider.key);
  const gate = evaluateVacancyBatchGate(
    {
      providerKey: provider.key,
      snapshotRef: req.sessionId,
      requestRef: `${provider.key}:${channel}`,
      capturedAt: req.capturedAt,
    },
    channel,
  );
  const activated = gate.ok;

  if (!switchState.operational) {
    log("warn", "not_operational", switchState.blockedReason);
  }
  if (!activated) {
    for (const reason of gate.reasons) log("warn", "gate_blocked", reason);
  }

  const parser = getVacancyParser(provider.key);
  const endpoint = getVacancyEndpoint(provider, channel);

  const parsed: PublicVacancyV1[] = [];

  // Network work happens ONLY when the env switch is open. Governance being
  // off does not stop a dry run — reading a public endpoint to count what
  // WOULD be importable is exactly the evidence the owner needs — but it does
  // stop anything from entering (enforced below and by the import boundary).
  // A CHECKPOINTED channel must resume from a cursor. Running one without a
  // checkpoint would request the whole stream — a full re-read wearing the
  // costume of a one-minute poll, on an open API we were asked to be gentle
  // with. The correct cold start is a snapshot, so this refuses instead.
  const needsCursor = endpoint?.cadence.checkpointed === true;
  const requestBound = cursorRequestBound(req.cursor ?? null);
  const cursorMissing = needsCursor && requestBound === null;
  if (cursorMissing) {
    log("error", "cursor_required_run_snapshot_first", channel);
    tally("cursor_missing");
  }

  const runOverNetwork =
    switchState.operational &&
    parser !== null &&
    endpoint !== null &&
    !cursorMissing;

  if (parser === null) log("error", "no_parser_for_provider", provider.key);
  if (endpoint === null) log("error", "channel_not_supported", channel);

  // ── WINDOW PLAN ──────────────────────────────────────────────────────────
  // A `time_window` channel is walked in bounded slices instead of being asked
  // for in one unbounded request. Planned up front so the session's shape (how
  // much backlog it will drain, and whether any is left over) is known before
  // the first request rather than discovered by running out.
  const windowConfig =
    endpoint?.pagination === "time_window" ? (endpoint.window ?? null) : null;
  const windowPlan =
    windowConfig !== null
      ? planVacancyWindows({
          fromIso: requestBound,
          nowIso: req.capturedAt,
          widthSeconds: windowConfig.widthSeconds,
          safetyLagSeconds: windowConfig.safetyLagSeconds,
          maxWindows: bounds.maxPagesPerSession,
        })
      : null;
  if (windowPlan !== null) {
    counters.windowsPlanned = windowPlan.windows.length;
  }
  /** The end of the newest slice fully consumed — the honest checkpoint. */
  let lastCompletedWindowEnd: string | null = null;

  // ── RECORD-OFFSET WALK ───────────────────────────────────────────────────
  // A body too large to hold and with no time axis to slice on is walked by
  // RECORD INDEX over a line-delimited transport. State kept here so the
  // checkpoint below can be built from what was actually consumed.
  // Keyed on PAGINATION alone. A `record_offset` endpoint that forgot to
  // declare `json_lines` must not quietly fall through to the paged loop and
  // request an unbounded body — it reaches the streamed adapter, which refuses
  // it outright. Wrong configuration therefore fails closed and loudly.
  const streamedWalk = endpoint?.pagination === "record_offset";
  /** Index of the next unread record; null when no streamed read happened. */
  let streamNextOffset: number | null = null;
  /** True only when the publisher ended the body — i.e. the walk drained. */
  let streamDrained: boolean | null = null;

  if (runOverNetwork && streamedWalk) {
    // The checkpoint for this channel is an INDEX, not an instant. A missing
    // or wrong-shaped value decodes to null and starts the walk over, which
    // for a full snapshot is always a safe thing to do.
    const startOffset = decodeRecordOffsetCursor(req.cursor ?? null) ?? 0;
    counters.pagesRequested += 1;

    const slice = await fetchVacancyJsonLines({
      provider,
      channel,
      query: req.query,
      apiKey: req.apiKey ?? null,
      skipRecords: startOffset,
      // One session consumes at most what one session may accept. Crossing
      // more than we could ever store would spend bandwidth for nothing.
      maxRecords: bounds.maxAcceptedPerSession,
    });

    if (!slice.ok) {
      counters.pagesFailed += 1;
      tally(`fetch_${slice.errorCode}`);
      errors.push(`${channel}:${slice.errorCode}:${slice.detail}`);
      log("error", "page_fetch_failed", slice.errorCode);
    } else {
      counters.bytesFetched += slice.byteLength;
      counters.recordsSkipped += slice.recordsSkipped;
      streamNextOffset = slice.nextOffset;
      streamDrained = slice.completedStream;

      // A body cut short mid-transfer is a FAILED run for health purposes —
      // the failure streak must see it — but the records already read are
      // real. They are kept, and the offset checkpoint carries the progress
      // forward, so an interruption costs one partial session rather than the
      // whole walk.
      if (slice.interrupted) {
        counters.pagesFailed += 1;
        const cause = slice.interruptionCode ?? "network_error";
        tally(`fetch_${cause}`);
        errors.push(`${channel}:${cause}:stream_interrupted`);
        log("error", "page_fetch_failed", cause);
      }

      // A line that is not JSON is a rejected ITEM, counted in the same
      // exact-sum accounting as every other rejection — never silently
      // dropped, because "scanned" has to mean everything we crossed.
      if (slice.malformedLines > 0) {
        counters.itemsSeen += slice.malformedLines;
        counters.itemsRejectedByParser += slice.malformedLines;
        for (let i = 0; i < slice.malformedLines; i += 1) {
          tally("parse_malformed_json_line");
        }
      }

      const batch = parser({
        body: slice.records,
        channel,
        capturedAt: req.capturedAt,
        requestRef: slice.requestRef,
      });

      if (!batch.ok) {
        tally(`parse_${batch.bodyReason ?? "unknown"}`);
        errors.push(`${channel}:${batch.bodyReason ?? "unknown"}`);
        log("error", "batch_unparseable", batch.bodyReason);
      } else {
        counters.itemsSeen += batch.outcomes.length;
        for (const outcome of batch.outcomes) {
          if (outcome.kind === "rejected") {
            counters.itemsRejectedByParser += 1;
            tally(`parse_${outcome.reason}`);
            continue;
          }
          counters.itemsParsed += 1;
          parsed.push(outcome.vacancy);
        }
        log(
          "info",
          "stream_slice_done",
          `${startOffset}+${slice.records.length}`,
        );
      }

      // Whether the walk finished is the operator's headline fact, so it is
      // stated explicitly rather than left to be inferred from a count.
      if (!slice.completedStream) {
        log("warn", "stream_walk_incomplete", slice.stopReason);
      }
    }
  } else if (runOverNetwork) {
    // A snapshot is a one-shot: a single page, never repeated on a schedule.
    const maxPages =
      endpoint.pagination === "none"
        ? 1
        : windowPlan !== null
          ? windowPlan.windows.length
          : bounds.maxPagesPerSession;
    let offset = Number(req.query?.offset ?? 0);

    for (let page = 0; page < maxPages; page += 1) {
      const query: Record<string, string | number> = { ...(req.query ?? {}) };
      if (endpoint.pagination === "offset_limit") {
        query.offset = offset;
        query.limit = bounds.maxItemsPerPage;
      }
      if (windowPlan !== null && windowConfig !== null) {
        // Both bounds come from the plan. The publisher's parameter NAMES are
        // read off the descriptor, so this stage stays country-agnostic.
        const slice = windowPlan.windows[page];
        query[windowConfig.startQueryKey] = slice.startIso;
        query[windowConfig.endQueryKey] = slice.endIso;
      } else if (requestBound !== null) {
        // Resume point for a checkpointed channel, nudged back by the overlap
        // so a same-second publication at the boundary is not dropped.
        query.date = requestBound;
      }

      counters.pagesRequested += 1;
      const fetched = await fetchVacancyPage({
        provider,
        channel,
        query,
        apiKey: req.apiKey ?? null,
      });

      if (!fetched.ok) {
        counters.pagesFailed += 1;
        tally(`fetch_${fetched.errorCode}`);
        errors.push(`${channel}:${fetched.errorCode}:${fetched.detail}`);
        log("error", "page_fetch_failed", fetched.errorCode);
        break;
      }

      counters.bytesFetched += fetched.byteLength;
      const batch = parser({
        body: fetched.body,
        channel,
        capturedAt: req.capturedAt,
        requestRef: fetched.requestRef,
      });

      if (!batch.ok) {
        tally(`parse_${batch.bodyReason ?? "unknown"}`);
        errors.push(`${channel}:${batch.bodyReason ?? "unknown"}`);
        log("error", "batch_unparseable", batch.bodyReason);
        break;
      }

      counters.itemsSeen += batch.outcomes.length;
      for (const outcome of batch.outcomes) {
        if (outcome.kind === "rejected") {
          counters.itemsRejectedByParser += 1;
          tally(`parse_${outcome.reason}`);
          continue;
        }
        counters.itemsParsed += 1;
        parsed.push(outcome.vacancy);
      }

      log("info", "page_done", String(batch.outcomes.length));

      if (windowPlan !== null && windowConfig !== null) {
        // This slice is fully consumed, so the checkpoint may move to its end
        // — and only to its end. Progress is therefore monotonic even if a
        // later slice in the same session fails.
        counters.windowsCompleted += 1;
        lastCompletedWindowEnd = windowPlan.windows[page].endIso;
        // A windowed walk never stops on a SHORT page: a quiet three hours is
        // ordinary and the next slice may be busy. Only the accept cap ends
        // it early, and the caller learns the backlog is unfinished.
        if (parsed.length >= bounds.maxAcceptedPerSession) {
          log("warn", "window_walk_truncated_by_accept_cap", String(page + 1));
          break;
        }
        continue;
      }

      // Stop when the endpoint does not paginate, when the page came back
      // short (the provider has no more), or when the accept cap is already
      // out of reach — never spin on an endpoint that has nothing left.
      if (
        endpoint.pagination !== "offset_limit" ||
        batch.outcomes.length < bounds.maxItemsPerPage ||
        parsed.length >= bounds.maxAcceptedPerSession
      ) {
        break;
      }
      offset += bounds.maxItemsPerPage;
    }
  }

  // ── TRANSLATE ─────────────────────────────────────────────────────────────
  // Delegated to the platform's ONE translation service. With no provider
  // configured (the shipped default) every record comes back `unavailable`
  // and keeps the publisher's own words — the pipeline never fabricates a
  // translation, and never hides that it has none.
  const targetLanguage = req.targetLanguage ?? provider.defaultTargetLanguage;
  const translationProvider = req.translationProvider ?? NO_PROVIDER_CONFIGURED;
  const translated: PublicVacancyV1[] = [];
  for (const vacancy of parsed) {
    // A withdrawal carries no text worth translating.
    if (vacancy.lifecycle === "removed" || vacancy.sourceLanguage === targetLanguage) {
      translated.push(vacancy);
      continue;
    }
    counters.translationsRequested += 1;
    const [title, description] = await Promise.all([
      translateInstruction(
        {
          text: vacancy.titleRaw,
          sourceLanguage: vacancy.sourceLanguage,
          targetLanguage,
        },
        translationProvider,
      ),
      vacancy.descriptionRaw.length > 0
        ? translateInstruction(
            {
              text: vacancy.descriptionRaw,
              sourceLanguage: vacancy.sourceLanguage,
              targetLanguage,
            },
            translationProvider,
          )
        : Promise.resolve({
            status: "unavailable" as const,
            translatedText: null,
            provider: null,
            error: null,
          }),
    ]);

    // The record's status is the WEAKER of the two: a translated headline
    // over an untranslated body is not a translated ad.
    const status =
      title.status === "available" && description.status === "available"
        ? "available"
        : title.status === "available" || description.status === "available"
          ? "needs_review"
          : title.status;
    if (status === "available") counters.translationsAvailable += 1;
    else counters.translationsUnavailable += 1;

    translated.push({
      ...vacancy,
      translation: {
        targetLanguage,
        status,
        titleText: status === "available" ? title.translatedText : null,
        descriptionText: status === "available" ? description.translatedText : null,
        provider: title.provider ?? description.provider,
      },
    });
  }

  // ── VALIDATE ─────────────────────────────────────────────────────────────
  const wellFormed: PublicVacancyV1[] = [];
  for (const vacancy of translated) {
    const problems = validateVacancyRecord(vacancy);
    if (problems.length > 0) {
      counters.itemsRejectedByValidation += 1;
      for (const p of problems) tally(`data_${p}`);
      continue;
    }
    wellFormed.push(vacancy);
  }

  // ── DEDUPLICATE ──────────────────────────────────────────────────────────
  const dedup = dedupeVacancies(wellFormed, req.dedupState ?? emptyDedupState());
  counters.itemsDuplicate = dedup.counts.duplicate;
  counters.itemsRevision = dedup.counts.revision;
  counters.itemsRemoval = dedup.counts.removal;
  for (let i = 0; i < dedup.counts.duplicate; i += 1) tally("duplicate");

  // ── GATE ─────────────────────────────────────────────────────────────────
  // A well-formed, deduped record still enters ONLY if the owner activated
  // the source. When the only thing standing in the way is activation, the
  // records are reported as validAfterActivation and dropped — never stored.
  let accepted: PublicVacancyV1[] = [];
  if (activated) {
    accepted = dedup.toPersist.slice(0, bounds.maxAcceptedPerSession);
    const capped = dedup.toPersist.length - accepted.length;
    for (let i = 0; i < capped; i += 1) tally("session_accept_cap");
    if (capped > 0) log("warn", "session_accept_cap", String(capped));
  } else {
    counters.validAfterActivation = dedup.toPersist.length;
    if (isActivationGatedOnly(gate.ok ? [] : gate.reasons)) {
      for (const reason of gate.reasons) {
        for (let i = 0; i < dedup.toPersist.length; i += 1) tally(`gated_${reason}`);
      }
    }
  }
  counters.itemsAccepted = accepted.length;

  // ── ACCOUNT ──────────────────────────────────────────────────────────────
  // Exact-sum invariant: everything seen is accepted, rejected or duplicated.
  const itemsScanned = counters.itemsSeen;
  const itemsAccepted = counters.itemsAccepted;
  const itemsDuplicated = counters.itemsDuplicate;
  const itemsRejected = itemsScanned - itemsAccepted - itemsDuplicated;

  const reasonCountsArr: ImportSessionReasonCountV1[] = [
    ...reasonCounts.entries(),
  ].map(([code, count]) => ({ code, count }));

  const built = buildImportSession({
    sessionId: req.sessionId,
    sourceKey: provider.governanceSourceKey,
    transformVersion: provider.transformVersion,
    startedAtIso: req.startedAtIso,
    finishedAtIso: req.finishedAtIso,
    itemsScanned,
    itemsAccepted,
    itemsRejected: Math.max(0, itemsRejected),
    itemsDuplicated,
    reasonCounts: reasonCountsArr,
    errors,
    rollbackRef: `vacancy-import-session:${req.sessionId}`,
  });

  const session = built.ok ? built.session : null;
  if (!built.ok) log("error", "session_build_failed", built.reasonCode);

  const warningCodes: string[] = [];
  if (!switchState.operational && switchState.blockedReason) {
    warningCodes.push(`vacancy_${switchState.blockedReason}`);
  }
  if (!activated) {
    for (const reason of gate.reasons) warningCodes.push(`vacancy_${reason}`);
  }
  const report = session
    ? buildImportReport(session, { warningCodes })
    : null;

  // ── PERSIST ──────────────────────────────────────────────────────────────
  let persistedInserted = 0;
  let persistedUpdated = 0;
  if (
    req.mode === "persist" &&
    activated &&
    switchState.operational &&
    accepted.length > 0 &&
    typeof req.persist === "function"
  ) {
    const res = await req.persist(accepted);
    persistedInserted = res.inserted;
    persistedUpdated = res.updated;
    log("info", "persisted", `${res.inserted}+${res.updated}`);
  } else if (req.mode === "persist") {
    log("warn", "persist_skipped", activated ? "no_accepted_rows" : "not_activated");
  }

  return {
    mode: req.mode,
    providerKey: provider.key,
    channel,
    operational: switchState.operational,
    activated,
    blockedReason:
      switchState.blockedReason ?? (activated ? null : (gate.ok ? null : gate.reasons[0])),
    acceptedVacancies: accepted,
    session,
    report,
    metrics: counters,
    logs,
    persistedInserted,
    persistedUpdated,
    // CHECKPOINT.
    //
    // A WINDOWED channel checkpoints on the end of the last slice it fully
    // consumed — never on a publisher timestamp. The publisher's own fields
    // do not reproduce the axis the endpoint filters on, so inferring the
    // checkpoint from them is unsound in both directions (measured on the
    // Swedish stream, 2026-08-11): in one 3.9 h slice, 51.7% of records had a
    // `publication_date` OLDER than the slice start — the oldest by 11 days —
    // which would rewind the walk into a permanent replay; and a withdrawal
    // delta carries no publication date at all, so it falls back to our
    // capture clock and would jerk the checkpoint to "now", silently skipping
    // everything between. The slice end is the one bound we actually asked
    // for and were completely answered on, so it is the only honest one.
    //
    // Otherwise: advance over everything the publisher actually gave us, not
    // just what survived the gates — a record we rejected for our own reasons
    // has still been SEEN, and re-reading it forever would stall the stream.
    // Moves forward only.
    // A RECORD-OFFSET walk checkpoints on the index of the next unread record.
    // It advances over everything CROSSED — including records we rejected and
    // lines that were not JSON — for the same reason the timestamp cursor
    // does: a record we declined for our own reasons has still been seen, and
    // re-reading it forever would pin the walk in place. The reader returns
    // offset 0 once the publisher ends the body, which turns the next run into
    // a fresh reconciliation pass rather than a no-op.
    nextCursor: streamedWalk
      ? streamNextOffset !== null
        ? encodeRecordOffsetCursor(streamNextOffset)
        : (req.cursor ?? null)
      : windowPlan !== null
        ? (lastCompletedWindowEnd ?? req.cursor ?? null)
        : computeNextVacancyCursor(req.cursor ?? null, parsed),
    caughtUp: streamedWalk
      ? streamDrained
      : windowPlan === null
        ? null
        : windowPlan.reachedPresent &&
          counters.windowsCompleted === counters.windowsPlanned,
  };
}
