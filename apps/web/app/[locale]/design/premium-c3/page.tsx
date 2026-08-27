import { Manrope } from "next/font/google";
import { AssemblyExperience } from "@/components/design-lab/c3/assembly-experience";

/**
 * C3 — "The Assembly". Round 2 evolution of the selected direction: the
 * composition idea kept, the block metaphor replaced by refractive glass,
 * membranes, blades and plates that GROW a structure around a need.
 */
const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-manrope",
  display: "swap",
});

export default async function PremiumC3Page({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div className={manrope.variable} data-theme="dark">
      <AssemblyExperience locale={locale} />
    </div>
  );
}
