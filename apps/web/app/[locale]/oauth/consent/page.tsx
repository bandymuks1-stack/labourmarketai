import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { OauthScopeCheckboxes } from "@/components/app/oauth-scope-checkboxes";
import { decideOauthConsent } from "@/lib/auth/oauth-consent-actions";
import {
  chooserNeeded,
  initialSelection,
  readOwnProductGrants,
} from "@/lib/auth/oauth-product-grants";
import {
  PRODUCT_SCOPES,
  READ_PRODUCT_SCOPES,
  consentScopeMessageKey,
  isProductScope,
  requestedProductScopes,
} from "@/lib/mcp/scopes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * OAUTH CONSENT — the authorization UI the Supabase OAuth 2.1 server
 * delegates to the product (owner directive 2026-08-29 §4; Authorization
 * Path setting → `/oauth/consent`; the intl middleware locale-prefixes the
 * incoming redirect and preserves `authorization_id`).
 *
 * This is the ONE screen where a person grants an external client (the
 * ChatGPT connector, a future agent) standing access to their LabourMarket
 * account — and, since B3, WHICH LabourMarket.ai permissions it gets:
 *
 *   external client → Supabase /auth/v1/oauth/authorize
 *     → THIS PAGE (?authorization_id=…) → tick permissions, approve/deny
 *     → the choice is recorded (grant_oauth_product_scopes_v1) BEFORE GoTrue
 *       approves, so no client is ever approved without a recorded choice
 *     → client receives a code → token → the user's OWN JWT
 *     → /api/mcp reads the recorded choice on every request (B2: enforced).
 *
 * TWO MODES
 *   pending    GoTrue needs consent: the full screen, nothing pre-ticked
 *              (least privilege; `?preset=read` ticks the four "see" boxes
 *              because the person pressed that link).
 *   returning  GoTrue answered "already consented" (auto-skip) — it has
 *              already approved and minted a code. The person passes straight
 *              through ONLY when a recorded choice exists and covers what the
 *              client asks for. Otherwise (a consent from before B3, a
 *              withdrawn choice, or a client asking for more) the chooser is
 *              shown first. The code is not handed to the client until the
 *              person saves; if they leave, it expires unused (10 minutes).
 *
 * It shows exactly what GoTrue recorded about the request — client name,
 * registered redirect URI, requested scopes — and nothing invented.
 */
type SearchParams = {
  authorization_id?: string;
  error?: string;
  outcome?: string;
  preset?: string;
};

export default async function OauthConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("oauthConsent");
  const {
    authorization_id: authorizationId,
    error: errorParam,
    outcome,
    preset: presetParam,
  } = await searchParams;

  // Terminal states after a decision (no authorization left to act on).
  if (outcome === "disconnected" || outcome === "saved_reconnect") {
    const key = outcome === "disconnected" ? "outcomeDisconnected" : "outcomeSavedReconnect";
    return (
      <ConsentShell title={t("title")}>
        <p role="status" className="text-sm text-text-secondary">
          {t(key)}
        </p>
      </ConsentShell>
    );
  }

  if (!authorizationId) {
    return (
      <ConsentShell title={t("title")}>
        <p className="text-sm text-text-muted">
          {errorParam === "save_failed"
            ? t("errorSaveFailed")
            : errorParam
              ? t("errorUnresolved")
              : t("errorMissingId")}
        </p>
      </ConsentShell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/${locale}/auth/login?next=${encodeURIComponent(
        `/${locale}/oauth/consent?authorization_id=${authorizationId}`,
      )}`,
    );
  }

  const { data: details, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) {
    return (
      <ConsentShell title={t("title")}>
        <p className="text-sm text-text-muted">{t("errorUnresolved")}</p>
      </ConsentShell>
    );
  }

  const preset = presetParam === "read" ? "read" : null;
  const options = PRODUCT_SCOPES.map((scope) => ({
    scope,
    label: t(`scope.${consentScopeMessageKey(scope)}`),
  }));

  // ── returning: GoTrue already approved (auto-skip) ────────────────────────
  if (!("authorization_id" in details)) {
    const redirectUrl = (details as { redirect_url: string }).redirect_url;
    const read = await readOwnProductGrants(supabase, { authorizationId });
    const row = read.ok ? read.rows[0] : undefined;
    if (!row) {
      // Cannot tell which client this is for this person: never pass a code
      // through blind. The person reconnects from the app.
      return (
        <ConsentShell title={t("title")}>
          <p className="text-sm text-text-muted">{t("errorUnresolved")}</p>
        </ConsentShell>
      );
    }
    if (!chooserNeeded(row)) {
      redirect(redirectUrl);
    }
    const requested = requestedProductScopes(row.requestedScope);
    const clientName = row.clientName ?? t("unknownClient");
    return (
      <ConsentShell title={t("title")}>
        <p className="text-base">
          {row.hasGrant
            ? t("returningMore", { client: clientName })
            : t("returningUnchosen", { client: clientName })}
        </p>
        <ChooserForm
          t={t}
          authorizationId={authorizationId}
          mode="returning"
          locale={locale}
          options={options}
          checked={initialSelection({
            activeGrant: row.hasGrant ? row.scopes : null,
            preset,
            readPreset: READ_PRODUCT_SCOPES,
          })}
          requested={requested}
          noneSelected={errorParam === "none_selected"}
          approveLabel={t("returningSave")}
          denyLabel={t("returningDisconnect")}
        />
      </ConsentShell>
    );
  }

  // ── pending: GoTrue needs consent ────────────────────────────────────────
  const client = (details as { client?: { name?: string } }).client;
  const redirectUri = (details as { redirect_uri?: string }).redirect_uri ?? "";
  const scope = (details as { scope?: string }).scope ?? "";
  const scopes = [...new Set(scope.split(" ").filter(Boolean))];
  // Sign-in details (OIDC) and anything unknown are listed as GoTrue recorded
  // them; product scopes the client asked for are marked in the chooser.
  const identityScopes = scopes.filter((s) => !isProductScope(s));
  const requested = requestedProductScopes(scope);

  return (
    <ConsentShell title={t("title")}>
      <p className="text-base">
        {t("clientWantsAccess", { client: client?.name ?? t("unknownClient") })}
      </p>

      <dl className="mt-4 space-y-2 text-sm">
        <div>
          <dt className="font-medium">{t("clientLabel")}</dt>
          <dd className="text-text-muted">{client?.name ?? t("unknownClient")}</dd>
        </div>
        <div>
          <dt className="font-medium">{t("redirectLabel")}</dt>
          <dd className="break-all text-text-muted">{redirectUri}</dd>
        </div>
        {identityScopes.length > 0 && (
          <div>
            <dt className="font-medium">{t("identityScopesLabel")}</dt>
            <dd>
              <ul className="list-inside list-disc text-text-muted">
                {identityScopes.map((s) => {
                  const key = consentScopeMessageKey(s);
                  return (
                    <li key={s}>
                      {key ? t(`scope.${key}`) : t("scopeUnknown")}{" "}
                      <code className="text-xs">{s}</code>
                    </li>
                  );
                })}
              </ul>
            </dd>
          </div>
        )}
      </dl>

      <ChooserForm
        t={t}
        authorizationId={authorizationId}
        mode="pending"
        locale={locale}
        options={options}
        checked={initialSelection({ activeGrant: null, preset, readPreset: READ_PRODUCT_SCOPES })}
        requested={requested}
        noneSelected={errorParam === "none_selected"}
        approveLabel={t("approve")}
        denyLabel={t("deny")}
      />
    </ConsentShell>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"oauthConsent">>>;

function ChooserForm({
  t,
  authorizationId,
  mode,
  locale,
  options,
  checked,
  requested,
  noneSelected,
  approveLabel,
  denyLabel,
}: {
  t: T;
  authorizationId: string;
  mode: "pending" | "returning";
  locale: string;
  options: { scope: (typeof PRODUCT_SCOPES)[number]; label: string }[];
  checked: (typeof PRODUCT_SCOPES)[number][];
  requested: (typeof PRODUCT_SCOPES)[number][];
  noneSelected: boolean;
  approveLabel: string;
  denyLabel: string;
}) {
  const presetHref = `/${locale}/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&preset=read`;
  return (
    <form action={decideOauthConsent} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="authorization_id" value={authorizationId} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="locale" value={locale} />

      {noneSelected && (
        <p role="alert" className="rounded-md border border-state-danger/40 bg-state-danger/5 px-3 py-2 text-xs text-state-danger">
          {t("errorNoneSelected")}
        </p>
      )}

      <OauthScopeCheckboxes
        legend={t("chooseLegend")}
        hint={t("chooseHint")}
        options={options}
        checked={checked}
        requested={requested}
        requestedLabel={t("chooseRequested")}
        idPrefix="consent-scope"
      />
      <a href={presetHref} className="text-xs text-brand-blue hover:text-brand-champagne" data-testid="consent-preset-read">
        {t("choosePresetRead")}
      </a>

      <p className="text-sm">{t("scope.billingNone")}</p>
      {/* What a grant really allows (B4): the app acts as the person, and it
          can take both the draft and the confirm step itself. */}
      <p className="text-sm">{t("reachNote")}</p>
      <p className="text-xs text-text-muted">{t("authorityNote")}</p>

      <div className="flex gap-3">
        <button
          type="submit"
          name="decision"
          value="approve"
          className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-text-on-brand hover:opacity-90"
        >
          {approveLabel}
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-surface-2"
        >
          {denyLabel}
        </button>
      </div>
    </form>
  );
}

function ConsentShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="mt-3">{children}</div>
    </main>
  );
}
