import "server-only";

import { headers } from "next/headers";

import { clientKeyFromHeaders, rateLimit } from "@/lib/security/rate-limit";

import { AGENCY_BOARD_LIMITS } from "./board-abuse-limits";

async function ipKey(): Promise<string> {
  try {
    return clientKeyFromHeaders(await headers());
  } catch {
    // Outside a request (tests, scripts): one shared bucket, never a pass.
    return "unknown-client";
  }
}

/** Records one board read or offer for this account and IP; true when either is over budget. */
export async function agencyBoardBurstLimited(kind: "read" | "offer", userId: string): Promise<boolean> {
  const ip = await ipKey();
  const account = kind === "read" ? AGENCY_BOARD_LIMITS.readPerAccount : AGENCY_BOARD_LIMITS.offerPerAccount;
  const perIp = kind === "read" ? AGENCY_BOARD_LIMITS.readPerIp : AGENCY_BOARD_LIMITS.offerPerIp;
  const a = rateLimit({ name: `agency-board-${kind}-account`, key: userId || "anonymous", ...account });
  const b = rateLimit({ name: `agency-board-${kind}-ip`, key: ip, ...perIp });
  return a.limited || b.limited;
}
