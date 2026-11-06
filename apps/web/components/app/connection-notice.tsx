"use client";

import { useEffect, useState } from "react";

import type { ActiveLocale } from "@/lib/i18n/config";

/**
 * NO CONNECTION, SAID ONCE FOR EVERY FORM (slow-phone walk 2026-11-06). A Save with
 * no connection showed nothing: no error, no message, the page just sat there, and
 * the person couldn't tell whether their work was stored. A hundred forms send through
 * the same server actions, so the answer is here rather than in each of them.
 *
 * Renders nothing while online. The words live in this file for the same reason as
 * `app/global-error.tsx`: nothing here may depend on a catalog that has to be loaded.
 */
const COPY: Record<ActiveLocale, string> = {
  lt: "Nėra interneto ryšio. Kas dabar išsaugoma, neišsisaugos. Palauk, kol ryšys grįš, ir bandyk dar kartą.",
  en: "No internet connection. Nothing you save now will be stored. Wait for the connection and try again.",
  ru: "Нет подключения к интернету. Сейчас ничего не сохранится. Дождитесь подключения и попробуйте ещё раз.",
  nl: "Geen internetverbinding. Wat je nu opslaat, wordt niet bewaard. Wacht op de verbinding en probeer het opnieuw.",
  de: "Keine Internetverbindung. Was Sie jetzt speichern, wird nicht übernommen. Warten Sie auf die Verbindung und versuchen Sie es erneut.",
  pl: "Brak połączenia z internetem. To, co teraz zapiszesz, nie zostanie zachowane. Poczekaj na połączenie i spróbuj ponownie.",
};

export function ConnectionNotice({ locale }: { readonly locale: ActiveLocale }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const read = () => setOffline(navigator.onLine === false);
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);

  if (!offline) return null;

  return (
    <p
      role="alert"
      data-testid="connection-notice"
      className="fixed inset-x-0 top-0 z-[100] bg-state-danger px-4 py-3 text-center text-sm font-semibold text-text-on-danger"
    >
      {COPY[locale]}
    </p>
  );
}
