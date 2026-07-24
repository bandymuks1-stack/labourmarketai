import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { designGalleryEnabled } from "@/lib/env";
import { ConversationChat, type ChatLabels } from "@/components/app/conversation/chat/conversation-chat";
import type { ChatMessage } from "@/components/app/conversation/chat/types";
import type { ActiveLocale } from "@/lib/i18n/config";

/**
 * Dev-only design preview of the Real Conversation UI. Renders the chat window
 * with a fixed SAMPLE thread so the team can capture desktop + mobile
 * screenshots WITHOUT authenticating against Supabase. Gated by
 * `designGalleryEnabled` (never rendered in production). NOT linked from nav.
 * Sample content is illustrative — the live surface shows only real data.
 */
export default async function ConversationDesignPreview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!designGalleryEnabled) notFound();

  const t = await getTranslations("conversation.chat");
  const labels = resolveChatLabels(t);
  const script = sampleThread(labels);

  return <ConversationChat locale={locale as ActiveLocale} labels={labels} script={script} />;
}

function resolveChatLabels(t: Awaited<ReturnType<typeof getTranslations>>): ChatLabels {
  const keys = [
    "headerTitle", "advanced", "composerPlaceholder", "send", "attach", "greeting",
    "chipCv", "chipJobs", "chipProfile", "chipOffers", "profileQuestion", "chipLang",
    "chipExp", "chipEdu", "chipCard", "chipPrefs", "jobsAnswer", "offersEmpty",
    "fallback", "userCv", "userProfile", "userOffers", "userJobs",
  ] as const;
  const out = {} as Record<(typeof keys)[number], string>;
  for (const k of keys) out[k] = t(k);
  return out as ChatLabels;
}

/** Illustrative sample thread covering every message type (dev preview only). */
function sampleThread(labels: ChatLabels): ChatMessage[] {
  return [
    { id: "s1", role: "assistant", kind: "text", text: labels.greeting, chips: [
      { id: "cv", label: labels.chipCv }, { id: "jobs", label: labels.chipJobs },
      { id: "profile", label: labels.chipProfile }, { id: "offers", label: labels.chipOffers },
    ] },
    { id: "s2", role: "user", kind: "text", text: "Ieškau darbo Nyderlanduose." },
    { id: "s3", role: "assistant", kind: "employer-match", intro: "Radau 3 tinkamus variantus. Geriausias atitikimas:", matches: [
      { id: "e1", name: "De Vries Bouw B.V.", fitLabel: "Stiprus atitikimas", reasons: ["Ieško tavo profesijos (suvirintojas)", "Atlygis atitinka tavo lūkesčius", "Pradžia rugpjūtį tinka", "Pakanka anglų kalbos"] },
      { id: "e2", name: "Rotterdam Staal", fitLabel: "Geras atitikimas", reasons: ["Reikia MIG/MAG įgūdžių", "Netoli tavo norimos lokacijos"] },
    ] },
    { id: "s4", role: "user", kind: "text", text: "Šiandien dirbau 8 valandas objekte Roterdame, montavau langus." },
    { id: "s5", role: "assistant", kind: "worklog", title: "Supratau taip — išsaugoti?", draft: {
      date: "2026-07-24", start: "08:00", end: "17:00", breakMinutes: 45, hoursLabel: "8 val. 15 min.",
      task: "Langų montavimas", project: "Roterdamas", skills: ["Langų montavimas", "Matavimas"],
    }, confirmLabel: "Išsaugoti", cancelLabel: "Taisyti" },
    { id: "s6", role: "system", kind: "result", ok: true, text: "Įrašas išsaugotas darbo žurnale." },
    { id: "s7", role: "user", kind: "text", text: "Parašyk šiai įmonei, kad galiu pradėti rugpjūčio 5 d." },
    { id: "s8", role: "assistant", kind: "translation", recipient: "De Vries Bouw B.V.", channelLabel: "Vidinė žinutė",
      originalLabel: "Originalas (LT)", original: "Sveiki, galiu pradėti dirbti nuo rugpjūčio 5 d. Ačiū.",
      translatedLabel: "Vertimas (NL)", translated: "Hallo, ik kan vanaf 5 augustus beginnen met werken. Bedankt.",
      confirmLabel: "Patvirtinti ir siųsti", cancelLabel: "Taisyti" },
    { id: "s9", role: "user", kind: "file", fileName: "CV_Jonas_Petraitis.pdf", status: "read" },
    { id: "s10", role: "assistant", kind: "confirmation", title: "CV perskaitytas — radau 3 darbo patirtis, 2 kalbas ir 5 įgūdžius.",
      body: "Ar išsaugoti šiuos duomenis į tavo profilį? Galėsi peržiūrėti kiekvieną.",
      confirmLabel: "Peržiūrėti ir išsaugoti", cancelLabel: "Ne dabar" },
  ];
}
