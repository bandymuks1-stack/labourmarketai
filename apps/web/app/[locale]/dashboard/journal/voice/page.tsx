import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/navigation";
import { VoiceJournalRecorder } from "@/components/app/voice-journal-recorder";
import { isVoiceTranscriptionConfigured } from "@/lib/voice/transcribe-action";

/** Voice input for the ONE Work Journal (nested under /dashboard/journal —
 *  no new top-level module). Record → self-hosted transcription → review and
 *  edit → hand the text to the existing journal composer, whose suggestion
 *  review + createJournalEntry remain the ONLY write path. */
export default async function VoiceJournalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("journal.voice");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) redirect(`/${locale}/dashboard`);

  const serviceConfigured = await isVoiceTranscriptionConfigured();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold text-text-primary">
          {t("pageTitle")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("pageIntro")}
        </p>
      </div>
      <VoiceJournalRecorder serviceConfigured={serviceConfigured} />
      <Link
        href="/dashboard/journal"
        className="inline-flex min-h-[2.75rem] items-center text-sm font-medium text-brand-blue underline-offset-4 hover:underline"
      >
        {t("backToJournal")}
      </Link>
    </div>
  );
}
