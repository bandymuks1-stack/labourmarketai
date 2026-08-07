"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/lib/i18n/navigation";
import { useAuth } from "@/lib/auth/context";
import { activeLocales, type ActiveLocale } from "@/lib/i18n/config";
import {
  COMMAND_REGISTRY,
  matchCommands,
  type CommandAudience,
  type CommandEntry,
} from "@/lib/navigation/command-registry";
import {
  DASHBOARD_SEARCH_MAX_QUERY_CHARS,
  DASHBOARD_SEARCH_MIN_QUERY_CHARS,
  type DashboardSearchGroup,
} from "@/lib/search/dashboard-search-model";

/**
 * Universal finder (WAGON 3 → control room PR K) — type a normal term
 * ("cv", "kortelė", "žurnalas", "brigada", "kainos", "gdpr" …) and get:
 *
 *  1. REGISTRY-FIRST command results — links to the right EXISTING page from
 *     the one curated registry (lib/navigation/command-registry.ts). No free
 *     navigation invention, no AI, plain normalized substring matching.
 *  2. The caller's OWN objects (control room PR K) — grouped results fetched
 *     from /api/dashboard-search (authenticated; the SAME RLS-scoped reads
 *     the pages use; bounded; exact existing destinations). Rendered AFTER
 *     the command results — commands first, objects second, always.
 *     NO people search — finding people stays the deterministic scouting flow.
 *  3. Recent commands — the last few chosen command IDS (ids only, no query
 *     text, no PII) from localStorage, shown while the input is empty.
 *
 * Audience filtering uses ONLY server-derived signals passed through the
 * dashboard layout's AuthProvider (isAdmin + roles resolved server-side in
 * app/[locale]/dashboard/layout.tsx). Display convenience only — every
 * destination page keeps its own server-side auth / role / superadmin gate,
 * and the object search API authenticates + RLS-scopes on the server.
 *
 * Keyboard accessible by construction: a labelled search input followed by
 * plain lists of links (native tab order). Ctrl/Cmd+K focuses the inline
 * input from anywhere on the page — no modal palette. The object fetch is
 * debounced (hand-rolled, no dependency) and timeout-bounded (AbortController)
 * so a dead network can never hang the pending state.
 */

const RECENT_COMMANDS_STORAGE_KEY = "lm.commandFinder.recentCommandIds";

/**
 * The canonical destinations offered to a person with no command history.
 * Ids only — labels, routes and audience gating stay in COMMAND_REGISTRY, so
 * this list can never point somewhere the registry's own guard has not already
 * proven to exist. Order = the core work loop (journal → calendar → messages),
 * then the two spatial/relational surfaces, then the person's own profile.
 * Audience filtering happens at render, so a worker never sees a company-only
 * row and vice versa.
 */
const STARTER_COMMAND_IDS: readonly string[] = [
  "work_journal",
  "planning",
  "messages",
  "market_map",
  "profile",
];
const RECENT_COMMANDS_MAX = 5;
const OBJECT_SEARCH_DEBOUNCE_MS = 300;
const OBJECT_SEARCH_TIMEOUT_MS = 8000;

type ObjectSearchState = "idle" | "loading" | "ok" | "error";

/* ── Voice adapter (unified-text-navigation v1, Phase 3 rules) ──────────
 * Browser-native Web Speech API only — no external AI service, no separate
 * command model. The transcript feeds the SAME setQuery state as typing,
 * so voice → text → the one search → the user clicks a result. Nothing is
 * auto-executed and no transcript is persisted (local component state only).
 * When the API is unsupported the mic button is NOT rendered at all —
 * honest absence, no dead button, no "coming soon". */

/** Minimal structural typing for the browser SpeechRecognition object —
 *  lib.dom carries no types for the prefixed webkit implementation. */
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** Capability check — returns the constructor when the browser really has
 *  one (Chrome/Edge/Safari expose webkitSpeechRecognition), else null. */
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** BCP-47 recognition language per ACTIVE locale. */
const SPEECH_LANG: Record<ActiveLocale, string> = {
  lt: "lt-LT",
  en: "en-US",
  ru: "ru-RU",
  nl: "nl-NL",
  de: "de-DE",
};

/** Parse the stored recent-command ids — ids only, anything else discarded. */
function parseRecentIds(rawJson: string | null): string[] {
  if (!rawJson) return [];
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string")
      .slice(0, RECENT_COMMANDS_MAX);
  } catch {
    return [];
  }
}

export function CommandFinder() {
  const t = useTranslations("commandFinder");
  const rawLocale = useLocale();
  const locale: ActiveLocale = (activeLocales as readonly string[]).includes(
    rawLocale,
  )
    ? (rawLocale as ActiveLocale)
    : "lt";
  const { isAdmin, roles } = useAuth();
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [objectGroups, setObjectGroups] = useState<
    readonly DashboardSearchGroup[]
  >([]);
  const [objectState, setObjectState] = useState<ObjectSearchState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  // Voice adapter state — capability-gated; the button renders ONLY when the
  // browser really supports the Web Speech API (client effect, SSR-safe).
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setVoiceSupported(getSpeechRecognitionCtor() !== null);
    return () => {
      // Unmount safety: never leave the microphone open.
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stopListening = () => {
    recognitionRef.current?.stop();
  };

  const startListening = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return; // capability vanished — button was never rendered
    const recognition = new Ctor();
    recognition.lang = SPEECH_LANG[locale];
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length },
        (_, i) => event.results[i][0]?.transcript ?? "",
      )
        .join(" ")
        .trim();
      // The ONE pipeline: the transcript feeds the same setQuery state as
      // typing — registry match + object search run exactly as if typed.
      if (transcript.length > 0) setQuery(transcript);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onerror = () => {
      // onend fires after onerror — state clears there; nothing to persist.
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  // Ctrl/Cmd+K focuses the finder input (progressive enhancement — the
  // finder stays a plain labelled input either way, no modal).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Recent command ids (client-only; localStorage; ids only — no query text).
  useEffect(() => {
    try {
      setRecentIds(
        parseRecentIds(window.localStorage.getItem(RECENT_COMMANDS_STORAGE_KEY)),
      );
    } catch {
      // storage unavailable (private mode) — the finder works without recents
    }
  }, []);

  const rememberCommand = (id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(
        0,
        RECENT_COMMANDS_MAX,
      );
      try {
        window.localStorage.setItem(
          RECENT_COMMANDS_STORAGE_KEY,
          JSON.stringify(next),
        );
      } catch {
        // storage unavailable — display-only feature, nothing breaks
      }
      return next;
    });
  };

  const allowedAudiences = useMemo(() => {
    const a = new Set<CommandAudience>(["public"]);
    if (roles.includes("worker")) a.add("worker");
    if (roles.includes("company") || roles.includes("agency")) a.add("company");
    if (isAdmin) {
      // Admin sees everything — including the admin-only entries. Non-admins
      // NEVER get audience:"admin" rows (guard-tested).
      a.add("worker");
      a.add("company");
      a.add("admin");
    }
    return a;
  }, [roles, isAdmin]);

  const results = useMemo(
    () => matchCommands(query, locale, allowedAudiences),
    [query, locale, allowedAudiences],
  );

  // Object search (PR K): debounced, timeout-bounded fetch of the caller's
  // own objects. Runs alongside the registry match — never instead of it.
  useEffect(() => {
    const q = query.trim();
    if (q.length < DASHBOARD_SEARCH_MIN_QUERY_CHARS) {
      setObjectGroups([]);
      setObjectState("idle");
      return;
    }
    setObjectState("loading");
    setObjectGroups([]);
    let cancelled = false;
    const controller = new AbortController();
    const debounce = setTimeout(() => {
      const timeout = setTimeout(
        () => controller.abort(),
        OBJECT_SEARCH_TIMEOUT_MS,
      );
      fetch(
        `/api/dashboard-search?q=${encodeURIComponent(
          q.slice(0, DASHBOARD_SEARCH_MAX_QUERY_CHARS),
        )}`,
        { signal: controller.signal },
      )
        .then(async (res) => {
          if (!res.ok) throw new Error("search-failed");
          const data = (await res.json()) as {
            ok: boolean;
            groups?: readonly DashboardSearchGroup[];
          };
          if (cancelled) return;
          setObjectGroups(data.ok && data.groups ? data.groups : []);
          setObjectState("ok");
        })
        .catch(() => {
          // Dedicated ERROR state — a failed read is never folded into the
          // empty state (groups were already cleared when loading began).
          if (cancelled) return;
          setObjectState("error");
        })
        .finally(() => clearTimeout(timeout));
    }, OBJECT_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      controller.abort();
    };
  }, [query]);

  const recentEntries = useMemo(() => {
    if (query.trim().length > 0) return [];
    return recentIds
      .map((id) => COMMAND_REGISTRY.find((e) => e.id === id))
      .filter(
        (e): e is CommandEntry =>
          e !== undefined && allowedAudiences.has(e.audience),
      );
  }, [recentIds, query, allowedAudiences]);

  /**
   * STARTERS — the canonical destinations, shown only to someone who has no
   * recents yet and has typed nothing.
   *
   * Why this exists (UX audit 2026-08-07). `/dashboard` deliberately carries
   * no tab row: `conversation-header.tsx` records the owner ruling that the
   * journal, calendar, messages and the card are PROJECTIONS opened from the
   * conversation — "chips, commands, the opening brief, the command search" —
   * never from a parallel tab system. That ruling stands and this change does
   * not touch it.
   *
   * But the measured state was that NONE of those four channels named a
   * calendar, an inbox or a map for a first-time person: the opening brief
   * offers three worker chips, the account menu four items (profile, card, CV,
   * settings), and this finder opened as a bare input — because recents come
   * from localStorage and a first session has none. So the surface the ruling
   * relies on to make projections reachable was empty exactly when it was
   * needed most, and the product's own home offered no visible route to a
   * calendar, an inbox or a map at all.
   *
   * These are the SAME registry rows the finder already serves — no second
   * navigation model, no new route, no catalogue edit. They disappear the
   * moment the person has a real history or starts typing.
   */
  const starterEntries = useMemo(() => {
    if (query.trim().length > 0 || recentEntries.length > 0) return [];
    return STARTER_COMMAND_IDS.map((id) =>
      COMMAND_REGISTRY.find((e) => e.id === id),
    ).filter(
      (e): e is CommandEntry =>
        e !== undefined && allowedAudiences.has(e.audience),
    );
  }, [query, recentEntries, allowedAudiences]);

  const objectResultCount = objectGroups.reduce(
    (n, g) => n + g.results.length,
    0,
  );
  const showNoResults =
    query.trim().length > 0 &&
    results.length === 0 &&
    objectState !== "loading" &&
    objectResultCount === 0;

  const rowClass =
    "flex items-center justify-between gap-3 rounded-md border border-ink-500 bg-ink-800/40 px-3 py-2 text-sm text-text-primary transition-colors hover:border-brand-blue";

  return (
    <section
      role="search"
      data-testid="command-finder"
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="command-finder-input"
          className="font-mono text-meta uppercase tracking-label text-text-muted"
        >
          {t("title")}
        </label>
        {/* Shortcut hint — decorative for pointer users, so hidden from AT
            (the input itself stays fully labelled + focusable). */}
        <span
          aria-hidden
          data-testid="command-finder-shortcut-hint"
          className="hidden rounded border border-ink-500 bg-ink-800/60 px-1.5 py-0.5 font-mono text-meta text-text-muted sm:inline-flex"
        >
          {t("shortcutHint")}
        </span>
      </div>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
        />
        <input
          ref={inputRef}
          id="command-finder-input"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("inputLabel")}
          data-testid="command-finder-input"
          className={`w-full rounded-md border border-ink-500 bg-ink-800/60 py-2 pl-9 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none ${
            voiceSupported ? "pr-10" : "pr-3"
          }`}
        />
        {/* Mic renders ONLY when the browser really supports speech input —
            honest absence otherwise (no dead button, no "coming soon"). */}
        {voiceSupported && (
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            aria-label={listening ? t("voiceStop") : t("voiceStart")}
            aria-pressed={listening}
            data-testid="command-finder-voice"
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
              listening
                ? "text-brand-blue"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {listening ? (
              <MicOff aria-hidden className="h-4 w-4" />
            ) : (
              <Mic aria-hidden className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      {listening && (
        <p
          data-testid="command-finder-voice-listening"
          className="text-xs leading-relaxed text-text-muted"
          aria-live="polite"
        >
          {t("voiceListening")}
        </p>
      )}

      {/* Recent commands — shown only while the input is empty. Ids only. */}
      {recentEntries.length > 0 && (
        <nav aria-label={t("recentLabel")}>
          <p className="mb-1 font-mono text-meta uppercase tracking-label text-text-muted">
            {t("recentLabel")}
          </p>
          <ul
            data-testid="command-finder-recent"
            className="flex flex-col gap-1"
          >
            {recentEntries.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={entry.route as "/dashboard"}
                  onClick={() => rememberCommand(entry.id)}
                  data-testid={`command-finder-recent-${entry.id}`}
                  className={rowClass}
                >
                  <span className="min-w-0 truncate font-medium">
                    {entry.labels[locale]}
                  </span>
                  <span className="shrink-0 font-mono text-meta text-text-muted">
                    {entry.route}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Starters — only for a person with no recents and no query. Same
          registry rows, same audience gating; they vanish on first keystroke
          and are permanently replaced by real recents. */}
      {starterEntries.length > 0 && (
        <nav aria-label={t("startersLabel")}>
          <p className="mb-1 font-mono text-meta uppercase tracking-label text-text-muted">
            {t("startersLabel")}
          </p>
          <ul
            data-testid="command-finder-starters"
            className="flex flex-col gap-1"
          >
            {starterEntries.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={entry.route as "/dashboard"}
                  onClick={() => rememberCommand(entry.id)}
                  data-testid={`command-finder-starter-${entry.id}`}
                  className={rowClass}
                >
                  <span className="min-w-0 truncate font-medium">
                    {entry.labels[locale]}
                  </span>
                  <span className="shrink-0 font-mono text-meta text-text-muted">
                    {entry.route}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* 1 — registry commands FIRST (the curated navigation truth). */}
      {results.length > 0 && (
        <nav aria-label={t("resultsLabel")}>
          <ul
            data-testid="command-finder-results"
            className="flex flex-col gap-1"
          >
            {results.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={entry.route as "/dashboard"}
                  onClick={() => rememberCommand(entry.id)}
                  data-testid={`command-finder-result-${entry.id}`}
                  className={rowClass}
                >
                  <span className="min-w-0 truncate font-medium">
                    {entry.labels[locale]}
                  </span>
                  <span className="shrink-0 font-mono text-meta text-text-muted">
                    {entry.route}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* 2 — the caller's own objects, AFTER the commands (PR K). */}
      {objectState === "loading" && (
        <p
          data-testid="command-finder-objects-loading"
          className="text-xs leading-relaxed text-text-muted"
          aria-live="polite"
        >
          {t("objectsLoading")}
        </p>
      )}
      {objectState === "error" && (
        <p
          data-testid="command-finder-objects-error"
          className="text-xs leading-relaxed text-text-muted"
          aria-live="polite"
        >
          {t("objectsError")}
        </p>
      )}
      {objectState === "ok" && objectResultCount > 0 && (
        <nav aria-label={t("objectsLabel")} data-testid="command-finder-objects">
          <ul className="flex flex-col gap-2">
            {objectGroups.map((group) => (
              <li key={group.source} className="flex flex-col gap-1">
                <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {t(`groups.${group.source}`)}
                </p>
                <ul className="flex flex-col gap-1">
                  {group.results.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={r.href as "/dashboard"}
                        data-testid={`command-finder-object-${group.source}-${r.id}`}
                        className={rowClass}
                      >
                        <span className="min-w-0 truncate font-medium">
                          {r.label}
                        </span>
                        <span className="shrink-0 font-mono text-meta text-text-muted">
                          {t(`groups.${group.source}`)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {showNoResults && (
        <p
          data-testid="command-finder-no-results"
          className="text-xs leading-relaxed text-text-muted"
          aria-live="polite"
        >
          {t("noResults")}
        </p>
      )}
    </section>
  );
}
