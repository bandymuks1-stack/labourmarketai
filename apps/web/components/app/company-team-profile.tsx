import type { ReactNode } from "react";
import { Globe, Mail, Phone } from "lucide-react";

import { Eyebrow, LevelMark, RegionHead, Reveal, Stamp } from "@/components/app/premium/grammar";
import { buttonLinkClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type {
  CompanyTeamContactAction,
  CompanyTeamListing,
  CompanyTeamProfileView,
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

export function CompanyTeamProfile({
  view,
  t,
}: {
  readonly view: CompanyTeamProfileView;
  readonly t: CompanyTeamTranslate;
}) {
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
