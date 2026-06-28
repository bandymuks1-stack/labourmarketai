import { setRequestLocale } from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { Link } from "@/lib/i18n/navigation";

/** Minimal chrome for auth flows (no marketing nav/footer). Centered panel
 *  on the page-ambient glow background. */
export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="relative min-h-screen">
      <AmbientGlow />
      <header className="relative z-10 mx-auto max-w-container px-6 py-6 sm:px-12">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tightest text-text-primary"
        >
          LabourMarket<span className="text-gradient-accent">.ai</span>
        </Link>
      </header>
      <main className="relative z-10 mx-auto flex max-w-md flex-col px-6 pb-20">
        {children}
      </main>
    </div>
  );
}
