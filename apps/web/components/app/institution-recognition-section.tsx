import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { readInstitutionPrograms } from "@/lib/education/programs";

import { RecordRecognitionForm, type RecognitionFormLabels } from "./institution-recognition-form";

/**
 * SKL-9 — the assessor's door, beside (never inside) the programmes section:
 * a recognition is a formal act and stays a separate thing from the cohort
 * grammar. Learners are the same eligible set the cohort assign form offers
 * (an active `student` relationship + the invitation label the institution
 * typed itself), so no learner data is read. The form says up front that the
 * register is not released yet; nothing here pretends a recognition was saved.
 */
export async function InstitutionRecognitionSection({ organizationId }: { readonly organizationId: string }) {
  const t = await getTranslations("roleDashboards.company.programs.recognition");
  const read = await readInstitutionPrograms(organizationId);
  if (read.status !== "ok" || read.assignable.length === 0) return null;

  const labels: RecognitionFormLabels = {
    title: t("title"),
    hint: t("hint"),
    pending: t("pending"),
    subject: t("subject"),
    chooseSubject: t("chooseSubject"),
    kind: t("kind"),
    kindDocument: t("kindDocument"),
    kindSkill: t("kindSkill"),
    kindProfession: t("kindProfession"),
    key: t("key"),
    country: t("country"),
    evidence: t("evidence"),
    evidenceHint: t("evidenceHint"),
    decision: t("decision"),
    recognised: t("recognised"),
    notRecognised: t("notRecognised"),
    validFrom: t("validFrom"),
    validUntil: t("validUntil"),
    note: t("note"),
    submit: t("submit"),
    saving: t("saving"),
    ok: t("ok"),
    needsMigration: t("needsMigration"),
    forbidden: t("forbidden"),
    invalid: t("invalid"),
    error: t("error"),
  };

  return (
    <Card compact>
      <RecordRecognitionForm organizationId={organizationId} learners={read.assignable} labels={labels} />
    </Card>
  );
}
