import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing.hero");
  const c = await getTranslations("common");

  return (
    <main className="mx-auto flex min-h-screen max-w-[1440px] flex-col justify-center px-6 py-24 sm:px-12">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#9BA3B8]">
        {t("eyebrow")}
      </p>
      <h1 className="mt-6 max-w-3xl font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
        {t("headline")}{" "}
        <span className="text-gradient-accent">{t("headlineAccent")}</span>
      </h1>
      <p className="mt-6 max-w-xl text-base leading-relaxed text-[#9BA3B8] sm:text-lg">
        {t("subcopy")}
      </p>
      <div className="mt-9 flex flex-wrap gap-4">
        <span className="rounded-[14px] bg-[linear-gradient(135deg,#3E8BFF,#7B5CFF)] px-6 py-3 text-sm font-semibold text-white">
          {t("ctaPrimary")}
        </span>
        <span className="rounded-[14px] border border-[#252A3D] px-6 py-3 text-sm font-semibold text-[#F4F6FB]">
          {t("ctaSecondary")}
        </span>
      </div>
      <p className="mt-12 font-mono text-xs uppercase tracking-[0.14em] text-[#5C6480]">
        {t("m0Notice")}
      </p>
      <div className="mt-6 flex gap-4 text-sm text-[#9BA3B8]">
        <span>{c("localeSwitch")}:</span>
        <Link href="/" locale="lt" className="underline">
          LT
        </Link>
        <Link href="/" locale="en" className="underline">
          EN
        </Link>
      </div>
    </main>
  );
}
