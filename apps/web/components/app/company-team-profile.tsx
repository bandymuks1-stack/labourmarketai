import type { ReactNode } from "react";
import { Globe, Mail, Phone } from "lucide-react";

import {
  Eyebrow,
  Figure,
  FigurePair,
  LevelMark,
  RegionHead,
  Reveal,
  Stamp,
} from "@/components/app/premium/grammar";
import { buttonLinkClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type {
  CompanyTeamContactAction,
  CompanyTeamListing,
  CompanyTeamProfileView,
  OrganizationLivingRecord,
} from "@/lib/company/team-profile-model";

/**
 * The team-presentation form of the public company profile, opened only by
 * `?view=team`. The visual direction awaits the owner's verdict, so this stays
 * on the existing tokens, Card, Button and grammar, and the default page does
 * not link here.
 *
 * Every region renders from `CompanyTeamProfileView` and disappears when it has
 * nothing. The model's later slots are deliberately not read: they have no
 * public source yet, and an empty slot shows nothing, never a placeholder number.
 */

/** The root translator: the page passes next-intl's, a test its own catalog's. */
export type CompanyTeamTranslate = {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
};

const TEAM = "businessProfile.team";
const LISTINGS_SHOWN = 6;

const ACTION_COPY = {
  email: { label: `${TEAM}.actionEmail`, Icon: Mail },
  phone: { label: `${TEAM}.actionPhone`, Icon: Phone },
  website: { label: `${TEAM}.actionWebsite`, Icon: Globe },
} as const;

function Region({
  label,
  head,
  children,
  id,
  testId,
}: {
  readonly label: string;
  readonly head: ReactNode;
  readonly children: ReactNode;
  readonly id?: string;
  readonly testId: string;
}) {
  return (
    <section
      id={id}
      aria-label={label}
      data-testid={testId}
      className="grid scroll-mt-6 grid-cols-1 gap-5 border-t border-ink-600/70 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-10"
    >
      {head}
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ListingCard({ listing, t }: { readonly listing: CompanyTeamListing; readonly t: CompanyTeamTranslate }) {
  const categoryKey = `marketplaceListings.categories.${listing.category}`;
  const facts = [listing.place, listing.priceText].filter(Boolean).join(" · ");
  return (
    <li className="min-w-0">
      <Card compact className="flex h-full flex-col gap-2">
        <Stamp>
          {t(`businessProfile.listingKinds.${listing.kind}`)}
          {t.has(categoryKey) ? ` · ${t(categoryKey)}` : ""}
        </Stamp>
        <h3 className="font-display text-card-title font-semibold leading-snug text-text-primary [overflow-wrap:anywhere]">
          {listing.title}
        </h3>
        {listing.description ? (
          <p className="line-clamp-3 text-support leading-snug text-text-secondary">{listing.description}</p>
        ) : null}
        {facts ? <p className="text-meta text-text-muted">{facts}</p> : null}
      </Card>
    </li>
  );
}

function ListingRegion({
  listings,
  region,
  sub,
  t,
}: {
  readonly listings: readonly CompanyTeamListing[];
  readonly region: "offers" | "seeking";
  readonly sub?: string;
  readonly t: CompanyTeamTranslate;
}) {
  if (listings.length === 0) return null;
  const title = t(`${TEAM}.${region}Title`);
  return (
    <Region
      label={title}
      testId={`company-team-${region}`}
      head={<RegionHead eyebrow={t(`${TEAM}.${region}Eyebrow`)} title={title} sub={sub} />}
    >
      <Reveal
        items={listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} t={t} />
        ))}
        limit={LISTINGS_SHOWN}
        showAllLabel={t("common.disclosure.showAll", { count: listings.length })}
        listAs="ul"
        className="gap-3"
        listClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"
      />
    </Region>
  );
}

function ContactAction({
  action,
  primary,
  t,
}: {
  readonly action: CompanyTeamContactAction;
  readonly primary: boolean;
  readonly t: CompanyTeamTranslate;
}) {
  const { label, Icon } = ACTION_COPY[action.kind];
  const external = action.kind === "website";
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-contact-kind={action.kind}>
      <a
        href={action.href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer nofollow" : undefined}
        className={`${buttonLinkClassName(primary ? "primary" : "secondary")} w-full sm:w-auto`}
      >
        <Icon aria-hidden className="h-4 w-4" />
        {t(label)}
      </a>
      <span className="text-center text-support text-text-secondary [overflow-wrap:anywhere] sm:text-left">
        {action.value}
      </span>
    </div>
  );
}

const LIVING = `${TEAM}.living`;
const PROJECTS_SHOWN = 6;

const CAPABILITY_LABEL: Readonly<Record<string, string>> = {
  training_provider: "organizationCapabilities.choices.training.label",
  employer: "organizationCapabilities.choices.employer.label",
  workforce_provider: "organizationCapabilities.choices.workforce.label",
  recruitment_partner: "organizationCapabilities.choices.recruitment.label",
  project_operator: "organizationCapabilities.choices.project.label",
  client: "organizationCapabilities.choices.client.label",
};

function numberFormatter(locale: string) {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return (n: number) => nf.format(n);
}

/** The player-card band: the organization's headline figures, each from a real source. */
function LivingFigures({
  living,
  t,
  num,
}: {
  readonly living: OrganizationLivingRecord;
  readonly t: CompanyTeamTranslate;
  readonly num: (n: number) => string;
}) {
  if (living.figures.length === 0) return null;
  return (
    <dl
      data-testid="org-living-figures"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-ink-600 bg-ink-600 sm:grid-cols-3 lg:grid-cols-5"
    >
      {living.figures.map((f) => (
        <div key={f.key} className="flex min-w-0 flex-col gap-1 bg-surface-1 px-4 py-4 sm:px-5" data-figure={f.key}>
          <dd className="whitespace-nowrap font-display text-[clamp(1.9rem,7vw,2.75rem)] font-bold leading-none tracking-[-0.03em] text-text-primary [font-feature-settings:'tnum']">
            {num(f.value)}
          </dd>
          <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t(`${LIVING}.figures.${f.key}`, { count: f.value })}
          </dt>
        </div>
      ))}
    </dl>
  );
}

function LivingRegions({
  living,
  t,
  locale,
}: {
  readonly living: OrganizationLivingRecord;
  readonly t: CompanyTeamTranslate;
  readonly locale: string;
}) {
  const num = numberFormatter(locale);
  const hours = (n: number) => t(`${LIVING}.hours`, { hours: num(n) });
  const skillLabel = (slug: string) => (t.has(`skillNames.${slug}`) ? t(`skillNames.${slug}`) : null);
  const skills = (living.skills ?? [])
    .map((s) => ({ ...s, label: skillLabel(s.slug) }))
    .filter((s): s is typeof s & { label: string } => s.label !== null);
  const hasWork = living.capabilities.length > 0 || skills.length > 0 || living.rosterSize !== null;
  const exp = living.experience;
  const doTitle = t(`${LIVING}.doTitle`);
  const expTitle = t(`${LIVING}.experienceTitle`);
  const projTitle = t(`${LIVING}.projectsTitle`);
  const galleryTitle = t(`${LIVING}.galleryTitle`);

  return (
    <>
      <LivingFigures living={living} t={t} num={num} />

      {hasWork ? (
        <Region
          label={doTitle}
          testId="org-living-work"
          head={<RegionHead eyebrow={t(`${LIVING}.doEyebrow`)} title={doTitle} />}
        >
          <div className="flex flex-col gap-4">
            {living.capabilities.length > 0 ? (
              <ul className="flex flex-wrap gap-2" data-testid="org-living-capabilities">
                {living.capabilities.map((slug) => (
                  <li key={slug} className="min-w-0">
                    <Stamp>{t(CAPABILITY_LABEL[slug] ?? slug)}</Stamp>
                  </li>
                ))}
              </ul>
            ) : null}
            {skills.length > 0 ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-2" data-testid="org-living-skills">
                {skills.map((s) => (
                  <li
                    key={s.slug}
                    className="flex min-w-0 items-center gap-2 text-body text-text-primary [overflow-wrap:anywhere]"
                    data-confirmed={s.confirmed ? "true" : "false"}
                  >
                    <LevelMark level={s.confirmed ? "confirmed" : "declared"} />
                    {s.label}
                  </li>
                ))}
              </ul>
            ) : null}
            {living.rosterSize !== null ? (
              <p className="text-support text-text-secondary" data-testid="org-living-team">
                {t(`${LIVING}.team`, { count: living.rosterSize })}
              </p>
            ) : null}
          </div>
        </Region>
      ) : null}

      {exp ? (
        <Region
          label={expTitle}
          testId="org-living-experience"
          head={<RegionHead eyebrow={t(`${LIVING}.experienceEyebrow`)} title={expTitle} />}
        >
          <Card>
            <FigurePair testId="org-living-experience-pair">
              <Figure
                label={t(`${LIVING}.confirmedLabel`)}
                value={hours(exp.confirmedHours)}
                sub={exp.pendingHours > 0 ? t(`${LIVING}.pending`, { hours: hours(exp.pendingHours) }) : null}
                source={t(`${LIVING}.confirmedSource`)}
                level="confirmed"
                testId="org-living-confirmed"
              />
              <Figure
                label={t(`${LIVING}.recordedLabel`)}
                value={hours(exp.recordedHours)}
                sub={
                  exp.recordedPeriodHours > 0
                    ? t(`${LIVING}.periods`, { hours: hours(exp.recordedPeriodHours) })
                    : null
                }
                source={t(`${LIVING}.recordedSource`)}
                level="recorded"
                testId="org-living-recorded"
              />
            </FigurePair>
          </Card>
        </Region>
      ) : null}

      {living.projects && (living.projects.running.length > 0 || living.projects.completed.length > 0) ? (
        <Region
          label={projTitle}
          testId="org-living-projects"
          head={<RegionHead eyebrow={t(`${LIVING}.projectsEyebrow`)} title={projTitle} />}
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {(["running", "completed"] as const).map((group) =>
              living.projects![group].length > 0 ? (
                <div key={group} className="flex min-w-0 flex-col gap-3" data-testid={`org-living-projects-${group}`}>
                  <Eyebrow>{t(`${LIVING}.${group}`)}</Eyebrow>
                  <Reveal
                    items={living.projects![group].map((p) => (
                      <li key={p.id} className="min-w-0">
                        <Card compact className="flex flex-col gap-1">
                          <span className="font-display text-card-title font-semibold leading-snug text-text-primary [overflow-wrap:anywhere]">
                            {p.title}
                          </span>
                          {p.city ? <span className="text-meta text-text-muted">{p.city}</span> : null}
                        </Card>
                      </li>
                    ))}
                    limit={PROJECTS_SHOWN}
                    showAllLabel={t("common.disclosure.showAll", { count: living.projects![group].length })}
                    listAs="ul"
                    className="gap-2"
                    listClassName="grid grid-cols-1 gap-2"
                  />
                </div>
              ) : null,
            )}
          </div>
        </Region>
      ) : null}

      {living.gallery.length > 0 ? (
        <Region
          label={galleryTitle}
          testId="org-living-gallery"
          head={<RegionHead eyebrow={t(`${LIVING}.galleryEyebrow`)} title={galleryTitle} />}
        >
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {living.gallery.map((m) => (
              <li key={m.id} className="min-w-0">
                <figure className="flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                  <img
                    src={m.url}
                    alt={m.caption ?? ""}
                    loading="lazy"
                    className="aspect-square w-full rounded-card border border-ink-600 object-cover"
                  />
                  {m.caption ? (
                    <figcaption className="line-clamp-2 text-meta text-text-muted [overflow-wrap:anywhere]">
                      {m.caption}
                    </figcaption>
                  ) : null}
                </figure>
              </li>
            ))}
          </ul>
        </Region>
      ) : null}

      {living.clients.length > 0 ? (
        <p className="border-t border-ink-600/70 pt-4 text-support text-text-secondary [overflow-wrap:anywhere]" data-testid="org-living-clients">
          {t(`${LIVING}.clients`, { names: living.clients.join(", ") })}
        </p>
      ) : null}
    </>
  );
}

export function CompanyTeamProfile({
  view,
  t,
  locale = "lt",
}: {
  readonly view: CompanyTeamProfileView;
  readonly t: CompanyTeamTranslate;
  /** Number formatting for the member form's figures. */
  readonly locale?: string;
}) {
  const { hero, about, offers, seeking, contact, living } = view;
  const reachable = contact.length > 0;
  const contactTitle = t(`${TEAM}.contactTitle`);
  const aboutTitle = t(`${TEAM}.aboutTitle`);
  // The member form sits inside the signed-in page: a section, its own h2,
  // no public ways in (listings, contact) and no public footer.
  const member = living !== undefined;
  const Root = member ? "section" : "main";
  const Name = member ? "h2" : "h1";

  return (
    <Root
      data-testid={member ? "org-living-cv" : "company-team-profile"}
      aria-label={member ? hero.name : undefined}
      className="flex w-full min-w-0 flex-col"
    >
      {/* Type only: no public read returns a cover image yet. */}
      <header className="border-b-2 border-text-primary" data-testid="company-team-hero">
        <div
          className={
            member
              ? "flex w-full min-w-0 flex-col gap-4 pb-6 pt-2 sm:pb-8"
              : "mx-auto flex w-full max-w-content flex-col gap-5 px-4 pb-8 pt-12 sm:px-6 sm:pb-12 sm:pt-20"
          }
        >
          <Eyebrow>{t(member ? `${LIVING}.eyebrow` : `${TEAM}.eyebrow`)}</Eyebrow>
          <Name
            className={
              member
                ? "font-display text-[clamp(2.1rem,8vw,4.5rem)] font-bold uppercase leading-[0.95] tracking-[-0.04em] text-text-primary [overflow-wrap:anywhere]"
                : "font-display text-[clamp(2.75rem,11vw,6.5rem)] font-bold uppercase leading-[0.95] tracking-[-0.04em] text-text-primary [overflow-wrap:anywhere]"
            }
          >
            {hero.name}
          </Name>
          {hero.tagline ? (
            <p className="max-w-[40ch] text-[clamp(1.15rem,2.4vw,1.6rem)] leading-snug text-text-secondary">
              {hero.tagline}
            </p>
          ) : null}
          {hero.country || reachable || living?.span ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {reachable && !member ? (
                <a href="#company-team-contact" className={buttonLinkClassName("primary")}>
                  {t(`${TEAM}.heroContact`)}
                </a>
              ) : null}
              {hero.country ? <Stamp>{hero.country}</Stamp> : null}
              {living?.span ? (
                <Stamp>
                  {living.span.from === living.span.to
                    ? String(living.span.from)
                    : `${living.span.from}–${living.span.to}`}
                </Stamp>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div
        className={
          member
            ? "flex w-full min-w-0 flex-col gap-8 pt-6"
            : "mx-auto flex w-full max-w-content flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14"
        }
      >
        {about ? (
          <Region
            label={aboutTitle}
            testId="company-team-about"
            head={<RegionHead eyebrow={t(`${TEAM}.aboutEyebrow`)} title={aboutTitle} />}
          >
            <p className="max-w-[62ch] whitespace-pre-line text-body leading-relaxed text-text-secondary [overflow-wrap:anywhere]">
              {about}
            </p>
          </Region>
        ) : null}

        {living ? <LivingRegions living={living} t={t} locale={locale} /> : null}

        {member ? null : (
          <>
            <ListingRegion listings={offers} region="offers" t={t} />
            <ListingRegion listings={seeking} region="seeking" sub={t(`${TEAM}.seekingSub`)} t={t} />

            <Region
              id="company-team-contact"
              label={contactTitle}
              testId="company-team-contact"
              head={<RegionHead eyebrow={t(`${TEAM}.contactEyebrow`)} title={contactTitle} />}
            >
              <Card className="flex flex-col gap-4">
                {reachable ? (
                  <>
                    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
                      {contact.map((action, index) => (
                        <ContactAction key={action.kind} action={action} primary={index === 0} t={t} />
                      ))}
                    </div>
                    <p className="text-support leading-snug text-text-muted">{t(`${TEAM}.contactNote`)}</p>
                  </>
                ) : (
                  <p className="text-body leading-snug text-text-secondary" data-testid="company-team-no-contact">
                    {t(`${TEAM}.contactNone`)}
                  </p>
                )}
              </Card>
            </Region>

            <footer className="flex flex-col gap-1.5 border-t border-ink-600/70 pt-4 text-meta text-text-muted">
              <span className="flex items-center gap-2">
                <LevelMark level="declared" />
                {t(`${TEAM}.provenance`)}
              </span>
              <span>{t("businessProfile.poweredBy")}</span>
            </footer>
          </>
        )}
      </div>
    </Root>
  );
}
