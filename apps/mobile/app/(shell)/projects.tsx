import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { asksTotal, asksTotalLabel, type WorkerProjectsData } from "../../src/capability-shapes";
import { useLocale } from "../../src/i18n/locale-context";
import { traceTestId, useRequestTrace } from "../../src/request-trace";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { Body, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";
import { useReloadOnReturn } from "../../src/use-reload-on-return";

/**
 * MY PROJECTS — the projects the caller is assigned to, read through
 * `worker.projects.list`: the same read the worker's project page on the web
 * uses, scoped by RLS to the person's own assignments. Active first. A
 * station reached from Today.
 */
export default function Screen() {
  const { t } = useLocale();
  const router = useRouter();
  const trace = useRequestTrace();
  const read = useCapability<WorkerProjectsData>("worker.projects.list");
  useReloadOnReturn(read.reload);
  const readState =
    read.state.status === "failed" ? `failed-${read.state.failure.kind}` : read.state.status;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View testID={`projects-read-${readState}`}>
          <View testID={traceTestId(trace, "worker.projects.list")}>
            <Title>{t("projects.title")}</Title>
          </View>
        </View>
        <CapabilityGate
          state={read.state}
          reload={read.reload}
          refusalText={(code) =>
            code === "no_worker_profile" ? t("profile.noWorkerProfile") : null
          }
        >
          {(data) =>
            data.kind !== "ok" || data.projects.length === 0 ? (
              // A LOADED answer of no assignments.
              <View testID="projects-loaded">
                <Body muted>{t("projects.none")}</Body>
              </View>
            ) : (
              <View style={styles.list} testID="projects-loaded">
                {data.projects.map((p, index) => (
                  <Pressable
                    key={p.projectId}
                    testID={`projects-open-${index}`}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({ pathname: "/(shell)/project", params: { id: p.projectId } })
                    }
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  >
                    <Text style={styles.meta}>
                      {p.assignmentStatus === "active"
                        ? t("projects.active")
                        : t("projects.ended")}
                      {p.place !== null ? ` · ${p.place}` : ""}
                    </Text>
                    <Text style={styles.title}>{p.title}</Text>
                    {asksTotal(p) > 0 ? (
                      <Text style={styles.meta}>
                        {t("projects.asksCount")}: {asksTotalLabel(p)}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
                {data.activeCount >
                data.projects.filter((p) => p.assignmentStatus === "active").length ? (
                  // The read is capped for display; say so instead of letting
                  // the list pass for all of them.
                  <Body muted>{t("projects.moreOnWeb")}</Body>
                ) : null}
              </View>
            )
          }
        </CapabilityGate>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
  list: { gap: theme.space.sm },
  row: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    padding: theme.space.md,
    gap: theme.space.xs,
    minHeight: theme.minTouchTarget,
  },
  pressed: { opacity: 0.7 },
  title: { color: theme.color.text, fontSize: theme.font.body, fontWeight: "600" },
  meta: { color: theme.color.textMuted, fontSize: theme.font.small },
});
