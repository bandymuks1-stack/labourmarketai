import { authPageMetadata } from "@/lib/auth/auth-page-metadata";
import { setRequestLocale } from "next-intl/server";
import { ResetPasswordForm } from "@/components/app/reset-password-form";

export function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return authPageMetadata(params, "resetPassword");
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ResetPasswordForm />;
}
