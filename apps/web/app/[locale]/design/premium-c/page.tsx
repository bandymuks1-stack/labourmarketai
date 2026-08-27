import { Manrope } from "next/font/google";
import { CompositionExperience } from "@/components/design-lab/c/composition-experience";

/**
 * CONCEPT C — "The Composition". A lit studio of machined capability
 * elements that re-assemble per task.
 *
 * Manrope (SIL Open Font License 1.1, Google Fonts) is loaded ONLY on this
 * route — a tight geometric grotesk, the register of a hardware launch rather
 * than of a dashboard.
 */
const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-manrope",
  display: "swap",
});

export default async function PremiumCPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div className={manrope.variable} data-theme="light">
      <CompositionExperience locale={locale} />
    </div>
  );
}
