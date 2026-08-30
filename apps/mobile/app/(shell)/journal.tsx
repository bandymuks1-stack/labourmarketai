import React from "react";

import { useLocale } from "../../src/i18n/locale-context";
import { NotConnectedScreen } from "../../src/screens/not-connected";

/**
 * PLACEHOLDER SCREEN — content arrives with the canonical transport.
 *
 * This is intentionally not a stub with sample data in it. It renders the one
 * honest thing there is to say, and its heading is the destination the person
 * chose, so they can see they navigated where they meant to.
 */
export default function Screen() {
  const { t } = useLocale();
  return <NotConnectedScreen heading={t("nav.journal")} />;
}
