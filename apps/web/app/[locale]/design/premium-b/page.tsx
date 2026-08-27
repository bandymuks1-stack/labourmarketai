import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { FieldExperience } from "@/components/design-lab/b/field-experience";

/**
 * CONCEPT B — "The Field". A displaced WebGL surface over the repository's
 * existing public-domain Europe geometry.
 *
 * IBM Plex (SIL Open Font License 1.1) is loaded ONLY on this route: it reads
 * as instrumentation rather than as SaaS, which is the register this concept
 * is arguing for.
 */
const plex = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500"],
  variable: "--font-plex",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400"],
  variable: "--font-plex-mono",
  display: "swap",
});

export default async function PremiumBPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div className={`${plex.variable} ${plexMono.variable}`} data-theme="dark">
      <FieldExperience locale={locale} />
    </div>
  );
}
