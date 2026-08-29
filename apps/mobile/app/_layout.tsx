import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "../src/auth-context";
import { ActorContextProvider } from "../src/context-provider";
import { LocaleProvider } from "../src/i18n/locale-context";
import { CONFIG_PROBLEMS } from "../src/config";
import { MisconfiguredScreen } from "../src/screens/misconfigured";

/**
 * The root of the app.
 *
 * Provider order is deliberate: language wraps everything, because a
 * misconfiguration message and an auth error both have to be readable in the
 * person's own language before anything else works.
 *
 * A build with no configuration stops here, with a specific message. It does
 * not render a sign-in form that could never succeed — asking someone for
 * their password when the app cannot reach an auth server wastes their time
 * and teaches them the app is broken.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <LocaleProvider>
        {CONFIG_PROBLEMS.length > 0 ? (
          <MisconfiguredScreen problems={CONFIG_PROBLEMS} />
        ) : (
          <AuthProvider>
            <ActorContextProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "#0B0E14" },
                }}
              />
            </ActorContextProvider>
          </AuthProvider>
        )}
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
