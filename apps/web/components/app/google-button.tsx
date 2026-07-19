"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { generateOauthTraceId } from "@/lib/auth/oauth-trace";
import { recordEvent, trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/** Public OAuth client id — inlined at build time. Google sign-in is
 *  offered ONLY when this is configured; the legacy Supabase-hosted
 *  redirect fallback was removed in single-domain Phase 3 (2026-07-19)
 *  after the first-party flow was proven live. Unset → the Google
 *  option is simply absent and email/password remains the sign-in
 *  path (honest absence, no dead button). */
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

/**
 * "Continue with Google" for /auth/login and /auth/signup — FIRST-PARTY
 * ONLY (Google Identity Services ID-token flow):
 *
 *   labourmarket.ai → accounts.google.com popup → labourmarket.ai
 *
 * Google returns an ID token to this page; we POST it with a
 * per-attempt nonce to the same-origin /api/auth/google, which performs
 * the server-side Supabase exchange and answers with the safe `next`
 * path. The browser NEVER navigates through the Supabase host —
 * guarded by lib/guards/first-party-google-auth.test.ts.
 */
export function GoogleButton({
  redirectingLabel,
  errorLabel,
  nextPath,
}: {
  /** Kept in the prop contract for the login/signup callers; the GIS
   *  iframe renders its own localized label. */
  label?: string;
  redirectingLabel: string;
  errorLabel: string;
  disabled?: boolean;
  /** Already-sanitised internal path (see `getSafeReturnPath`). When set,
   *  the auth exchange routes the user here on success. */
  nextPath?: string;
}) {
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const gisContainer = useRef<HTMLDivElement | null>(null);
  // Per-attempt nonce: generated once per mount, passed BOTH to GIS
  // (embedded into the ID token by Google) and to our endpoint (which
  // requires equality + hands it to Supabase for its own check).
  const nonceRef = useRef<string>("");
  if (!nonceRef.current) {
    nonceRef.current = generateOauthTraceId() + generateOauthTraceId();
  }

  const handleCredential = useCallback(
    async (response: GisCredentialResponse) => {
      setFailed(false);
      setLoading(true);
      try {
        if (!response?.credential) throw new Error("no_credential");
        trackFunnel(FUNNEL_EVENTS.loginStarted, { surface: "google" });
        recordEvent("google_id_token_start", { provider: "google" });
        const res = await fetch(
          `/api/auth/google?locale=${encodeURIComponent(locale)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              credential: response.credential,
              nonce: nonceRef.current,
              next: nextPath ?? null,
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
        recordEvent("google_id_token_success", { provider: "google" });
        // Full navigation so server components render with the fresh
        // session cookies.
        window.location.assign(out.next);
      } catch (e) {
        // Never log the credential — name/message only.
        console.error("[auth] first-party google sign-in failed:", {
          name: e instanceof Error ? e.name : "unknown",
          message: e instanceof Error ? e.message : String(e),
        });
        recordEvent("google_id_token_error", {
          provider: "google",
          result_kind: e instanceof Error ? e.message : "unknown",
        });
        setLoading(false);
        setFailed(true);
      }
    },
    [locale, nextPath],
  );

  // Load the GIS script and render Google's button.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;

    const init = () => {
      if (cancelled) return;
      const gis = window.google?.accounts?.id;
      const parent = gisContainer.current;
      if (!gis || !parent) return;
      // Idempotent re-init: never stack a second Google iframe.
      parent.innerHTML = "";
      gis.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
        nonce: nonceRef.current,
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
      if (window.google?.accounts?.id) init();
      else existing.addEventListener("load", init, { once: true });
    } else {
      const s = document.createElement("script");
      s.src = GSI_SRC;
      s.async = true;
      s.defer = true;
      s.addEventListener("load", init, { once: true });
      document.head.appendChild(s);
    }
    return () => {
      cancelled = true;
    };
  }, [handleCredential, locale]);

  // Not configured → the Google option is honestly absent.
  if (!GOOGLE_CLIENT_ID) return null;

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
        <p className="text-xs text-state-danger" role="alert">
          {errorLabel}
        </p>
      )}
    </div>
  );
}
