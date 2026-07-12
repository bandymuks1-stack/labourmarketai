"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  isTransactionalEmailConfigured,
  sendTransactionalEmail,
} from "@/lib/email/transactional";
import {
  buildInviteLink,
  isInvitationType,
  parseEmailList,
  type InvitationType,
} from "@/lib/invitations/model";

/**
 * Canonical invitation server actions (core-network area B).
 *
 * Token custody: the raw token exists ONLY here (minted per address) and in
 * the email / copy-link handed back to the INVITER who minted it. The
 * database stores sha256(token) — a leaked table never leaks a usable link.
 *
 * Delivery truth: an invitation is marked `sent` ONLY after the provider
 * acknowledged the message. Provider not configured → the action returns
 * the link for manual sharing and the delivery state stays `not_sent` —
 * never a fake "Išsiųsta".
 *
 * Degradation: while the owner-gated migration 20260712200000 is not
 * applied, every action returns `needs-migration` (the UI shows the honest
 * not-enabled state; nothing pretends to work).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42883" ||
    /invitations|create_invitation_v1/.test(error.message ?? "")
  );
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mintToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256Hex(token) };
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "labourmarket.ai";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export type InvitationSendOutcome = {
  email: string;
  outcome:
    | "created" // stored; email delivery not configured — share the link
    | "sent" // stored + provider acknowledged the email
    | "delivery_failed" // stored, provider refused — retry with resend
    | "duplicate_pending"
    | "invalid_email"
    | "limit_reached"
    | "rate_limited"
    | "not_authorized"
    | "error";
  invitationId?: string;
  /** The shareable link — returned ONLY to the inviter who minted it. */
  inviteLink?: string;
};

export type CreateInvitationsResult =
  | { status: "needs-migration" }
  | { status: "not-authed" }
  | {
      status: "ok";
      results: InvitationSendOutcome[];
      invalid: readonly string[];
      overflow: readonly string[];
      emailConfigured: boolean;
    };

export async function createAndSendInvitations(input: {
  emails: string;
  invitationType: string;
  locale: string;
  organizationId?: string | null;
  projectId?: string | null;
  invitedName?: string | null;
  proposedRole?: string | null;
  personalMessage?: string | null;
}): Promise<CreateInvitationsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  if (!isInvitationType(input.invitationType)) {
    return { status: "ok", results: [], invalid: [], overflow: [], emailConfigured: false };
  }
  const type: InvitationType = input.invitationType;
  const parsed = parseEmailList(input.emails ?? "");
  const origin = await requestOrigin();
  const emailConfigured = isTransactionalEmailConfigured();
  const results: InvitationSendOutcome[] = [];

  for (const email of parsed.valid) {
    const { token, hash } = mintToken();
    const { data, error } = await asAny(supabase).rpc("create_invitation_v1", {
      p_token_hash: hash,
      p_invitation_type: type,
      p_invited_email: email,
      p_invited_name: input.invitedName ?? null,
      p_organization_id: input.organizationId ?? null,
      p_project_id: input.projectId ?? null,
      p_proposed_role: input.proposedRole ?? null,
      p_personal_message: input.personalMessage ?? null,
      p_locale: input.locale,
    });
    if (error) {
      if (isMissingSchema(error)) return { status: "needs-migration" };
      results.push({ email, outcome: "error" });
      continue;
    }
    const outcome = (data?.outcome ?? "error") as string;
    if (outcome !== "created") {
      results.push({
        email,
        outcome: (
          [
            "duplicate_pending",
            "invalid_email",
            "limit_reached",
            "rate_limited",
            "not_authorized",
          ] as const
        ).includes(outcome as never)
          ? (outcome as InvitationSendOutcome["outcome"])
          : "error",
      });
      continue;
    }
    const invitationId = data.invitation_id as string;
    const inviteLink = buildInviteLink(origin, input.locale, token);

    if (!emailConfigured) {
      results.push({ email, outcome: "created", invitationId, inviteLink });
      continue;
    }

    const sendResult = await sendTransactionalEmail({
      to: email,
      subject: buildSubject(type, input.locale),
      text: buildBody({
        link: inviteLink,
        personalMessage: input.personalMessage ?? null,
        locale: input.locale,
      }),
    });
    const deliveryOutcome =
      sendResult.status === "sent" ? "sent" : "delivery_failed";
    // Record the TRUTHFUL provider result (never 'sent' without an ack).
    await asAny(supabase).rpc("mark_invitation_delivery_v1", {
      p_invitation_id: invitationId,
      p_outcome: deliveryOutcome,
    });
    results.push({
      email,
      outcome: sendResult.status === "sent" ? "sent" : "delivery_failed",
      invitationId,
      inviteLink,
    });
  }

  revalidatePath(`/${input.locale}/dashboard/network`);
  return {
    status: "ok",
    results,
    invalid: parsed.invalid,
    overflow: parsed.overflow,
    emailConfigured,
  };
}

function buildSubject(type: InvitationType, locale: string): string {
  const lt = locale === "lt";
  switch (type) {
    case "join_project":
      return lt
        ? "Kvietimas prisijungti prie projekto — LabourMarket.ai"
        : "Invitation to join a project — LabourMarket.ai";
    case "collaborate_partner":
      return lt
        ? "Kvietimas bendradarbiauti — LabourMarket.ai"
        : "Invitation to collaborate — LabourMarket.ai";
    case "join_platform":
    case "invite_company":
      return lt
        ? "Kvietimas prisijungti prie LabourMarket.ai"
        : "Invitation to join LabourMarket.ai";
    default:
      return lt
        ? "Kvietimas prisijungti prie komandos — LabourMarket.ai"
        : "Invitation to join a team — LabourMarket.ai";
  }
}

function buildBody(input: {
  link: string;
  personalMessage: string | null;
  locale: string;
}): string {
  const lt = input.locale === "lt";
  const lines = [
    lt
      ? "Jus pakvietė prisijungti per LabourMarket.ai."
      : "You have been invited via LabourMarket.ai.",
  ];
  if (input.personalMessage?.trim()) {
    lines.push("", `"${input.personalMessage.trim()}"`);
  }
  lines.push(
    "",
    lt ? "Atidarykite kvietimą:" : "Open the invitation:",
    input.link,
    "",
    lt
      ? "Nuoroda galioja 14 dienų. Jei kvietimo nelaukėte, tiesiog ignoruokite šį laišką."
      : "The link is valid for 14 days. If you were not expecting this, simply ignore this email.",
  );
  return lines.join("\n");
}

export type SimpleInvitationResult =
  | { status: "needs-migration" }
  | { status: "not-authed" }
  | { status: "ok"; outcome: string; inviteLink?: string };

export async function revokeInvitationAction(input: {
  invitationId: string;
  locale: string;
}): Promise<SimpleInvitationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  const { data, error } = await asAny(supabase).rpc("revoke_invitation_v1", {
    p_invitation_id: input.invitationId,
  });
  if (error) {
    return isMissingSchema(error)
      ? { status: "needs-migration" }
      : { status: "ok", outcome: "error" };
  }
  revalidatePath(`/${input.locale}/dashboard/network`);
  return { status: "ok", outcome: data as string };
}

export async function resendInvitationAction(input: {
  invitationId: string;
  email: string;
  locale: string;
  invitationType: string;
  personalMessage?: string | null;
}): Promise<SimpleInvitationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  // Resend ROTATES the token — the previous link stops working.
  const { token, hash } = mintToken();
  const { data, error } = await asAny(supabase).rpc("resend_invitation_v1", {
    p_invitation_id: input.invitationId,
    p_new_token_hash: hash,
  });
  if (error) {
    return isMissingSchema(error)
      ? { status: "needs-migration" }
      : { status: "ok", outcome: "error" };
  }
  if (data !== "ok") return { status: "ok", outcome: data as string };

  const origin = await requestOrigin();
  const inviteLink = buildInviteLink(
    origin,
    input.locale,
    token,
  );
  if (isTransactionalEmailConfigured() && isInvitationType(input.invitationType)) {
    const sendResult = await sendTransactionalEmail({
      to: input.email,
      subject: buildSubject(input.invitationType, input.locale),
      text: buildBody({
        link: inviteLink,
        personalMessage: input.personalMessage ?? null,
        locale: input.locale,
      }),
    });
    await asAny(supabase).rpc("mark_invitation_delivery_v1", {
      p_invitation_id: input.invitationId,
      p_outcome: sendResult.status === "sent" ? "sent" : "delivery_failed",
    });
    revalidatePath(`/${input.locale}/dashboard/network`);
    return {
      status: "ok",
      outcome: sendResult.status === "sent" ? "sent" : "delivery_failed",
      inviteLink,
    };
  }
  revalidatePath(`/${input.locale}/dashboard/network`);
  return { status: "ok", outcome: "created", inviteLink };
}

export async function acceptInvitationAction(input: {
  token: string;
}): Promise<
  | { status: "needs-migration" }
  | { status: "not-authed" }
  | {
      status: "ok";
      outcome: string;
      invitationType?: string;
      projectId?: string | null;
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  const { data, error } = await asAny(supabase).rpc("accept_invitation_v1", {
    p_token: input.token,
  });
  if (error) {
    return isMissingSchema(error)
      ? { status: "needs-migration" }
      : { status: "ok", outcome: "error" };
  }
  return {
    status: "ok",
    outcome: (data?.outcome ?? "error") as string,
    invitationType: data?.invitation_type as string | undefined,
    projectId: (data?.project_id ?? null) as string | null,
  };
}

export async function declineInvitationAction(input: {
  token: string;
}): Promise<SimpleInvitationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  const { data, error } = await asAny(supabase).rpc("decline_invitation_v1", {
    p_token: input.token,
  });
  if (error) {
    return isMissingSchema(error)
      ? { status: "needs-migration" }
      : { status: "ok", outcome: "error" };
  }
  return { status: "ok", outcome: data as string };
}

export async function acceptInvitationByIdAction(input: {
  invitationId: string;
  locale: string;
}): Promise<SimpleInvitationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };
  const { data, error } = await asAny(supabase).rpc(
    "accept_invitation_by_id_v1",
    { p_invitation_id: input.invitationId },
  );
  if (error) {
    return isMissingSchema(error)
      ? { status: "needs-migration" }
      : { status: "ok", outcome: "error" };
  }
  revalidatePath(`/${input.locale}/dashboard/network`);
  return { status: "ok", outcome: (data?.outcome ?? "error") as string };
}
