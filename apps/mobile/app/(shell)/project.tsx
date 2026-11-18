import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  asksState,
  asksTotal,
  asksTotalLabel,
  type WorkerProjectAsk,
  type WorkerProjectsData,
} from "../../src/capability-shapes";
import { useLocale } from "../../src/i18n/locale-context";
import type { MessageKey } from "../../src/i18n/messages";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { Body, Button, Divider, NotAvailable, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";
import { useReloadOnReturn } from "../../src/use-reload-on-return";

const ASK_STATUS: Record<WorkerProjectAsk["status"], MessageKey> = {
  needed: "projects.ask.needed",
  missing: "projects.ask.missing",
  rejected: "projects.ask.rejected",
  expired: "projects.ask.expired",
};

/**
 * ONE OF MY PROJECTS — what the project is, where, whether the assignment is
 * active, what it still needs from me (the manager's checklist rows, labels
 * verbatim) and the manager's latest instruction, which opens its thread in
 * Messages to answer. Read from the SAME `worker.projects.list` answer as the
 * list — no second project read, and a project that is not one of mine is not
 * found.
 */
export default function Screen() {
  const { t } = useLocale();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const read = useCapability<WorkerProjectsData>("worker.projects.list");
  useReloadOnReturn(read.reload);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <CapabilityGate
          state={read.state}
          reload={read.reload}
          refusalText={(code) =>
            code === "no_worker_profile" ? t("profile.noWorkerProfile") : null
          }
        >
          {(data) => {
            const project =
              data.kind === "ok" ? data.projects.find((p) => p.projectId === id) : undefined;
            if (!project) {
              return (
                <NotAvailable
                  testID="project-missing"
                  title={t("projects.detailTitle")}
                  body={t("projects.notFound")}
                />
              );
            }
            const instruction = project.instruction;
            return (
              <View style={styles.stack} testID="project-loaded">
                <Title>{project.title}</Title>
                <Text style={styles.meta}>
                  {project.assignmentStatus === "active"
                    ? t("projects.active")
                    : t("projects.ended")}
                  {project.place !== null ? ` · ${project.place}` : ""}
                </Text>
                <Divider />
                <Text style={styles.heading}>{t("projects.asksTitle")}</Text>
                {asksState(project) === "unavailable" ? (
                  // A checklist that did not answer is unknown, never "nothing
                  // is open".
                  <Body muted>{t("projects.asksUnavailable")}</Body>
                ) : asksState(project) === "not_read" ? (
                  <Body muted>{t("projects.asksNotRead")}</Body>
                ) : asksState(project) === "incomplete" ? (
                  <Body muted>{t("projects.asksIncomplete")}</Body>
                ) : project.asks.length === 0 ? (
                  <Body muted>{t("projects.asksNone")}</Body>
                ) : (
                  project.asks.map((ask) => (
                    <View key={ask.itemKey} style={styles.fact} accessible>
                      <Text style={styles.value}>{ask.label}</Text>
                      <Text style={styles.meta}>{t(ASK_STATUS[ask.status])}</Text>
                    </View>
                  ))
                )}
                {project.asks.length > 0 &&
                (asksTotal(project) > project.asks.length || project.asksTotalAtLeast === true) ? (
                  // The read names only the first asks; never let them pass
                  // for everything still open.
                  <Body muted>
                    {t("projects.asksShownOf")}: {project.asks.length} / {asksTotalLabel(project)}
                  </Body>
                ) : null}
                {instruction !== null ? (
                  <>
                    <Divider />
                    <Text style={styles.heading}>{t("projects.instructionTitle")}</Text>
                    <View style={styles.fact} accessible>
                      {instruction.authorName !== null ? (
                        <Text style={styles.meta}>{instruction.authorName}</Text>
                      ) : null}
                      <Text style={styles.value}>{instruction.text}</Text>
                    </View>
                    <Button
                      variant="quiet"
                      testID="project-open-instruction"
                      label={t("projects.answerInstruction")}
                      onPress={() =>
                        router.push({
                          pathname: "/(shell)/conversation",
                          params: { id: instruction.conversationId },
                        })
                      }
                    />
                  </>
                ) : null}
                <Divider />
                <Body muted>{t("projects.webDetail")}</Body>
              </View>
            );
          }}
        </CapabilityGate>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
  stack: { gap: theme.space.sm },
  heading: { color: theme.color.text, fontSize: theme.font.body, fontWeight: "600" },
  fact: { gap: 2 },
  value: {
    color: theme.color.text,
    fontSize: theme.font.body,
    lineHeight: theme.font.body * 1.5,
  },
  meta: { color: theme.color.textMuted, fontSize: theme.font.small },
});
