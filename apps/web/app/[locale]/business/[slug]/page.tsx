import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Globe, Mail, Phone, MapPin, Store, Boxes } from "lucide-react";

import { getPublicBusinessProfile } from "@/lib/company/public-profile";

export const dynamic = "force-dynamic";

/**
 * Public business showcase profile (Wagon 13 slice 2). A PUBLIC, unauthenticated,
 * shareable page at /business/<slug>. It renders ONLY the allowlisted public
 * fields the SECURITY DEFINER reads return, and ONLY for organizations that
 * opted in — default private. Identity from `organizations`, services from
 * `service_offerings`, listings from `marketplace_listings`. No private org /
 * worker / project / contact / membership / financial data.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const view = await getPublicBusinessProfile(slug);
  if (!view) return { title: "labourmarket.ai" };
  const { profile } = view;
  const desc = profile.tagline ?? profile.description ?? undefined;
  return {
    title: `${profile.displayName} — labourmarket.ai`,
    description: desc?.slice(0, 160),
    openGraph: {
      title: profile.displayName,
      description: desc?.slice(0, 160),
      type: "profile",
    },
  };
}

export default async function BusinessProfilePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("businessProfile");

  const view = await getPublicBusinessProfile(slug);
  if (!view) notFound();
  const { profile, services, listings } = view;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      {/* Identity */}
      <header className="flex flex-col gap-3">
        <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
          {profile.displayName}
        </h1>
        {profile.tagline && (
          <p className="text-lg text-text-secondary">{profile.tagline}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
          {profile.country && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden className="h-4 w-4" /> {profile.country}
            </span>
          )}
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1.5 text-brand-blue hover:underline"
            >
              <Globe aria-hidden className="h-4 w-4" /> {t("website")}
            </a>
          )}
        </div>
      </header>

      {profile.description && (
        <section className="prose-sm">
          <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">
            {profile.description}
          </p>
        </section>
      )}

      {/* Contact (only fields the org explicitly marked public) */}
      {(profile.contactEmail || profile.contactPhone) && (
        <section className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-ink-800/10 p-4">
          <h2 className="font-display text-sm font-semibold text-text-primary">
            {t("contactTitle")}
          </h2>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {profile.contactEmail && (
              <a href={`mailto:${profile.contactEmail}`} className="inline-flex items-center gap-1.5 text-brand-blue hover:underline">
                <Mail aria-hidden className="h-4 w-4" /> {profile.contactEmail}
              </a>
            )}
            {profile.contactPhone && (
              <a href={`tel:${profile.contactPhone}`} className="inline-flex items-center gap-1.5 text-brand-blue hover:underline">
                <Phone aria-hidden className="h-4 w-4" /> {profile.contactPhone}
              </a>
            )}
          </div>
        </section>
      )}

      {/* Services (canonical service_offerings, active) */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <Store aria-hidden className="h-5 w-5 text-brand-blue" /> {t("servicesTitle")}
        </h2>
        {services.length === 0 ? (
          <p className="rounded-md border border-border-subtle bg-ink-800/10 p-3 text-sm text-text-muted">
            {t("servicesEmpty")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-1 p-3">
                <span className="font-medium text-text-primary">{s.title}</span>
                {s.description && <span className="line-clamp-3 text-sm text-text-secondary">{s.description}</span>}
                <span className="text-xs text-text-muted">
                  {s.remote ? t("remote") : s.locationCountry ?? ""}
                  {s.rateText ? ` · ${s.rateText}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Listings (canonical marketplace_listings, active) */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <Boxes aria-hidden className="h-5 w-5 text-brand-blue" /> {t("listingsTitle")}
        </h2>
        {listings.length === 0 ? (
          <p className="rounded-md border border-border-subtle bg-ink-800/10 p-3 text-sm text-text-muted">
            {t("listingsEmpty")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {listings.map((l) => (
              <li key={l.id} className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-1 p-3">
                <span className="font-medium text-text-primary">{l.title}</span>
                {l.description && <span className="line-clamp-2 text-sm text-text-secondary">{l.description}</span>}
                <span className="text-xs text-text-muted">
                  {t(`listingKinds.${l.listingKind}`)}
                  {l.locationLabel ? ` · ${l.locationLabel}` : ""}
                  {l.locationCountry ? ` (${l.locationCountry})` : ""}
                  {l.priceText ? ` · ${l.priceText}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="border-t border-border-subtle pt-4 text-center text-xs text-text-muted">
        {t("poweredBy")}
      </footer>
    </main>
  );
}
