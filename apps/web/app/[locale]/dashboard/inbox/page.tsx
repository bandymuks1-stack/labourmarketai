import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  JournalInboxEntry,
  type InboxEntry,
} from "@/components/app/journal-inbox-entry";
import { createClient } from "@/lib/supabase/server";

const MANAGER_RELATIONSHIPS = ["manager", "owner", "external_manager"];

// Structured-field slugs that have a localized label; others fall back to slug.
const FIELD_LABEL_SLUGS = new Set(["site_name", "tile_type", "area_done"]);

/** Manager "Patvirtinti įrašai" inbox (§13.2). Lists pending journal entries
 *  from workers in organizations the viewer manages, with confirm / reject. */
export default async function InboxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("journal");
  const tField = await getTranslations("journal");
  const tUnit = await getTranslations("productivityUnits");
  const tSkill = await getTranslations("skillNames");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  // Organizations this person manages.
  const { data: mgrEc } = await supabase
    .from("engagement_contexts")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .in("relationship_slug", MANAGER_RELATIONSHIPS);
  const orgIds = [
    ...new Set(
      (mgrEc ?? [])
        .map((r) => r.organization_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  let pending: InboxEntry[] = [];
  if (orgIds.length > 0) {
    const { data: rows } = await supabase
      .from("journal_entries")
      .select(
        "id, original_text, created_at, worker_id, engagement_contexts!inner(organization_id), journal_entry_metrics(metric_slug, value_text, value_numeric, unit_slug), journal_entry_confirmations(id), workers!inner(profiles(full_name, email))",
      )
      .in("engagement_contexts.organization_id", orgIds)
      .order("created_at", { ascending: true });

    const unconfirmed = (rows ?? []).filter(
      (r) => (r.journal_entry_confirmations ?? []).length === 0,
    );

    // Batch the workers' declared skills for the "skills attached" line.
    const workerIds = [
      ...new Set(unconfirmed.map((r) => r.worker_id).filter(Boolean)),
    ] as string[];
    const skillsByWorker = new Map<string, string[]>();
    if (workerIds.length > 0) {
      const { data: ws } = await supabase
        .from("worker_skills")
        .select("worker_id, skills(slug)")
        .in("worker_id", workerIds);
      for (const r of ws ?? []) {
        const slug = (r.skills as { slug: string | null } | null)?.slug;
        if (!r.worker_id || !slug) continue;
        const list = skillsByWorker.get(r.worker_id) ?? [];
        list.push(tSkill(slug));
        skillsByWorker.set(r.worker_id, list);
      }
    }

    pending = unconfirmed.map((r) => {
      const prof = (r.workers as { profiles: { full_name: string | null; email: string | null } | null } | null)
        ?.profiles;
      const workerName =
        prof?.full_name ?? (prof?.email ? prof.email.split("@")[0] : "—");
      const metrics = (r.journal_entry_metrics ?? []).map((m) => {
        const label = FIELD_LABEL_SLUGS.has(m.metric_slug)
          ? tField(`field.${m.metric_slug}`)
          : m.metric_slug;
        const value =
          m.value_numeric != null
            ? `${m.value_numeric}${m.unit_slug ? ` ${tUnit(m.unit_slug)}` : ""}`
            : (m.value_text ?? "");
        return { label, value };
      });
      return {
        id: r.id,
        originalText: r.original_text,
        workerName,
        createdAt: r.created_at,
        metrics,
        skills: r.worker_id ? (skillsByWorker.get(r.worker_id) ?? []) : [],
      };
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("inbox.title")}
        </h1>
      </header>

      {pending.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("inbox.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((e) => (
            <JournalInboxEntry key={e.id} entry={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
