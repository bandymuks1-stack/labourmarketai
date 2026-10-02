import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DiscoverCard } from "@/components/app/discover/discover-card";
import {
  discoverEntriesFor,
  groupDiscoverEntries,
  type DiscoverSide,
} from "@/lib/discover/discover-registry";
import { resolveDiscoverViewer } from "@/lib/discover/discover-viewer";

/**
 * DISCOVER - the role-aware destination for everything people and businesses
 * OFFER or SEEK: work, people and companies, services, work resources,
 * places. Owner decision 2026-10-02: the marketplace is broader than
 * recruitment and must not hide under the map.
 *
 * This page owns NO data. It selects, for THIS viewer's roles, the real
 * sections that already exist (lib/discover/discover-registry.ts) and links to
 * them. Branches that do not exist yet are not listed, and nothing here is a
 * sample listing. Every destination keeps its own auth / role gate.
 */
export default async function DiscoverPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const viewer = await resolveDiscoverViewer();
  if (!viewer) redirect(`/${locale}/auth/login?next=/${locale}/dashboard/market`);

  const t = await getTranslations("discover");
  const groups = groupDiscoverEntries(discoverEntriesFor(viewer));
  const sideLabel = (s: DiscoverSide) => t(`side.${s}`);

  return (
    <div
      className="mx-auto flex w-full max-w-content flex-col gap-10"
      data-testid="discover-page"
    >
      <header className="relative isolate overflow-hidden rounded-[2rem] bg-ink-800/70 px-5 py-8 shadow-[0_1px_0_rgb(255_255_255/0.1)_inset,0_0_0_1px_rgb(255_255_255/0.07)] sm:px-10 sm:py-12">
        <span
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-32 -z-10 h-80 w-80 rounded-full bg-brand-blue/15 blur-3xl"
        />
        <p className="text-support font-medium text-brand-blue">{t("eyebrow")}</p>
        <h1 className="mt-2 max-w-3xl font-display text-4xl font-bold leading-[1.04] tracking-tightest text-text-primary sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-2xl text-body text-text-secondary">{t("lead")}</p>
        <p className="mt-5 max-w-2xl text-support text-text-muted">{t("honesty")}</p>
      </header>

      {groups.map(({ group, entries }) => (
        <section
          key={group}
          aria-labelledby={`discover-${group}`}
          data-testid={`discover-group-${group}`}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2
              id={`discover-${group}`}
              className="font-display text-2xl font-bold tracking-tightest text-text-primary"
            >
              {t(`groups.${group}.title`)}
            </h2>
            <p className="max-w-2xl text-support text-text-secondary">
              {t(`groups.${group}.lead`)}
            </p>
          </div>
          <ul
            className={
              group === "around"
                ? "grid gap-4 sm:grid-cols-2"
                : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            }
          >
            {entries.map((e) => (
              <li key={e.id} className="flex">
                <DiscoverCard
                  id={e.id}
                  href={e.href}
                  icon={e.icon}
                  title={t(`entries.${e.id}.title`)}
                  description={t(`entries.${e.id}.desc`)}
                  side={e.side}
                  sideLabel={sideLabel(e.side)}
                  statusLabel={e.status === "early" ? t("status.early") : undefined}
                  feature={group === "around"}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-support text-text-muted" data-testid="discover-early-note">
        {t("status.earlyNote")}
      </p>
    </div>
  );
}
