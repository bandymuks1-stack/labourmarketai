import { Manrope } from "next/font/google";
import { WeatherExperience } from "@/components/design-lab/c2/weather-experience";

/**
 * C2 — "The Weather". The spatial/market evolution: a volume of currents the
 * camera flies through, where a need is a pressure centre that visibly bends
 * the traffic around it.
 */
const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-manrope",
  display: "swap",
});

export default async function PremiumC2Page({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div className={manrope.variable} data-theme="dark">
      <WeatherExperience locale={locale} />
    </div>
  );
}
