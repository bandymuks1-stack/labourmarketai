"use server";

import { revalidatePath } from "next/cache";

import {
  saveCustomerSetup,
  type ContactPreference,
  type CustomerType,
} from "./customers";

export type BuyerSetupFormState =
  | { ok: true; customerId: string }
  | { ok: false; code: "needs_migration" | "invalid" | "error"; message?: string };

const CUSTOMER_TYPES: readonly CustomerType[] = [
  "individual",
  "small_business",
  "nonprofit",
  "other",
];

const CONTACT_PREFERENCES: readonly ContactPreference[] = [
  "email",
  "phone",
  "platform_message",
];

function readCustomerType(v: FormDataEntryValue | null): CustomerType {
  const s = (v ?? "").toString();
  return (CUSTOMER_TYPES as readonly string[]).includes(s)
    ? (s as CustomerType)
    : "individual";
}

function readContactPreference(v: FormDataEntryValue | null): ContactPreference {
  const s = (v ?? "").toString();
  return (CONTACT_PREFERENCES as readonly string[]).includes(s)
    ? (s as ContactPreference)
    : "platform_message";
}

export async function saveBuyerSetupAction(
  _prev: BuyerSetupFormState | null,
  formData: FormData,
): Promise<BuyerSetupFormState> {
  const r = await saveCustomerSetup({
    contactName: String(formData.get("contact_name") ?? ""),
    customerType: readCustomerType(formData.get("customer_type")),
    country: formData.get("country")?.toString(),
    market: formData.get("market")?.toString(),
    needSummary: formData.get("need_summary")?.toString(),
    contactPreference: readContactPreference(formData.get("contact_preference")),
    manualReviewNote: formData.get("manual_review_note")?.toString(),
  });

  if (r.kind === "needs-migration") {
    return { ok: false, code: "needs_migration" };
  }
  if (r.kind === "invalid") return { ok: false, code: "invalid", message: r.message };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true, customerId: r.customerId };
}
