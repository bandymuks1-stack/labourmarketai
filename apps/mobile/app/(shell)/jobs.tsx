import React, { useMemo, useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

import type { JobsGetData, JobsSearchData, PublicJob } from "../../src/capability-shapes";
import { CONFIG } from "../../src/config";
import { useLocale } from "../../src/i18n/locale-context";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { Body, Button, Divider, Field, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";

/**
 * JOBS — the public vacancy board through `jobs.search`: the SAME read the
 * website's /jobs page performs, in the SAME anonymous projection. What a
 * person sees here is the occupation, form, time, positions, pay range and
 * date; the title, employer, place and application link live on the member
 * web page each job links to (`webPath`), opened in the browser as the same
 * signed-in person. The phone re-derives nothing (M-4).
 *
 * The search is submitted, not typed-through: every keystroke would be a
 * round trip to the board, and the board answers in pages of 20.
 *
 * DEEP LINK (F-2): `labourmarketai://jobs?id=<uuid>` (the app's own scheme)
 * and the claimed `https://labourmarket.ai/jobs` open this screen; with an
 * `id` the one job is read through `jobs.get` and shown above the board.
 * Per-job https links on the website are locale-prefixed (`/lt/jobs/<id>`)
 * and are NOT claimed: the association tables claim exact screens only
 * (app-association.test.ts), and widening that to a prefix is an owner
 * decision recorded in docs/mobile/MOBILE_BETA_EXECUTION_2026-10-16.md.
 */
export default function Screen() {
  const { t } = useLocale();
  const params = useLocalSearchParams<{ id?: string }>();
  const linkedId = typeof params.id === "string" && params.id.trim() !== "" ? params.id.trim() : null;
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const args = useMemo(
    () => (query === "" ? { page } : { query, page }),
    [query, page],
  );
  const search = useCapability<JobsSearchData>("jobs.search", args);
  // Submitting the SAME search again (after "unavailable", say) must read
  // again: unchanged state would not rerun the read, and a known refusal
  // shows no retry button of its own.
  const submit = () => {
    const next = draftQuery.trim();
    if (next === query && page === 1) search.reload();
    else {
      setPage(1);
      setQuery(next);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Title>{t("jobs.title")}</Title>
        <Body muted>{t("jobs.intro")}</Body>
        {linkedId !== null ? <LinkedJob id={linkedId} /> : null}
        <Field
          testID="jobs-query"
          label={t("jobs.queryLabel")}
          hint={t("jobs.queryHint")}
          value={draftQuery}
          onChangeText={setDraftQuery}
          maxLength={120}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => {
            submit();
          }}
        />
        <Button
          testID="jobs-search"
          label={t("jobs.search")}
          onPress={() => {
            submit();
          }}
        />
        <CapabilityGate
          state={search.state}
          reload={search.reload}
          refusalText={(code) =>
            code === "needs_migration"
              ? t("jobs.notProvisioned")
              : code === "unavailable"
                ? t("jobs.unavailable")
                : null
          }
        >
          {(data) => (
            <View style={styles.stack} testID="jobs-loaded">
              <Body muted>
                {t("jobs.total")}: {data.totalCount} · {t("jobs.page")} {data.page}
              </Body>
              {data.jobs.length === 0 ? (
                <Body muted>{t("jobs.none")}</Body>
              ) : (
                data.jobs.map((job, index) => (
                  <JobRow key={job.id} job={job} index={index} />
                ))
              )}
              <View style={styles.pager}>
                {data.page > 1 ? (
                  <Button
                    variant="quiet"
                    testID="jobs-prev"
                    label={t("jobs.prev")}
                    onPress={() => setPage((p) => Math.max(1, p - 1))}
                  />
                ) : null}
                {data.hasMore ? (
                  <Button
                    variant="quiet"
                    testID="jobs-next"
                    label={t("jobs.next")}
                    onPress={() => setPage((p) => p + 1)}
                  />
                ) : null}
              </View>
            </View>
          )}
        </CapabilityGate>
      </ScrollView>
    </SafeAreaView>
  );
}

/** The one job a deep link named, read through `jobs.get`; `not_found` is a
 *  sentence, never a blank card. */
function LinkedJob({ id }: { id: string }) {
  const { t } = useLocale();
  const args = useMemo(() => ({ id }), [id]);
  const one = useCapability<JobsGetData>("jobs.get", args);
  return (
    <View style={styles.stack} testID="jobs-linked">
      <CapabilityGate
        state={one.state}
        reload={one.reload}
        refusalText={(code) =>
          code === "not_found"
            ? t("jobs.linkedNotFound")
            : code === "needs_migration"
              ? t("jobs.notProvisioned")
              : code === "invalid"
                ? t("jobs.linkedNotFound")
                : null
        }
      >
        {(data) => <JobRow job={data.job} index={-1} />}
      </CapabilityGate>
    </View>
  );
}

function JobRow({ job, index }: { job: PublicJob; index: number }) {
  const { t } = useLocale();
  // The server's webPath already carries the caller's locale; the origin is
  // the one this build talks to, so a preview build never sends a person to
  // production (mobile-account-controls rule).
  const origin = CONFIG?.apiBaseUrl ?? "";
  const facts = [
    job.employmentForm,
    job.workingTime,
    job.positions !== null ? `${t("jobs.positions")}: ${job.positions}` : null,
    job.compensationMin !== null || job.compensationMax !== null
      ? `${t("jobs.compensation")}: ${[job.compensationMin, job.compensationMax]
          .filter((v) => v !== null)
          .join("–")} ${job.compensationCurrency ?? ""}`.trim()
      : null,
    job.publishedAt ? `${t("jobs.published")}: ${job.publishedAt.slice(0, 10)}` : null,
  ].filter((f): f is string => Boolean(f));
  return (
    <View style={styles.row} testID={index < 0 ? "jobs-linked-row" : `jobs-row-${index}`}>
      <Body>{job.occupation ?? job.professionSlug ?? t("jobs.untitled")}</Body>
      {facts.length > 0 ? <Body muted>{facts.join(" · ")}</Body> : null}
      <Button
        variant="quiet"
        testID={index < 0 ? "jobs-linked-open" : `jobs-open-${index}`}
        label={t("jobs.openWeb")}
        onPress={() => {
          void Linking.openURL(`${origin}${job.webPath}`);
        }}
      />
      <Divider />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
  stack: { gap: theme.space.sm },
  row: { gap: theme.space.xs, paddingVertical: theme.space.xs },
  pager: { flexDirection: "row", gap: theme.space.sm },
});
