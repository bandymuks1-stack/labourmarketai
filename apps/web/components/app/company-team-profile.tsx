import type { ReactNode } from "react";
import { LivingCvIdentityFrame } from "@/components/app/cv/premium-living-cv";
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
import {
  ORGANIZATION_LIVING_TABS,
  type CompanyTeamContactAction,
  type CompanyTeamListing,
  type CompanyTeamProfileView,
  type OrganizationLivingRecord,
  type OrganizationLivingTab,
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

/* ─────────────────────────────────────────────────────────────────────────────
 * THE ORGANIZATION'S LIVING CV — the member form of this view (owner P0
 * 2026-11-24), in the card language of the owner's Living CV reference
 * (docs/design/living-cv-reference-2026-11-24): an identity card, the header
 * beside it, a fact strip, two panels, and the blocks behind tabs, each with
 * its own address (decision 0034, one screen per block). Every value comes
 * from `OrganizationLivingRecord`; an element without data is absent. No
 * rating, no score, no helper text (decisions 0032, doctrine §19).
 * ──────────────────────────────────────────────────────────────────────────── */

const LIVING = `${TEAM}.living`;
const PROJECTS_SHOWN = 8;

const CAPABILITY_LABEL: Readonly<Record<string, string>> = {
  training_provider: "organizationCapabilities.choices.training.label",
  employer: "organizationCapabilities.choices.employer.label",
  workforce_provider: "organizationCapabilities.choices.workforce.label",
  recruitment_partner: "organizationCapabilities.choices.recruitment.label",
  project_operator: "organizationCapabilities.choices.project.label",
  client: "organizationCapabilities.choices.client.label",
};

const LEGAL_FORMS = new Set(["uab", "ab", "mb", "vši", "iį", "sp.", "sp", "z", "o.o.", "o.o", "gmbh", "ltd", "llc", "as", "oü", "sia", "bv", "ab."]);

/** Two letters for the card: the name's first words, legal forms left out. */
export function organizationMonogram(name: string): string {
  const words = name
    .replace(/[„“"'()]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !LEGAL_FORMS.has(w.toLowerCase()));
  const letters = words.slice(0, 2).map((w) => [...w][0] ?? "");
  return letters.join("").toUpperCase() || ([...name.trim()][0] ?? "").toUpperCase();
}

function numberFormatter(locale: string) {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return (n: number) => nf.format(n);
}

function spanText(span: OrganizationLivingRecord["span"]): string | null {
  if (!span) return null;
  return span.from === span.to ? String(span.from) : `${span.from}–${span.to}`;
}

function Panel({ title, testId, children }: { readonly title: string; readonly testId: string; readonly children: ReactNode }) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className="flex min-w-0 flex-col gap-4 rounded-card border border-ink-600 bg-ink-800/40 p-4 sm:p-5"
    >
      <h3 className="font-display text-card-title font-semibold text-text-primary">{title}</h3>
      {children}
    </section>
  );
}

/** The collectible identity card: gold frame, monogram, name, country, years. */
function IdentityCard({
  name,
  country,
  span,
  t,
}: {
  readonly name: string;
  readonly country: string | null;
  readonly span: string | null;
  readonly t: CompanyTeamTranslate;
}) {
  return (
    <LivingCvIdentityFrame testId="org-living-card">
    <div className="flex min-w-0 flex-col items-center gap-4 rounded-[20px] bg-ink-900 px-4 pb-5 pt-5 text-center">
      <Eyebrow className="text-brand-blue">{t(`${LIVING}.eyebrow`)}</Eyebrow>
      <span
        aria-hidden
        className="flex h-28 w-28 items-center justify-center rounded-full border border-brand-blue/60 bg-ink-800 font-display text-[2.6rem] font-bold tracking-[-0.04em] text-brand-blue"
      >
        {organizationMonogram(name)}
      </span>
      <p aria-hidden="true" className="font-display text-xl font-semibold leading-tight text-brand-blue [overflow-wrap:anywhere] lg:hidden">
        {name}
      </p>
      {country || span ? (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {country ? <Stamp className="text-text-secondary">{country}</Stamp> : null}
          {span ? <Stamp className="text-text-secondary">{span}</Stamp> : null}
        </div>
      ) : null}
    </div>
    </LivingCvIdentityFrame>
  );
}

/** The fact strip: the organization's headline figures, each from a real source. */
function FactStrip({
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
      className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-ink-600 bg-ink-600 sm:grid-cols-4"
    >
      {living.figures.map((f) => (
        <div key={f.key} className="flex min-w-0 flex-col gap-1 bg-ink-800 px-4 py-3.5" data-figure={f.key}>
          <dd className="whitespace-nowrap font-display text-[clamp(1.5rem,5.5vw,2.1rem)] font-bold leading-none tracking-[-0.03em] text-text-primary [font-feature-settings:'tnum']">
            {num(f.value)}
          </dd>
          <dt className="text-meta text-text-muted">{t(`${LIVING}.figures.${f.key}`, { count: f.value })}</dt>
        </div>
      ))}
    </dl>
  );
}

/** Confirmed share of the journal's hours, as a ring; the organization's own records beside it, never in it. */
function ConfirmedRing({ share, label }: { readonly share: number; readonly label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 84 84" role="img" aria-label={label} className="h-20 w-20 shrink-0" data-testid="org-living-ring">
      <circle cx="42" cy="42" r={r} fill="none" strokeWidth="8" className="stroke-ink-600" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(share / 100) * c} ${c}`}
        transform="rotate(-90 42 42)"
        className="stroke-state-success"
      />
      <text x="42" y="47" textAnchor="middle" className="fill-text-primary font-display text-sm font-bold">
        {share}%
      </text>
    </svg>
  );
}

function ExperienceSummary({
  living,
  t,
  hours,
}: {
  readonly living: OrganizationLivingRecord;
  readonly t: CompanyTeamTranslate;
  readonly hours: (n: number) => string;
}) {
  const exp = living.experience;
  if (!exp) return null;
  const journal =
    exp.confirmedHours !== null && exp.pendingHours !== null ? exp.confirmedHours + exp.pendingHours : 0;
  const share = journal > 0 ? Math.round((exp.confirmedHours! / journal) * 100) : null;
  const all: { key: string; level: "confirmed" | "recorded" | "declared"; label: string; value: number | null }[] = [
    { key: "confirmed", level: "confirmed", label: t(`${LIVING}.confirmedLabel`), value: exp.confirmedHours },
    { key: "pending", level: "declared", label: t(`${LIVING}.pendingLabel`), value: exp.pendingHours },
    { key: "recorded", level: "recorded", label: t(`${LIVING}.recordedLabel`), value: exp.recordedHours },
  ];
  // An unread source shows no row at all, never "0 h".
  const rows = all.filter((r): r is typeof r & { value: number } => r.value !== null && r.value > 0);
  return (
    <Panel title={t(`${LIVING}.experienceTitle`)} testId="org-living-summary">
      <div className="flex min-w-0 items-center gap-4">
        {share !== null ? <ConfirmedRing share={share} label={t(`${LIVING}.ringLabel`, { share })} /> : null}
        <ul className="flex min-w-0 flex-1 flex-col gap-2">
          {rows.map((r) => (
            <li key={r.key} className="flex min-w-0 items-center justify-between gap-3 text-support" data-row={r.key}>
              <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                <LevelMark level={r.level} />
                <span className="[overflow-wrap:anywhere]">{r.label}</span>
              </span>
              <span className="whitespace-nowrap font-semibold text-text-primary [font-feature-settings:'tnum']">
                {hours(r.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function Competencies({
  living,
  t,
}: {
  readonly living: OrganizationLivingRecord;
  readonly t: CompanyTeamTranslate;
}) {
  const skills = (living.skills ?? [])
    .map((s) => ({ ...s, label: t.has(`skillNames.${s.slug}`) ? t(`skillNames.${s.slug}`) : null }))
    .filter((s): s is typeof s & { label: string } => s.label !== null);
  if (living.capabilities.length === 0 && skills.length === 0 && living.rosterSize === null) return null;
  return (
    <Panel title={t(`${LIVING}.doTitle`)} testId="org-living-work">
      {living.capabilities.length > 0 ? (
        <ul className="flex flex-wrap gap-2" data-testid="org-living-capabilities">
          {living.capabilities.map((slug) => (
            <li
              key={slug}
              className="min-w-0 rounded-full border border-brand-blue/40 bg-brand-blue/10 px-3 py-1 text-support text-text-primary [overflow-wrap:anywhere]"
            >
              {t(CAPABILITY_LABEL[slug] ?? slug)}
            </li>
          ))}
        </ul>
      ) : null}
      {skills.length > 0 ? (
        <ul className="flex flex-wrap gap-2" data-testid="org-living-skills">
          {skills.map((s) => (
            <li
              key={s.slug}
              data-confirmed={s.confirmed ? "true" : "false"}
              className="flex min-w-0 items-center gap-2 rounded-full border border-ink-500 px-3 py-1 text-support text-text-primary [overflow-wrap:anywhere]"
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
    </Panel>
  );
}

type LivingProject = NonNullable<OrganizationLivingRecord["projects"]>["running"][number];

function ProjectCard({ project, status, t }: { readonly project: LivingProject; readonly status: "running" | "completed"; readonly t: CompanyTeamTranslate }) {
  return (
    <li className="min-w-0">
      <Card compact className="flex h-full flex-col gap-1.5">
        <Stamp>{t(`${LIVING}.${status}`)}</Stamp>
        <span className="font-display text-card-title font-semibold leading-snug text-text-primary [overflow-wrap:anywhere]">
          {project.title}
        </span>
        {project.city ? <span className="text-meta text-text-muted">{project.city}</span> : null}
      </Card>
    </li>
  );
}

function Gallery({
  photos,
  more,
  testId,
}: {
  readonly photos: OrganizationLivingRecord["gallery"];
  readonly more?: { readonly count: number; readonly href: string; readonly label: string };
  readonly testId: string;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid={testId}>
      {photos.map((m, i) => {
        const overlay = more && i === photos.length - 1 && more.count > 0;
        return (
          <li key={m.id} className="relative min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */}
            <img
              src={m.url}
              alt={m.caption ?? ""}
              loading="lazy"
              className="aspect-square w-full rounded-card border border-ink-600 object-cover"
            />
            {overlay ? (
              <a
                href={more.href}
                aria-label={more.label}
                className="absolute inset-0 flex items-center justify-center rounded-card bg-ink-900/70 font-display text-xl font-bold text-text-primary"
              >
                +{more.count}
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function LivingTabs({
  tab,
  tabHref,
  available,
  t,
}: {
  readonly tab: OrganizationLivingTab;
  readonly tabHref: Readonly<Record<OrganizationLivingTab, string>>;
  readonly available: readonly OrganizationLivingTab[];
  readonly t: CompanyTeamTranslate;
}) {
  return (
    // A segmented control that fits a 375 px screen: three to a row on a
    // phone, one row from `sm`; it never scrolls sideways (decision 0034).
    <nav aria-label={t(`${LIVING}.eyebrow`)} data-testid="org-living-tabs">
      <ul className="grid grid-cols-3 gap-1 rounded-card border border-ink-600 bg-ink-800/40 p-1 sm:flex sm:w-max sm:max-w-full sm:flex-wrap">
        {available.map((key) => (
          <li key={key} className="min-w-0">
            <a
              href={tabHref[key]}
              aria-current={key === tab ? "page" : undefined}
              data-tab={key}
              className={
                key === tab
                  ? "flex min-h-11 items-center justify-center rounded-[0.6rem] bg-brand-blue/15 px-3 text-center text-support font-semibold text-text-primary [overflow-wrap:anywhere]"
                  : "flex min-h-11 items-center justify-center rounded-[0.6rem] px-3 text-center text-support text-text-secondary [overflow-wrap:anywhere] hover:text-text-primary"
              }
            >
              {t(`${LIVING}.tabs.${key}`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** On every block but the Overview: who this is, in one line, above the tabs. */
function CompactIdentity({ name, t }: { readonly name: string; readonly t: CompanyTeamTranslate }) {
  return (
    <div className="flex min-w-0 items-center gap-3" data-testid="company-team-hero">
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-brand-blue/70 bg-ink-900 font-display text-base font-bold text-brand-blue"
      >
        {organizationMonogram(name)}
      </span>
      <div className="flex min-w-0 flex-col">
        <Eyebrow className="text-brand-blue">{t(`${LIVING}.eyebrow`)}</Eyebrow>
        <h2 className="font-display text-card-title font-semibold text-text-primary [overflow-wrap:anywhere]">{name}</h2>
      </div>
    </div>
  );
}

function OrganizationLivingCv({
  view,
  living,
  t,
  locale,
  tab: requested,
  tabHref,
  history,
}: {
  readonly view: CompanyTeamProfileView;
  readonly living: OrganizationLivingRecord;
  readonly t: CompanyTeamTranslate;
  readonly history?: ReactNode;
  readonly locale: string;
  readonly tab: OrganizationLivingTab;
  readonly tabHref: Readonly<Record<OrganizationLivingTab, string>>;
}) {
  const num = numberFormatter(locale);
  const hours = (n: number) => t(`${LIVING}.hours`, { hours: num(n) });
  const { hero, about } = view;
  const projects = living.projects;
  const allProjects = projects
    ? [
        ...projects.running.map((p) => ({ p, status: "running" as const })),
        ...projects.completed.map((p) => ({ p, status: "completed" as const })),
      ]
    : [];
  const skills = (living.skills ?? [])
    .map((s) => ({ ...s, label: t.has(`skillNames.${s.slug}`) ? t(`skillNames.${s.slug}`) : null }))
    .filter((s): s is typeof s & { label: string } => s.label !== null);
  const exp = living.experience;
  const has: Record<OrganizationLivingTab, boolean> = {
    overview: true,
    projects: allProjects.length > 0,
    experience: living.historyDetail !== null || exp !== null || living.places !== null || living.clients.length > 0,
    gallery: living.gallery.length > 0,
    team: living.rosterSize !== null || living.peopleWorked !== null || skills.length > 0,
  };
  const available = ORGANIZATION_LIVING_TABS.filter((k) => has[k]);
  const tab = has[requested] ? requested : "overview";
  const teamFigures = [
    living.rosterSize !== null ? { key: "team" as const, value: living.rosterSize } : null,
    living.peopleWorked !== null ? { key: "people" as const, value: living.peopleWorked } : null,
  ].filter((f): f is { key: "team" | "people"; value: number } => f !== null);

  return (
    <section data-testid="org-living-cv" aria-label={hero.name} className="flex w-full min-w-0 flex-col gap-6">
      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-start" data-testid="org-living-tab-overview">
          <IdentityCard name={hero.name} country={hero.country} span={spanText(living.span)} t={t} />
          <div className="flex min-w-0 flex-col gap-5">
            <header className="flex min-w-0 flex-col gap-2" data-testid="company-team-hero">
              <h2 className="font-display text-[clamp(1.9rem,6vw,3.25rem)] font-bold leading-[1] tracking-[-0.035em] text-text-primary [overflow-wrap:anywhere] max-lg:sr-only">
                {hero.name}
              </h2>
              {hero.tagline ? (
                <p className="max-w-[48ch] text-body leading-snug text-text-secondary [overflow-wrap:anywhere]">{hero.tagline}</p>
              ) : null}
              {about ? (
                <p className="line-clamp-3 max-w-[68ch] text-support leading-relaxed text-text-secondary [overflow-wrap:anywhere]">
                  {about}
                </p>
              ) : null}
            </header>
            <FactStrip living={living} t={t} num={num} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Competencies living={living} t={t} />
              <ExperienceSummary living={living} t={t} hours={hours} />
            </div>
          </div>
        </div>
      ) : (
        <CompactIdentity name={hero.name} t={t} />
      )}

      <LivingTabs tab={tab} tabHref={tabHref} available={available} t={t} />

      {tab === "projects" ? (
        <div className="flex min-w-0 flex-col" data-testid="org-living-tab-projects">
          <Reveal
            items={allProjects.map(({ p, status }) => (
              <ProjectCard key={p.id} project={p} status={status} t={t} />
            ))}
            limit={PROJECTS_SHOWN}
            showAllLabel={t("common.disclosure.showAll", { count: allProjects.length })}
            listAs="ul"
            className="gap-3"
            listClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          />
        </div>
      ) : null}

      {tab === "experience" ? (
        <div className="flex min-w-0 flex-col gap-5" data-testid="org-living-tab-experience">
          {exp && (exp.confirmedHours !== null || (!history && exp.recordedHours !== null)) ? (
            <Card>
              <FigurePair testId="org-living-experience-pair">
                {exp.confirmedHours !== null ? (
                  <Figure
                    label={t(`${LIVING}.confirmedLabel`)}
                    value={hours(exp.confirmedHours)}
                    sub={exp.pendingHours ? t(`${LIVING}.pending`, { hours: hours(exp.pendingHours) }) : null}
                    source={t(`${LIVING}.confirmedSource`)}
                    level="confirmed"
                    testId="org-living-confirmed"
                  />
                ) : null}
                {!history && exp.recordedHours !== null ? (
                  <Figure
                    label={t(`${LIVING}.recordedLabel`)}
                    value={hours(exp.recordedHours)}
                    source={t(`${LIVING}.recordedSource`)}
                    level="recorded"
                    testId="org-living-recorded"
                  />
                ) : null}
              </FigurePair>
            </Card>
          ) : null}
          {history}
          {!history && living.places !== null ? (
            <p className="text-support text-text-secondary" data-testid="org-living-places">
              <span className="font-semibold text-text-primary [font-feature-settings:'tnum']">{num(living.places)}</span>{" "}
              {t(`${LIVING}.figures.places`, { count: living.places })}
            </p>
          ) : null}
          {living.clients.length > 0 ? (
            <p className="text-support text-text-secondary [overflow-wrap:anywhere]" data-testid="org-living-clients">
              {living.clientsMore > 0
                ? t(`${LIVING}.clientsMore`, { names: living.clients.join(", "), count: living.clientsMore })
                : t(`${LIVING}.clients`, { names: living.clients.join(", ") })}
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "gallery" ? (
        <div className="flex min-w-0 flex-col" data-testid="org-living-tab-gallery">
          <Gallery photos={living.gallery} testId="org-living-gallery" />
        </div>
      ) : null}

      {tab === "team" ? (
        <div className="flex min-w-0 flex-col gap-5" data-testid="org-living-tab-team">
          {teamFigures.length > 0 ? (
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-ink-600 bg-ink-600 sm:max-w-md" data-testid="org-living-team-figures">
              {teamFigures.map((f) => (
                <div key={f.key} className="flex min-w-0 flex-col gap-1 bg-ink-800 px-4 py-3.5" data-figure={f.key}>
                  <dd className="whitespace-nowrap font-display text-[clamp(1.5rem,5.5vw,2.1rem)] font-bold leading-none tracking-[-0.03em] text-text-primary [font-feature-settings:'tnum']">
                    {num(f.value)}
                  </dd>
                  <dt className="text-meta text-text-muted">{t(`${LIVING}.figures.${f.key}`, { count: f.value })}</dt>
                </div>
              ))}
            </dl>
          ) : null}
          {skills.length > 0 ? (
            <ul className="flex flex-wrap gap-2" data-testid="org-living-team-skills">
              {skills.map((s) => (
                <li
                  key={s.slug}
                  data-confirmed={s.confirmed ? "true" : "false"}
                  className="flex min-w-0 items-center gap-2 rounded-full border border-ink-500 px-3 py-1 text-support text-text-primary [overflow-wrap:anywhere]"
                >
                  <LevelMark level={s.confirmed ? "confirmed" : "declared"} />
                  {s.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function CompanyTeamProfile({
  view,
  t,
  member,
}: {
  readonly view: CompanyTeamProfileView;
  readonly t: CompanyTeamTranslate;
  /** The member form (the organization's Living CV): which block, and each block's address. */
  readonly member?: {
    readonly locale: string;
    readonly tab: OrganizationLivingTab;
    readonly tabHref: Readonly<Record<OrganizationLivingTab, string>>;
    readonly history?: ReactNode;
  };
}) {
  if (view.living && member) {
    return <OrganizationLivingCv view={view} living={view.living} t={t} {...member} />;
  }
  const { hero, about, offers, seeking, contact } = view;
  const reachable = contact.length > 0;
  const contactTitle = t(`${TEAM}.contactTitle`);
  const aboutTitle = t(`${TEAM}.aboutTitle`);

  return (
    <main data-testid="company-team-profile" className="flex w-full flex-col">
      {/* Type only: no public read returns a cover image yet. */}
      <header className="border-b-2 border-text-primary" data-testid="company-team-hero">
        <div className="mx-auto flex w-full max-w-content flex-col gap-5 px-4 pb-8 pt-12 sm:px-6 sm:pb-12 sm:pt-20">
          <Eyebrow>{t(`${TEAM}.eyebrow`)}</Eyebrow>
          <h1 className="font-display text-[clamp(2.75rem,11vw,6.5rem)] font-bold uppercase leading-[0.95] tracking-[-0.04em] text-text-primary [overflow-wrap:anywhere]">
            {hero.name}
          </h1>
          {hero.tagline ? (
            <p className="max-w-[40ch] text-[clamp(1.15rem,2.4vw,1.6rem)] leading-snug text-text-secondary">
              {hero.tagline}
            </p>
          ) : null}
          {hero.country || reachable ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {reachable ? (
                <a href="#company-team-contact" className={buttonLinkClassName("primary")}>
                  {t(`${TEAM}.heroContact`)}
                </a>
              ) : null}
              {hero.country ? <Stamp>{hero.country}</Stamp> : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-content flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
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
      </div>
    </main>
  );
}

/** The way in from the organization's Settings: the card's face, one tap to the Living CV. */
export function OrganizationLivingEntry({
  name,
  href,
  t,
}: {
  readonly name: string;
  readonly href: string;
  readonly t: CompanyTeamTranslate;
}) {
  return (
    <a
      href={href}
      data-testid="org-living-entry"
      className="group flex min-w-0 items-center gap-4 rounded-card border-2 border-brand-blue/70 bg-gradient-to-r from-ink-700 to-ink-900 px-4 py-3 transition-colors hover:border-brand-blue"
    >
      <span
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-brand-blue/70 bg-ink-900 font-display text-lg font-bold text-brand-blue"
      >
        {organizationMonogram(name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <Eyebrow className="text-brand-blue">{t(`${LIVING}.eyebrow`)}</Eyebrow>
        <span className="font-display text-card-title font-semibold text-text-primary [overflow-wrap:anywhere]">{name}</span>
      </span>
      <span className="sr-only">{t(`${LIVING}.open`)}</span>
      <span aria-hidden className="text-xl text-brand-blue transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </a>
  );
}
