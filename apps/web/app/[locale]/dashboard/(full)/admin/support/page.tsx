import { setRequestLocale, getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin support inbox (v1). Lists `kind='support'` conversations
 * surfaced by the support launcher on `/dashboard/communication`.
 * RLS scopes admin SELECT via `is_admin()` on `conversations`.
 *
 * Read-only: admin clicks into a thread, then joins it from the
 * detail page (separate "Join thread" control will land in a small
 * follow-up — admin can also navigate directly today via the row link).
 */
type SupportRow = {
  id: string;
  subject: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase as unknown;
}

export default async function AdminSupportInboxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireSuperadmin(locale);
  setRequestLocale(locale);
  const t = await getTranslations("communication.adminSupport");

  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("conversations")
    .select("id, subject, created_by, created_at, updated_at")
    .eq("kind", "support")
    .order("updated_at", { ascending: false })
    .limit(200);
  const rows: SupportRow[] = error ? [] : ((data ?? []) as SupportRow[]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      {error && (
        <p
          role="alert"
          className="card-border bg-state-danger/5 p-4 text-sm text-state-danger"
        >
          {t("loadError", { msg: error.message ?? "unknown" })}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="card-border p-4 text-sm text-text-secondary">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/dashboard/communication/${r.id}`}
                className="card-border flex flex-col gap-1 p-3 hover:border-brand-blue"
                data-testid={`admin-support-row-${r.id}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-text-primary">
                    {r.subject ?? t("unnamed")}
                  </span>
                  <span className="font-mono text-[10px] text-text-muted whitespace-nowrap">
                    {new Date(r.updated_at).toLocaleString(locale)}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-text-muted">
                  {t("createdBy", { id: r.created_by?.slice(0, 8) ?? "?" })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-text-muted">{t("footnote")}</p>
    </div>
  );
}
