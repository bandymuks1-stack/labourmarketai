import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";
import {
  listPilotDraftsForProfile,
  type DraftType,
} from "@/lib/pilot/pilot-drafts";

type ClaimRow = {
  id: string;
  label: string;
  normalized_label: string;
  source: string;
  status: string;
  visibility: string;
  created_at: string;
};

function claims(supabase: SupabaseClient) {
  return (
    supabase as unknown as {
      from: (name: string) => ReturnType<SupabaseClient["from"]>;
    }
  ).from("profile_skill_claims");
}

/**
 * Per-user pilot inspect view. Server-side admin gate; admin RLS
 * lets us SELECT from profiles + profile_skill_claims for any row.
 *
 * Read-only in this PR. The narrative text is shown VERBATIM to the
 * admin so they can review pilot use; no mutation surface.
 */
export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("admin");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, active_role, profile_text, onboarded_at, created_at, updated_at",
    )
    .eq("id", id)
    .single();
  if (!profile) notFound();

  const { data: claimsData } = await claims(supabase)
    .select(
      "id, label, normalized_label, source, status, visibility, created_at",
    )
    .eq("profile_id", id)
    .order("created_at", { ascending: false });
  const userClaims = (claimsData ?? []) as unknown as ClaimRow[];

  // Pilot drafts for this profile (feat/cc/pilot-draft-flows). Admin
  // RLS allows broad SELECT via is_admin().
  const userDrafts = await listPilotDraftsForProfile(id);

  return (
    <div
      className="flex flex-col gap-6"
      data-testid="admin-user-detail"
    >
      <header className="flex flex-col gap-1">
        <Link
          href="/dashboard/admin"
          className="self-start text-xs text-text-secondary hover:text-text-primary"
        >
          ← {t("back")}
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {profile.full_name ?? profile.email ?? id}
        </h1>
        <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {profile.active_role ?? "—"} ·{" "}
          {profile.onboarded_at ? t("user.onboarded") : t("user.notOnboarded")}
        </p>
      </header>

      <section className="card-border flex flex-col gap-2 p-4">
        <h2 className="font-display text-sm font-semibold text-text-primary">
          {t("user.profileTextTitle")}
        </h2>
        {profile.profile_text && profile.profile_text.length > 0 ? (
          <p className="whitespace-pre-wrap text-sm text-text-secondary">
            {profile.profile_text}
          </p>
        ) : (
          <p className="text-sm text-text-muted">{t("user.profileTextEmpty")}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-sm font-semibold text-text-primary">
          {t("user.claimsTitle")} · {userClaims.length}
        </h2>
        {userClaims.length === 0 ? (
          <p className="text-sm text-text-muted">{t("user.claimsEmpty")}</p>
        ) : (
          <ul
            className="flex flex-wrap gap-2"
            data-testid="admin-user-claims"
          >
            {userClaims.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-md border border-state-success/40 bg-state-success/5 px-2 py-1 text-sm text-text-primary"
              >
                <span>{c.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="flex flex-col gap-3"
        data-testid="admin-user-drafts"
      >
        <h2 className="font-display text-sm font-semibold text-text-primary">
          {t("user.draftsTitle")} · {userDrafts.length}
        </h2>
        {userDrafts.length === 0 ? (
          <p className="text-sm text-text-muted">{t("user.draftsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {userDrafts.map((d) => {
              const payload = (d.payload ?? {}) as Record<string, unknown>;
              const entries = Object.entries(payload).filter(
                ([, v]) => typeof v === "string" && v.length > 0,
              );
              return (
                <li
                  key={d.id}
                  className="card-border flex flex-col gap-2 p-3"
                >
                  <header className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
                      {t(
                        `user.draftType.${d.draft_type as DraftType}`,
                      )}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {d.visibility}
                    </span>
                  </header>
                  {entries.length === 0 ? (
                    <p className="text-xs text-text-muted">
                      {t("user.draftEmpty")}
                    </p>
                  ) : (
                    <dl className="grid gap-1 sm:grid-cols-2 text-xs">
                      {entries.map(([k, v]) => (
                        <div key={k} className="flex flex-col gap-0.5">
                          <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                            {k}
                          </dt>
                          <dd className="text-text-secondary">
                            {String(v)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
