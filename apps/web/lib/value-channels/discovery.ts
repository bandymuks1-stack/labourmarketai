/**
 * Channel discovery (V10) — PURE ranking over the eligibility verdicts.
 *
 * `discoverChannels(statement)` returns every channel's option in a stable,
 * FACTUAL order: whether the channel supports the value type at all, whether
 * the stated geography fits, and how actionable the verdict is — nothing
 * else. The ordering is a presentation aid, not a judgement of worth.
 */
import type { ValueStatement } from "@/lib/structuring/value-statement";
import {
  getValueChannel,
  type ValueChannelDescriptorV1,
} from "./channel-registry";
import {
  assessChannelEligibility,
  type ChannelVerdict,
  type ProducibleAuthorityStatus,
} from "./eligibility";

export interface ChannelOption {
  readonly channelId: string;
  readonly verdict: ChannelVerdict;
  readonly missing?: readonly string[];
  readonly destination: string;
  /** Stable key the chat maps to its own localized copy. */
  readonly explanationKey: string;
}

export interface ChannelDiscovery {
  readonly authorityStatus: ProducibleAuthorityStatus;
  readonly options: readonly ChannelOption[];
}

/** Actionability order — factual: a routable option before an informational
 *  one, refusals last. */
const KIND_ORDER: Record<ChannelVerdict["kind"], number> = {
  CAN_ROUTE: 0,
  NEEDS_MORE_INFORMATION: 1,
  LEGAL_CHECK_REQUIRED: 2,
  CHANNEL_RESTRICTED: 3,
  UNSUPPORTED: 4,
};

function geographyFits(
  c: ValueChannelDescriptorV1,
  statement: ValueStatement,
): number {
  if (c.geography === "any") return 0;
  if (statement.country === null) return 1;
  return c.geography.includes(statement.country) ? 0 : 2;
}

export function discoverChannels(
  statement: ValueStatement,
  text?: string,
  authorityStatus: ProducibleAuthorityStatus = "claimed",
): ChannelDiscovery {
  const eligibility = assessChannelEligibility(statement, text, authorityStatus);

  const options = eligibility.verdicts
    .map((verdict): ChannelOption | null => {
      const channel = getValueChannel(verdict.channelId);
      if (!channel) return null;
      return {
        channelId: verdict.channelId,
        verdict,
        missing: verdict.missingFields,
        destination: channel.destination,
        explanationKey: `${verdict.channelId}:${verdict.kind}`,
      };
    })
    .filter((o): o is ChannelOption => o !== null)
    .sort((a, b) => {
      const kind = KIND_ORDER[a.verdict.kind] - KIND_ORDER[b.verdict.kind];
      if (kind !== 0) return kind;
      const ca = getValueChannel(a.channelId)!;
      const cb = getValueChannel(b.channelId)!;
      const geo = geographyFits(ca, statement) - geographyFits(cb, statement);
      if (geo !== 0) return geo;
      // Internal (immediately actionable) before external browse.
      const internal =
        Number(ca.channelType === "external") -
        Number(cb.channelType === "external");
      if (internal !== 0) return internal;
      return a.channelId.localeCompare(b.channelId);
    });

  return { authorityStatus: eligibility.authorityStatus, options };
}
