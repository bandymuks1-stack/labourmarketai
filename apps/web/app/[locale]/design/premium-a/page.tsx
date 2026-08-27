import { Instrument_Serif } from "next/font/google";
import { RecordExperience } from "@/components/design-lab/a/record-experience";

/**
 * CONCEPT A — "The Record". Warm paper, editorial serif, one continuous
 * canvas object that reorganises under scroll.
 *
 * Instrument Serif (SIL Open Font License 1.1, Google Fonts) is loaded ONLY
 * on this route — it is the concept's voice, not a product token.
 */
const serifDisplay = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif-display",
  display: "swap",
});

export default async function PremiumAPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div className={serifDisplay.variable} data-theme="light">
      <RecordExperience locale={locale} />
    </div>
  );
}
