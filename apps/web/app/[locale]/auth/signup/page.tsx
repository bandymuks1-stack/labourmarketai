import { setRequestLocale } from "next-intl/server";
import { SignupForm } from "@/components/app/signup-form";

export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SignupForm />;
}
