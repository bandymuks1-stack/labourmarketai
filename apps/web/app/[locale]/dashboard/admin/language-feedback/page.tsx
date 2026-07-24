import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin language-feedback inbox (v1, read-only).
 *
 * Server-side gate: `requireSuperadmin(locale)` runs first; non-admins are
 * redirected to `/<locale>/dashboard` before any data is fetched. The page
 * itself uses the user-scoped supabase client — admin reads succeed because
 * the `language_feedback_select` RLS policy uses `public.is_admin()`.
 *
 * The page is intentionally minimal: a table of (created_at, route, locale,
 * status, comment, selected_text, user_id). No mutations from this surface
 * in v1 — status flips will land in a follow-up with their own narrow RPC.
 *
 * NOT publicly accessible: route lives under the auth-gated `/dashboard`
 * tree AND the RLS policy is admin-only, so even a non-admin who guessed
 * the URL would render an empty list.
 */
type FeedbackRow = {
  id: string;
  route: string;
  locale: string;
  selected_text: string | null;
  comment: string;
  user_id: string | null;
  status: "open" | "reviewed" | "fixed" | "dismissed";
  created_at: string;
};

export default async function AdminLanguageFeedbackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireSuperadmin(locale);
  setRequestLocale(locale);
  const t = await getTranslations("languageFeedback.admin");

  const supabase = await createClient();
  // The generated `Database` type may not include `language_feedback`
  // until `pnpm db:types` is re-run after 0019 — cast supabase.from
  // through `any` so the static name check passes. RLS still gates the
  // result (admin-only SELECT via `public.is_admin()`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromAny = (supabase as any).from.bind(supabase) as (
    name: string,
  ) => {
    select: (cols: string) => {
      order: (
        col: string,
        opts: { ascending: boolean },
      ) => {
        limit: (n: number) => Promise<{
          data: FeedbackRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await fromAny("language_feedback")
    .select(
      "id, route, locale, selected_text, comment, user_id, status, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const rows: FeedbackRow[] = error ? [] : ((data ?? []) as FeedbackRow[]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      {error ? (
        <p
          role="alert"
          className="card-border bg-state-danger/5 p-4 text-sm text-state-danger"
        >
          {t("loadError", { msg: error.message ?? "unknown" })}
        </p>
      ) : rows.length === 0 ? (
        <p className="card-border bg-state-warning/5 p-4 text-sm text-text-secondary">
          {t("empty")}
        </p>
      ) : (
        <div className="card-border overflow-x-auto p-0">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-ink-600/60 bg-ink-800/40 text-text-muted">
              <tr>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("col.createdAt")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("col.status")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("col.locale")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("col.route")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("col.selected")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("col.comment")}
                </th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-label">
                  {t("col.user")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink-700/40 align-top">
                  <td className="px-3 py-2 font-mono text-[11px] text-text-secondary whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString(locale)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-text-secondary">
                    {r.locale}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-text-secondary break-all">
                    {r.route}
                  </td>
                  <td className="px-3 py-2 text-text-primary">
                    {r.selected_text ? (
                      <span className="italic">
                        &bdquo;{r.selected_text}&ldquo;
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 leading-relaxed text-text-primary">
                    {r.comment}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-text-muted break-all">
                    {r.user_id ? r.user_id.slice(0, 8) : t("anonymous")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-text-muted">{t("footnote")}</p>
    </div>
  );
}
