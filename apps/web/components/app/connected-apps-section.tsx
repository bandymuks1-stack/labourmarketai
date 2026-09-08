import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { formatUtcDateTime } from "@/lib/time/display";

import { ConnectedAppRevokeButton } from "@/components/app/connected-app-revoke-button";
import {
  presentConnectedApps,
  type ConnectedAppsFeedback,
} from "@/lib/auth/connected-apps";
import { createClient } from "@/lib/supabase/server";

/**
 * CONNECTED APPS (Train A slice 2, 2026-09-02) — the native surface where a
 * person sees which external applications / assistants hold delegated access
 * to their LabourMarket.ai account, with what permissions, since when, and
 * disconnects them explicitly.
 *
 * Data: GoTrue's own grant list for the signed-in user (`listGrants`) — the
 * same records the consent screen creates and `revokeGrant` ends. Nothing is
 * cached or mirrored by us; a client that registered no name is shown as
 * "unnamed application", never guessed. There is no "last used" column
 * because GoTrue does not expose one — we do not invent it.
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
  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.listGrants();
  const apps = error ? null : presentConnectedApps(data);

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
          {apps.map((app) => {
            const name = app.name ?? t("unnamed");
            return (
              <li
                key={app.clientId}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                data-testid="connected-app"
                data-client-id={app.clientId}
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
                      className="break-all text-xs text-brand-blue hover:text-brand-cyan"
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
                  {app.scopes.length > 0 && (
                    <p className="text-xs text-text-secondary">
                      <span className="text-text-muted">{t("scopesLabel")}: </span>
                      <span className="font-mono" data-testid="connected-app-scopes">
                        {app.scopes.join(" · ")}
                      </span>
                    </p>
                  )}
                </div>
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
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 border-t border-ink-600 pt-3 text-xs leading-relaxed text-text-muted">
        {t("note")}
      </p>
      </Card>
    </section>
  );
}
