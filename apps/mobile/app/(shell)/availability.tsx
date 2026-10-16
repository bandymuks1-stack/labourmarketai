import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { WorkforceAvailabilityData } from "../../src/capability-shapes";
import { useLocale } from "../../src/i18n/locale-context";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { Body, Divider, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";

const NO_ARGS = {} as const;

/**
 * WHO IS FREE — `workforce.availability`, the same read the web planning
 * page makes, for the workspace the person is acting in. Three states and
 * the difference between them is the point: COMMITTED IS NOT UNAVAILABLE
 * (SEP-2). Each row says which, whether an authorized person may override,
 * and the server says which of its inputs answered (SEP-7) — a partial read
 * is shown as partial, never as "everyone is free".
 *
 * Outside an employer workspace the capability refuses by name; each name
 * becomes a sentence that tells the person what to switch, not an error.
 */
export default function Screen() {
  const { t } = useLocale();
  const read = useCapability<WorkforceAvailabilityData>("workforce.availability", NO_ARGS);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t("availability.title")}</Title>
        <Body muted>{t("availability.intro")}</Body>
        <CapabilityGate
          state={read.state}
          reload={read.reload}
          refusalText={(code) =>
            code === "personal_workspace"
              ? t("availability.personalWorkspace")
              : code === "no_organization"
                ? t("availability.noOrganization")
                : code === "no_company_context"
                  ? t("availability.noCompanyContext")
                  : null
          }
        >
          {(data) => (
            <View style={styles.stack} testID="availability-loaded">
              <Body>
                {t("availability.actingFor")}: {data.actingFor}
              </Body>
              {data.from && data.to ? (
                <Body muted>
                  {t("availability.window")}: {data.from} – {data.to}
                </Body>
              ) : null}
              <Body muted>
                {t("availability.rosterTotal")}: {data.rosterTotal}
              </Body>
              {data.absencesKnown === false || data.commitmentsKnown === false ? (
                <Body muted>{t("availability.sourcesPartial")}</Body>
              ) : null}
              <Divider />
              {data.rows.length === 0 ? (
                <Body muted>{data.note ?? t("availability.noRoster")}</Body>
              ) : (
                data.rows.map((row, index) => (
                  <View key={`${row.label}-${index}`} style={styles.row} testID={`availability-row-${index}`}>
                    <Body>{row.label}</Body>
                    <Body muted>
                      {t(`availability.state.${row.state}`)}
                      {row.state === "committed" && row.committedTo
                        ? ` · ${t("availability.committedTo")} ${row.committedTo}`
                        : ""}
                      {row.state !== "free" && row.notFreeUntil
                        ? ` · ${t("availability.notFreeUntil")} ${row.notFreeUntil}`
                        : ""}
                      {row.state !== "free" && row.overridable
                        ? ` · ${t("availability.overridable")}`
                        : ""}
                    </Body>
                  </View>
                ))
              )}
            </View>
          )}
        </CapabilityGate>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
  stack: { gap: theme.space.sm },
  row: { gap: theme.space.xs, paddingVertical: theme.space.xs },
});
