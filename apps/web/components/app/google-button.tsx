"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  generateOauthTraceId,
  isVercelPreviewHost,
  rememberOauthTraceId,
  withOauthTraceId,
} from "@/lib/auth/oauth-trace";
import { sha256Hex } from "@/lib/auth/google-id-token";
import { recordEvent, trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/** Public OAuth client id — inlined at build time. When set, the
 *  first-party Google Identity Services (GIS) ID-token flow is active
 *  and the browser NEVER navigates through the raw Supabase host; when
 *  unset, the legacy signInWithOAuth redirect flow is used. */
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

const GSI_SRC = "https://accounts.google.com/gsi/client";

type GisCredentialResponse = { credential?: string };

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: GisCredentialResponse) => void;
            nonce?: string;
            ux_mode?: "popup" | "redirect";
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>,
          ) => void;
        };
      };
    };
  }
}

/** Official Google "G" mark (multicolour). Inline so the white OAuth button
 *  needs no asset pipeline. */
function GoogleLogo() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Shared "Continue with Google" button used on both /auth/login and
 * /auth/signup.
 *
 * FIRST-PARTY MODE (NEXT_PUBLIC_GOOGLE_CLIENT_ID set): renders the GIS
 * button. Google returns an ID token to this page; we POST it with a
 * per-attempt nonce to the same-origin /api/auth/google, which performs
 * the server-side Supabase exchange and answers with the safe `next`
 * path. Visible surfaces: labourmarket.ai → accounts.google.com popup →
 * labourmarket.ai. No *.supabase.co navigation.
 *
 * LEGACY MODE (client id unset): the previous signInWithOAuth redirect
 * flow via the PKCE callback — scheduled for removal once the
 * first-party flow is verified in production (Phase 3).
 */
export function GoogleButton({
  label,
  redirectingLabel,
  errorLabel,
  disabled,
  nextPath,
}: {
  label: string;
  redirectingLabel: string;
  errorLabel: string;
  disabled?: boolean;
  /** Already-sanitised internal path (see `getSafeReturnPath`). When set,
   *  the auth exchange routes the user here on success. */
  nextPath?: string;
}) {
  const locale = useLocale();
  const tAuth = useTranslations("auth.login");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Non-secret diagnostic reference shown after a GIS failure:
  // "<safe error code> · <trace id>" — quotable in a bug report,
  // matchable against server logs, contains no token material.
  const [errorRef, setErrorRef] = useState<string | null>(null);
  const gisContainer = useRef<HTMLDivElement | null>(null);
  // Per-attempt RAW nonce, generated once per mount. NONCE CONTRACT
  // (root cause of the 2026-07-19 "Nonces mismatch" incident): Google
  // GIS receives the SHA-256 HASH (it lands in the ID token's nonce
  // claim); our endpoint receives the RAW value and Supabase
  // signInWithIdToken re-hashes + compares. See
  // lib/auth/google-id-token.ts.
  const nonceRef = useRef<string>("");
  if (!nonceRef.current) {
    nonceRef.current = generateOauthTraceId() + generateOauthTraceId();
  }

  const handleCredential = useCallback(
    async (response: GisCredentialResponse) => {
      setFailed(false);
      setErrorRef(null);
      setLoading(true);
      // Per-attempt non-secret trace id: rides in the POST body, is
      // echoed in error responses and stamped on every server log line.
      const trace = generateOauthTraceId();
      try {
        if (!response?.credential) throw new Error("no_credential");
        trackFunnel(FUNNEL_EVENTS.loginStarted, { surface: "google" });
        recordEvent("google_id_token_start", { provider: "google", trace });
        const res = await fetch(
          `/api/auth/google?locale=${encodeURIComponent(locale)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              credential: response.credential,
              nonce: nonceRef.current,
              next: nextPath ?? null,
              trace,
            }),
            // Bounded: a hung auth exchange must fail visibly, not hang
            // the login screen (client-fetch-timeout guard).
            signal: AbortSignal.timeout(15_000),
          },
        );
        const out = (await res.json().catch(() => null)) as
          | { ok?: boolean; next?: string; error?: string }
          | null;
        if (!res.ok || !out?.ok || !out.next) {
          throw new Error(out?.error ?? `http_${res.status}`);
        }
        recordEvent("google_id_token_success", { provider: "google", trace });
        // Full navigation so server components render with the fresh
        // session cookies.
        window.location.assign(out.next);
      } catch (e) {
        // Never log the credential — name/message only.
        const safeCode = e instanceof Error ? e.message : "unknown";
        console.error("[auth] first-party google sign-in failed:", {
          name: e instanceof Error ? e.name : "unknown",
          message: safeCode,
          trace,
        });
        recordEvent("google_id_token_error", {
          provider: "google",
          result_kind: safeCode,
          trace,
        });
        setErrorRef(`${safeCode} · ${trace}`);
        setLoading(false);
        setFailed(true);
      }
    },
    [locale, nextPath],
  );

  // First-party mode: hash the nonce, load the GIS script, render
  // Google's button. Hashing is async (WebCrypto), so the whole init
  // chain lives in one cancellable effect.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;

    const init = async () => {
      if (cancelled) return;
      const gis = window.google?.accounts?.id;
      const parent = gisContainer.current;
      if (!gis || !parent) return;
      // Google gets the HASHED nonce (nonce contract — see above).
      const hashedNonce = await sha256Hex(nonceRef.current);
      if (cancelled) return;
      // Idempotent re-init: never stack a second Google iframe.
      parent.innerHTML = "";
      gis.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
        nonce: hashedNonce,
        ux_mode: "popup",
      });
      gis.renderButton(parent, {
        theme: "outline",
        size: "large",
        width: parent.offsetWidth || 320,
        text: "continue_with",
        locale,
      });
    };

    const existing = document.querySelector(
      `script[src="${GSI_SRC}"]`,
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.accounts?.id) void init();
      else existing.addEventListener("load", () => void init(), { once: true });
    } else {
      const s = document.createElement("script");
      s.src = GSI_SRC;
      s.async = true;
      s.defer = true;
      s.addEventListener("load", () => void init(), { once: true });
      document.head.appendChild(s);
    }
    return () => {
      cancelled = true;
    };
  }, [handleCredential, locale]);

  // ── Legacy redirect flow (client id unset) ────────────────────────────
  async function onLegacyClick() {
    setFailed(false);
    setLoading(true);
    try {
      const supabase = createClient();
      // Evict stale local auth state BEFORE writing a fresh PKCE
      // code_verifier cookie (see the PKCE-race note in the git history).
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // No local session — irrelevant for a fresh OAuth start.
      }
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const callback = new URL(`${origin}/${locale}/auth/callback`);
      if (nextPath) callback.searchParams.set("next", nextPath);
      const traceId = generateOauthTraceId();
      rememberOauthTraceId(traceId);
      const callbackWithTrace = withOauthTraceId(callback, traceId);
      console.info("[auth] oauth start", {
        provider: "google",
        trace: traceId,
        origin,
        locale,
      });
      recordEvent("google_oauth_start", {
        provider: "google",
        trace: traceId,
        origin,
        preview_host: isVercelPreviewHost(
          typeof window !== "undefined" ? window.location.host : null,
        ),
      });
      trackFunnel(FUNNEL_EVENTS.loginStarted, { surface: "google" });
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackWithTrace.toString() },
      });
      if (error) throw error;
      // Success: browser navigates to Google; keep the loading state.
    } catch (e) {
      console.error("[auth] signInWithOAuth(google) failed:", {
        name: e instanceof Error ? e.name : "unknown",
        message: e instanceof Error ? e.message : String(e),
      });
      recordEvent("google_oauth_error", {
        provider: "google",
        result_kind: e instanceof Error ? e.name : "unknown",
      });
      setLoading(false);
      setFailed(true);
    }
  }

  if (GOOGLE_CLIENT_ID) {
    return (
      <div className="flex flex-col gap-2">
        {/* GIS renders its own accessible button into this container. */}
        <div
          ref={gisContainer}
          data-testid="google-gis-button"
          aria-busy={loading || undefined}
          className="flex min-h-[40px] w-full justify-center"
        />
        {loading && (
          <p className="text-xs text-text-secondary">{redirectingLabel}</p>
        )}
        {failed && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-state-danger" role="alert">
              {errorLabel}
            </p>
            {errorRef && (
              // Non-secret diagnostic reference (safe error code + trace
              // id) — quotable in a bug report, matchable in server logs.
              <p
                className="font-mono text-[11px] text-text-secondary"
                data-testid="google-error-ref"
              >
                {errorRef}
              </p>
            )}
            {/* TEMPORARY, explicitly labelled recovery path (incident
                2026-07-19): while the first-party flow is unproven for
                real accounts and PR #831 is unmerged, a failed GIS
                attempt reveals the legacy Supabase-hosted redirect
                sign-in. It VISIBLY navigates via the Supabase host —
                never silently; the label says it is a backup route.
                Remove together with the legacy flow (Phase 3). */}
            <button
              type="button"
              onClick={onLegacyClick}
              disabled={disabled || loading}
              data-testid="google-legacy-recovery"
              className="flex w-full items-center justify-center gap-3 rounded-md border border-border bg-white px-4 py-2 text-xs font-medium text-[#1f1f1f] transition-opacity hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleLogo />
              {tAuth("google_recovery_label")}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onLegacyClick}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        // The button surface is ALWAYS the Google-white card (`bg-white`), so
        // its label must use a FIXED dark ink — never `text-ink-900`, which
        // inverts to near-white under `[data-theme="light"]` and makes the
        // label invisible (white-on-white). `#1f1f1f` is Google's own button
        // text colour and is theme-independent, matching the fixed `bg-white`.
        className="flex w-full items-center justify-center gap-3 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-[#1f1f1f] transition-opacity hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleLogo />
        {loading ? redirectingLabel : label}
      </button>
      {failed && (
        <p className="text-xs text-state-danger" role="alert">
          {errorLabel}
        </p>
      )}
    </div>
  );
}
