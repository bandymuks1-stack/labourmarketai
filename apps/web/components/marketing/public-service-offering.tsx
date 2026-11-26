import { Link } from "@/lib/i18n/navigation";
import { countryDisplayName } from "@/lib/location/country-model";
import type { PublicServiceOffering } from "@/lib/services/public-service-offerings-shared";

/** Only the explicit public projection reaches this server component. */
export function PublicServiceOfferingCard({
  offering,
  remoteLabel,
  locale,
}: {
  offering: PublicServiceOffering;
  remoteLabel: string;
  locale: string;
}) {
  const country = offering.locationCountry ? countryDisplayName(offering.locationCountry, locale) : null;
  const facts = [offering.categorySlug, country, offering.remote ? remoteLabel : null];
  return (
    <li className="min-w-0 border-b border-ink-500 py-4" data-testid="public-service-result">
      <h2 className="font-display text-lg font-semibold text-text-primary">
        <Link
          href={"/services/" + offering.id}
          className="inline-flex min-h-11 items-center break-words rounded-sm hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          {offering.title}
        </Link>
      </h2>
      {offering.description ? (
        <p className="mt-1 line-clamp-2 break-words text-sm leading-relaxed text-text-secondary">{offering.description}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        {facts.filter(Boolean).map((fact, index) => <span key={index}>{fact}</span>)}
        {offering.rateText ? <span className="text-text-secondary">{offering.rateText}</span> : null}
      </div>
    </li>
  );
}
