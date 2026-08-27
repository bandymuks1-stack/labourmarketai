import { Instrument_Serif, Manrope } from "next/font/google";
import { PresenceExperience } from "@/components/design-lab/c1/presence-experience";

/**
 * C1 — "The Presence". The organic/human evolution of the selected direction:
 * one field of points that is scattered activity, then a person, then the
 * market — never re-created, only regrouped.
 */
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif-display",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-manrope",
  display: "swap",
});

export default async function PremiumC1Page({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div className={`${serif.variable} ${manrope.variable}`} data-theme="dark">
      <PresenceExperience locale={locale} />
    </div>
  );
}
