import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { decideOauthConsent } from "@/lib/auth/oauth-consent-actions";
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
 * account. The chain it completes:
 *
 *   external client → Supabase /auth/v1/oauth/authorize
 *     → THIS PAGE (?authorization_id=…) → approve/deny (their own session)
 *     → client receives a code → token → the user's OWN JWT
 *     → the canonical bearer boundary → RLS as that user.
 *
 * It shows exactly what GoTrue recorded about the request — client name,
 * registered redirect URI, requested scopes — and nothing invented. A person
 * who is not signed in goes through the normal login with `?next=` carrying
 * the authorization id back here (the id is not credential material: it
 * resolves only for the user GoTrue bound it to, through their session).
 */
export default async function OauthConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("oauthConsent");
  const { authorization_id: authorizationId, error: errorParam } =
    await searchParams;

  if (!authorizationId) {
    return (
      <ConsentShell title={t("title")}>
        <p className="text-sm text-muted-foreground">
          {errorParam ? t("errorUnresolved") : t("errorMissingId")}
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
        <p className="text-sm text-muted-foreground">{t("errorUnresolved")}</p>
      </ConsentShell>
    );
  }

  // A previously-granted client skips the screen: GoTrue answers with the
  // final redirect instead of a pending authorization.
  if (!("authorization_id" in details)) {
    redirect((details as { redirect_url: string }).redirect_url);
  }

  const client = (details as { client?: { name?: string } }).client;
  const redirectUri = (details as { redirect_uri?: string }).redirect_uri ?? "";
  const scope = (details as { scope?: string }).scope ?? "";
  const scopes = scope.split(" ").filter(Boolean);

  return (
    <ConsentShell title={t("title")}>
      <p className="text-base">
        {t("clientWantsAccess", { client: client?.name ?? t("unknownClient") })}
      </p>

      <dl className="mt-4 space-y-2 text-sm">
        <div>
          <dt className="font-medium">{t("clientLabel")}</dt>
          <dd className="text-muted-foreground">{client?.name ?? t("unknownClient")}</dd>
        </div>
        <div>
          <dt className="font-medium">{t("redirectLabel")}</dt>
          <dd className="break-all text-muted-foreground">{redirectUri}</dd>
        </div>
        {scopes.length > 0 && (
          <div>
            <dt className="font-medium">{t("scopesLabel")}</dt>
            <dd>
              <ul className="list-inside list-disc text-muted-foreground">
                {scopes.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-4 text-xs text-muted-foreground">{t("authorityNote")}</p>

      <form action={decideOauthConsent} className="mt-6 flex gap-3">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button
          type="submit"
          name="decision"
          value="approve"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("approve")}
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          {t("deny")}
        </button>
      </form>
    </ConsentShell>
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
