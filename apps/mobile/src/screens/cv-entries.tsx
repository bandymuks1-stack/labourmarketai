import React from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import type { VerifiedCvGetData, VerifiedCvWorkRow } from "../capability-shapes";
import { useLocale } from "../i18n/locale-context";
import { Body, Button, Divider, Title } from "../ui/primitives";
import { theme } from "../ui/theme";
import { useCapability } from "../use-capability";
import { useReloadOnReturn } from "../use-reload-on-return";
import { languageName } from "../worker-languages";
import { CapabilityGate } from "./capability-gate";

/** "2019" from an ISO date; null when there is no date. */
function yearOf(iso: string | null): string | null {
  return iso && /^\d{4}/.test(iso) ? iso.slice(0, 4) : null;
}

/**
 * WORK HISTORY AND LANGUAGES on the Living CV — read through `cv.verified.get`,
 * the same builder the printable CV page renders from, so the phone and the
 * web never disagree. Adding goes to the one-step actions the web chat runs
 * (`worker.add-work-history`, `worker.add-language`) on their own screens.
 */
export function CvEntries() {
  const { t } = useLocale();
  const router = useRouter();
  const cv = useCapability<VerifiedCvGetData>("cv.verified.get");
  // An entry added on its own screen must show here on return.
  useReloadOnReturn(cv.reload);

  const period = (row: VerifiedCvWorkRow): string | null => {
    const from = yearOf(row.startedAt);
    if (from === null) return null;
    const to = row.endedAt === null ? t("cv.now") : yearOf(row.endedAt);
    return to === null || to === from ? from : `${from}–${to}`;
  };

  return (
    <CapabilityGate state={cv.state} reload={cv.reload}>
      {(data) =>
        !data.ok ? (
          <Body muted>{t("profile.noWorkerProfile")}</Body>
        ) : (
          <View style={styles.stack}>
            <Divider />
            <Title>{t("cv.workTitle")}</Title>
            {data.cv.workHistory.length === 0 ? (
              <Body muted>{t("cv.workEmpty")}</Body>
            ) : (
              data.cv.workHistory.map((row, i) => (
                <View key={row.id ?? `work-${i}`} style={styles.row} testID="cv-work-row">
                  <Body>{row.title ?? row.orgName ?? t("cv.workUntitled")}</Body>
                  {row.title !== null && row.orgName !== null ? <Body muted>{row.orgName}</Body> : null}
                  {period(row) !== null ? <Body muted>{period(row)}</Body> : null}
                </View>
              ))
            )}
            <Button
              variant="quiet"
              testID="cv-add-work"
              label={t("cv.addWork")}
              onPress={() => router.push("/(shell)/add-work")}
            />
            <Divider />
            <Title>{t("cv.languagesTitle")}</Title>
            {data.cv.languages.length === 0 ? (
              <Body muted>{t("cv.languagesEmpty")}</Body>
            ) : (
              data.cv.languages.map((row) => (
                <Body key={`${row.lang}-${row.level}`}>
                  {languageName(row.lang)} · {row.level === "native" ? t("cv.levelNative") : row.level}
                </Body>
              ))
            )}
            <Button
              variant="quiet"
              testID="cv-add-language"
              label={t("cv.addLanguage")}
              onPress={() => router.push("/(shell)/add-language")}
            />
          </View>
        )
      }
    </CapabilityGate>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  row: { gap: theme.space.xs },
});
