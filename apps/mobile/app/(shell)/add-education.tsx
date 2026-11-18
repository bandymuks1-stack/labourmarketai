import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useLocale } from "../../src/i18n/locale-context";
import { EducationForm } from "../../src/screens/education-form";
import { Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";

/**
 * Reached from the profile's Living CV section; hidden from the tab bar
 * (`href: null` in the shell layout) and inside the shell group so it shares
 * its auth gate, like the journal's log-work screen.
 */
export default function Screen() {
  const { t } = useLocale();
  const router = useRouter();
  const done = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(shell)/profile");
  };
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View testID="cv-education-title-heading">
            <Title>{t("cv.education.title")}</Title>
          </View>
          <EducationForm onDone={done} />
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
