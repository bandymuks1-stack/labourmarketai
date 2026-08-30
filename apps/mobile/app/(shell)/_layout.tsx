import React from "react";
import { Redirect, Tabs } from "expo-router";

import { useAuth } from "../../src/auth-context";
import { useLocale } from "../../src/i18n/locale-context";
import { theme } from "../../src/ui/theme";

/**
 * THE NAVIGATION SHELL — one client, four destinations, every context.
 *
 * There is no worker app and no employer app. Splitting them would duplicate
 * the human, which invariant I-1 forbids: a person who logs their own hours in
 * the morning and reviews their team's in the afternoon is one person. The
 * context switcher in Settings changes what these destinations are ABOUT; it
 * never changes which app they are in.
 *
 * The tabs are named after what a person does, not after the product's
 * internals (invariant I-8): "Work journal", not "journal_entries".
 *
 * ## Why the auth check is here as well as at the entry gate
 *
 * A deep link — from a notification, or a shared URL — can open any route in
 * this group directly, without passing through `app/index.tsx`. Without this
 * redirect a signed-out person following a notification would land on a screen
 * that asks the backend for their data, gets nothing under RLS, and renders
 * the emptiness as if it were their record.
 */
export default function ShellLayout() {
  const { state } = useAuth();
  const { t } = useLocale();

  // Only a DETERMINED signed-out state redirects. `unknown` is still loading,
  // and `unavailable` means the check itself failed — bouncing someone to a
  // login screen because their keychain hiccuped is the exact defect this
  // codebase keeps meeting.
  if (state.status === "signed_out") return <Redirect href="/sign-in" />;
  if (state.status === "unavailable") return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.color.surface },
        headerTintColor: theme.color.text,
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
        },
        tabBarActiveTintColor: theme.color.accent,
        tabBarInactiveTintColor: theme.color.textMuted,
        // Labels are the whole affordance here — there are no icons yet — so
        // they must not truncate at the largest accessibility text size.
        tabBarLabelStyle: { fontSize: theme.font.small },
      }}
    >
      <Tabs.Screen name="today" options={{ title: t("nav.today") }} />
      <Tabs.Screen name="journal" options={{ title: t("nav.journal") }} />
      <Tabs.Screen name="profile" options={{ title: t("nav.profile") }} />
      <Tabs.Screen name="settings" options={{ title: t("nav.settings") }} />
    </Tabs>
  );
}
