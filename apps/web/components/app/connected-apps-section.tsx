import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { formatUtcDateTime } from "@/lib/time/display";

import { ConnectedAppPermissionsForm } from "@/components/app/connected-app-permissions-form";
import { ConnectedAppRevokeButton } from "@/components/app/connected-app-revoke-button";
import {
  attachProductPermissions,
  presentConnectedApps,
  type ConnectedAppsFeedback,
  type ProductPermissionView,
} from "@/lib/auth/connected-apps";
import { readOwnProductGrants } from "@/lib/auth/oauth-product-grants";
import { env } from "@/lib/env";
import { PRODUCT_SCOPES, consentScopeMessageKey, scopeEnforcementModeOf } from "@/lib/mcp/scopes";
import { createClient } from "@/lib/supabase/server";

/**
 * CONNECTED APPS (Train A slice 2, 2026-09-02; B3 permissions 2026-10) — the
 * native surface where a person sees which external applications /
 * assistants hold delegated access to their LabourMarket.ai account, WHAT
 * each may do here, since when, and changes or ends that access explicitly.
 *
 * Data:
 *   - GoTrue's own grant list for the signed-in user (`listGrants`) — the
 *     connections themselves and the sign-in details (OIDC scopes) shared;
 *   - the person's own recorded permission choices
 *     (read_oauth_product_grant_v1) — what each app may do here.
 * A client that registered no name is shown as "unnamed application", never
 * guessed. There is no "last used" column because GoTrue does not expose one
 * — we do not invent it. A failed read of either source is said, never shown
 * as an empty list or as "no permissions".
 *
 * Vendor neutrality: ChatGPT, Claude and any future client appear here the
 * same way; nothing in this component knows any of them by name.
 */
export async function ConnectedAppsSection({
  locale,
  feedback,
}: {
  locale: string;
  feedback: ConnectedAppsFeedback | null;
}) {
  const t = await getTranslations("auth.dashboard.account.connectedApps");
  const tConsent = await getTranslations("oauthConsent");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.listGrants();
  const apps = error ? null : presentConnectedApps(data);
  const withPermissions =
    apps === null || apps.length === 0 ? [] : attachProductPermissions(apps, await readOwnProductGrants(supabase));
  const legacyOpen = scopeEnforcementModeOf(env.MCP_SCOPE_ENFORCEMENT) !== "enforce";

  const options = PRODUCT_SCOPES.map((scope) => ({
    scope,
    label: tConsent(`scope.${consentScopeMessageKey(scope)}`),
  }));
  const labelOf = new Map(options.map((o) => [o.scope, o.label]));

  function permissionsText(p: ProductPermissionView): string | null {
    switch (p.state) {
      case "granted":
        return p.scopes.length === 0 ? t("permissionsNone") : null;
      case "legacy":
        return legacyOpen ? t("legacyOpen") : t("legacyEnforced");
      case "revoked":
        return t("permissionsRevoked");
      case "unknown":
        return t("permissionsUnknown");
    }
  }

  return (
    <section id="connected-apps" data-testid="account-connected-apps">
      <Card compact>
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t("title")}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-text-secondary">
        {t("intro")}
      </p>

      {feedback === "revoked" && (
        <p
          role="status"
          className="mt-3 rounded-md border border-state-live/40 bg-state-live/5 px-3 py-2 text-xs text-text-secondary"
          data-testid="connected-apps-revoked"
        >
          {t("feedbackRevoked")}
        </p>
      )}
      {feedback === "permissions_saved" && (
        <p
          role="status"
          className="mt-3 rounded-md border border-state-live/40 bg-state-live/5 px-3 py-2 text-xs text-text-secondary"
          data-testid="connected-apps-permissions-saved"
        >
          {t("feedbackPermissionsSaved")}
        </p>
      )}
      {feedback === "none_selected" && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-state-danger/40 bg-state-danger/5 px-3 py-2 text-xs text-state-danger"
          data-testid="connected-apps-none-selected"
        >
          {t("feedbackNoneSelected")}
        </p>
      )}
      {feedback === "error" && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-state-danger/40 bg-state-danger/5 px-3 py-2 text-xs text-state-danger"
          data-testid="connected-apps-error"
        >
          {t("feedbackError")}
        </p>
      )}

      {apps === null ? (
        // The auth server could not be read: say so, never render an empty
        // list that reads as "nothing is connected".
        <p className="mt-4 text-sm text-text-secondary" role="alert" data-testid="connected-apps-unavailable">
          {t("unavailable")}
        </p>
      ) : apps.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary" data-testid="connected-apps-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-ink-600" data-testid="connected-apps-list">
          {withPermissions.map((app) => {
            const name = app.name ?? t("unnamed");
            const p = app.permissions;
            const note = permissionsText(p);
            const current = p.state === "granted" ? p.scopes : [];
            return (
              <li
                key={app.clientId}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
                data-testid="connected-app"
                data-client-id={app.clientId}
                data-permissions-state={p.state}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm font-medium text-text-primary" data-testid="connected-app-name">
                    {name}
                  </p>
                  {app.website && (
                    <a
                      href={app.website}
                      rel="noopener noreferrer nofollow"
                      target="_blank"
                      className="break-all text-xs text-brand-blue hover:text-brand-champagne"
                    >
                      {app.website}
                    </a>
                  )}
                  <p className="text-xs text-text-muted">
                    {app.grantedAt
                      ? t("grantedAt", {
                          date: formatUtcDateTime(app.grantedAt, locale) ?? "",
                        })
                      : t("grantedUnknown")}
                  </p>

                  <div className="text-xs text-text-secondary" data-testid="connected-app-permissions">
                    <span className="text-text-muted">{t("scopesLabel")}: </span>
                    {p.state === "granted" && p.scopes.length > 0 ? (
                      <ul className="mt-1 list-inside list-disc">
                        {p.scopes.map((s) => (
                          <li key={s}>
                            {labelOf.get(s)} <code className="text-[10px] text-text-muted">{s}</code>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span role={p.state === "unknown" ? "alert" : undefined}>{note}</span>
                    )}
                  </div>

                  {app.scopes.length > 0 && (
                    <p className="text-xs text-text-secondary">
                      <span className="text-text-muted">{t("identityScopesLabel")}: </span>
                      <span className="font-mono" data-testid="connected-app-scopes">
                        {app.scopes.join(" · ")}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  {p.state !== "unknown" && (
                    <ConnectedAppPermissionsForm
                      clientId={app.clientId}
                      name={name}
                      locale={locale}
                      options={options}
                      current={current}
                      labels={{
                        change: p.state === "granted" ? t("changePermissions") : t("setPermissions"),
                        legend: t("chooseLegend"),
                        hint: t("chooseHint"),
                        save: t("save"),
                        pending: t("savePending"),
                        cancel: t("cancel"),
                      }}
                    />
                  )}
                  <ConnectedAppRevokeButton
                    clientId={app.clientId}
                    name={name}
                    locale={locale}
                    labels={{
                      disconnect: t("disconnect"),
                      confirmTitle: t("confirmTitle", { name }),
                      confirmBody: t("confirmBody"),
                      confirmYes: t("confirmYes"),
                      pending: t("pending"),
                      cancel: t("cancel"),
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 border-t border-ink-600 pt-3 text-xs leading-relaxed text-text-muted">
        {t("reachNote")}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-text-muted">
        {t("note")}
      </p>
      </Card>
    </section>
  );
}
