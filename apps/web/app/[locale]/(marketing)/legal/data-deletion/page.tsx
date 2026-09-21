import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    locale,
    path: "/legal/data-deletion",
    title: "Account and data deletion",
    description:
      "How to request deletion of your LabourMarket.ai account and personal data.",
  });
}

export default async function DataDeletionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <article
      className="mx-auto max-w-3xl px-6 py-16 sm:px-12"
      data-testid="legal-data-deletion"
    >
      <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
        Account and data deletion
      </h1>

      <p className="mt-6 text-sm leading-relaxed text-text-secondary">
        You can ask LabourMarket.ai to delete your account and personal data. Deletion is
        currently handled as a request reviewed by a person; there is no instant account
        deletion button.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold text-text-primary">
          How to request deletion
        </h2>
        <ol className="mt-4 list-decimal space-y-3 pl-6 text-sm leading-relaxed text-text-secondary">
          <li>
            Email{" "}
            <a
              href="mailto:info@labourmarket.ai?subject=Account%20and%20data%20deletion%20request"
              className="underline underline-offset-4 hover:text-text-primary"
            >
              info@labourmarket.ai
            </a>{" "}
            from the email address associated with your LabourMarket.ai account.
          </li>
          <li>
            Use the subject “Account and data deletion request” and state that you want
            your LabourMarket.ai account and personal data deleted.
          </li>
          <li>
            We may need to verify that the request comes from the account holder before
            processing it.
          </li>
          <li>
            A person will review and process the request and will contact you if
            verification or clarification is required.
          </li>
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold text-text-primary">
          What deletion covers
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">
          The request applies to your LabourMarket.ai account and personal data held by
          the platform. Some records may need to be retained where applicable law requires
          it or where an audit, consent, security, dispute, or other record must lawfully
          be preserved. Data already lawfully disclosed to another independent recipient
          may also remain subject to that recipient’s own legal obligations.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold text-text-primary">
          Facebook sign-in
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">
          If you used Facebook to sign in, you can use the same process above to request
          deletion of the LabourMarket.ai account and data associated with that sign-in.
          Removing LabourMarket.ai from Facebook does not by itself replace a deletion
          request to LabourMarket.ai.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold text-text-primary">
          Data controller
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">
          The data controller of LabourMarket.ai is UAB “Nonstop Group”, company code
          302676973, registered office Mūšos g. 2C, Aukštikalnių k., LT-39103 Pasvalio r.
          sav., Lithuania. Privacy contact:{" "}
          <a
            href="mailto:info@labourmarket.ai"
            className="underline underline-offset-4 hover:text-text-primary"
          >
            info@labourmarket.ai
          </a>
          .
        </p>
      </section>

      <nav aria-label="Related pages" className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
        <Link href="/legal/privacy" className="text-sm text-text-secondary hover:text-text-primary">
          Privacy Policy →
        </Link>
        <Link
          href="/legal/data-access"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          Your data and who can see it →
        </Link>
      </nav>
    </article>
  );
}
