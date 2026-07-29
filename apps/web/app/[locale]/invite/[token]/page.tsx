import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  acceptInviteFormAction,
  declineInviteFormAction,
} from "@/lib/invitations/invite-page-actions";

/**
 * Invitation landing page (core-network area B) — the destination of every
 * emailed / shared invite link.
 *
 * Flow: unauthenticated visitors are sent to login/signup with
 * ?next=/{locale}/invite/{token} (the existing safe-return mechanism), so
 * after auth they come straight back here. The preview RPC is token-gated
 * and authenticated-only — the page never reveals whether any email has an
 * account, and the token itself is the only capability.
 */

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

type Preview = {
  outcome: string;
  invitation_type?: string;
  status?: string;
  invited_email?: string;
  invited_name?: string | null;
  proposed_role?: string | null;
  personal_message?: string | null;
  expires_at?: string;
  organization_name?: string | null;
  project_title?: string | null;
  inviter_name?: string | null;
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale, token } = await params;
  const { notice } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("network.invitePage");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/invite/${token}`)}`,
    );
  }

  const { data, error } = await asAny(supabase).rpc("get_invitation_preview_v1", {
    p_token: token,
  });

  const shell = (children: React.ReactNode) => (
    <main
      className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-4 px-6 py-10"
      data-testid="invite-page"
    >
      {children}
    </main>
  );

  if (error) {
    const missing = error.code === "42883";
    return shell(
      <p className="rounded-md border border-dashed border-ink-500 p-5 text-sm text-text-secondary">
        {missing ? t("notEnabled") : t("loadError")}
      </p>,
    );
  }

  const preview = (data ?? { outcome: "not_found" }) as Preview;
  if (preview.outcome !== "ok") {
    return shell(
      <>
        <h1 className="font-display text-2xl font-bold text-text-primary">
          {t("invalidTitle")}
        </h1>
        <p className="text-sm text-text-secondary">{t("invalidBody")}</p>
        <Link
          href="/dashboard"
          className="w-fit rounded-md border border-brand-blue/50 px-4 py-2 text-sm text-brand-blue hover:border-brand-blue"
        >
          {t("toDashboard")}
        </Link>
      </>,
    );
  }

  const status = preview.status ?? "pending";
  const closed = status !== "pending";

  return shell(
    <>
      <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
        {t("eyebrow")}
      </p>
      <h1 className="font-display text-2xl font-bold text-text-primary">
        {t(`titles.${preview.invitation_type ?? "join_platform"}`)}
      </h1>
      <div className="flex flex-col gap-1 text-sm text-text-secondary">
        {preview.inviter_name && (
          <p data-testid="invite-inviter">{t("from", { name: preview.inviter_name })}</p>
        )}
        {preview.organization_name && (
          <p data-testid="invite-org">{t("organization", { name: preview.organization_name })}</p>
        )}
        {preview.project_title && (
          <p data-testid="invite-project">{t("project", { name: preview.project_title })}</p>
        )}
        {preview.proposed_role && (
          <p data-testid="invite-role">{t("role", { role: preview.proposed_role })}</p>
        )}
        {preview.personal_message && (
          <p className="rounded-md border border-ink-600 bg-ink-800/30 px-3 py-2 text-xs">
            &ldquo;{preview.personal_message}&rdquo;
          </p>
        )}
      </div>

      {notice && (
        <p
          role="status"
          className="rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 text-xs text-text-secondary"
          data-testid="invite-notice"
        >
          {t(`notices.${notice}`)}
        </p>
      )}

      {closed ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-secondary"
          data-testid="invite-closed"
        >
          {t(`closed.${status}`)}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <form action={acceptInviteFormAction}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              data-testid="invite-accept"
              className="inline-flex min-h-11 items-center rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-5 py-2 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
            >
              {t("accept")}
            </button>
          </form>
          <form action={declineInviteFormAction}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              data-testid="invite-decline"
              className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-5 py-2 text-sm text-text-secondary hover:border-brand-blue hover:text-text-primary"
            >
              {t("decline")}
            </button>
          </form>
        </div>
      )}

      <p className="text-meta text-text-muted">
        {t("expiresNote", {
          date: preview.expires_at
            ? new Date(preview.expires_at).toLocaleDateString(locale)
            : "—",
        })}
      </p>
    </>,
  );
}
