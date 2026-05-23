import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { SignupForm } from "@/components/app/signup-form";

/** Signup page. The form reads `?next=…` via `useSearchParams()`, so we
 *  wrap it in `<Suspense>` to keep the rest of the auth shell statically
 *  prerenderable (Next 15 requirement for CSR-bailout components). */
export default async function SignupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
