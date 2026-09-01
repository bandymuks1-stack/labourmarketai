import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useLocale } from "../../src/i18n/locale-context";
import { JournalComposer } from "../../src/screens/journal-composer";
import { Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";

/**
 * LOG WORK — writing an entry into the Work Journal from the phone.
 *
 * It lives inside the shell group rather than at the root so that it inherits
 * the group's auth gate: a deep link straight here from a signed-out device is
 * redirected exactly like every other product screen, instead of rendering a
 * form whose save could only ever be refused. It is hidden from the tab bar
 * (`href: null` in the shell layout) because it is an action reached from the
 * journal, not a fifth place to be.
 *
 * `KeyboardAvoidingView` because the entry box is the tallest field in the app
 * and the save controls sit under it — a keyboard that covered them would make
 * the screen look like it had no way to finish.
 */
export default function Screen() {
  const { t } = useLocale();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Title>{t("journal.compose.title")}</Title>
          <JournalComposer
            onDone={() => {
              // Back where they came from when there is a back to go to; the
              // journal itself when this screen was opened by a deep link and
              // there is nothing behind it.
              if (router.canGoBack()) router.back();
              else router.replace("/(shell)/journal");
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },
  content: { padding: theme.space.md, gap: theme.space.md },
});
