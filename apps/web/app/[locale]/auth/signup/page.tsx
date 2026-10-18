import { authPageMetadata } from "@/lib/auth/auth-page-metadata";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignupForm } from "@/components/app/signup-form";
import { getEnabledProviders } from "@/lib/auth/enabled-providers";
import { isSafeReturnPath } from "@/lib/auth/redirect";
import { inviteTokenFromNextPath, maskEmail } from "@/lib/invitations/model";
import { readInvitationSignupContext } from "@/lib/invitations/signup-bridge";
import { readPublicInvitationPreview } from "@/lib/invitations/public-preview";
import { showsStaffReviewNotice } from "@/lib/operations/auto-review-model";

/** The provider surface can change without a deploy (owner flips a provider
 *  in the auth dashboard; the 300 s settings cache expires), so the page
 *  revalidates on the same window instead of being frozen at build time. */
export const revalidate = 300;

/** Signup page. The form reads `?next=…` via `useSearchParams()`, so we
 *  wrap it in `<Suspense>` to keep the rest of the auth shell statically
 *  prerenderable (Next 15 requirement for CSR-bailout components).
 *
 *  Provider flags are fetched HERE (server) from the auth server's own
 *  settings endpoint and passed down as plain booleans — the client form
 *  never guesses which providers exist (§18: never advertise a sign-in
 *  button the auth server cannot complete). */
export function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return authPageMetadata(params, "signup");
}

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);
  const providers = await getEnabledProviders();
  // FRICTIONLESS ADDRESSED INVITE (owner decision 2026-10-06): a person who
  // arrives through an addressed invitation link does not retype the address
  // the invitation already names. Resolved server-side from the token in
  // `next`; any failure / open link / used / expired invitation = no prefill.
  const inviteToken = isSafeReturnPath(next) ? inviteTokenFromNextPath(next) : null;
  const invite = await readInvitationSignupContext(inviteToken);
  // Signing up through an addressed invitation ALSO accepts it, so when that
  // makes the person an employee of a named organization the review sentence
  // is shown here, on the form that accepts (owner decision 1). The same
  // server-only public preview the onboarding page reads names the
  // organization and the relationship; a failed read shows no sentence and the
  // acceptance then carries no notice (review stays manual).
  let reviewNoticeText: string | null = null;
  if (invite.kind === "addressed" && inviteToken) {
    const pub = await readPublicInvitationPreview(inviteToken, { emitOpened: false });
    if (
      pub.kind === "ok" &&
      showsStaffReviewNotice({
        invitationType: pub.preview.invitationType,
        relationshipSlug: pub.preview.relationshipSlug,
        organizationName: pub.preview.organizationName,
      })
    ) {
      const t = await getTranslations({ locale, namespace: "network.invitePage" });
      reviewNoticeText = t("reviewNotice", { organization: pub.preview.organizationName ?? "" });
    }
  }
  return (
    <Suspense fallback={null}>
      <SignupForm
        linkedinEnabled={providers.linkedin_oidc}
        facebookEnabled={providers.facebook}
        invitation={
          invite.kind === "addressed" && inviteToken
            ? { token: inviteToken, maskedEmail: maskEmail(invite.email) ?? "", reviewNoticeText }
            : undefined
        }
      />
    </Suspense>
  );
}
