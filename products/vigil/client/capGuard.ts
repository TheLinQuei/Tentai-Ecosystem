// src/core/capGuard.ts
import type { Client } from "discord.js";
import { probeCapabilities } from "./capabilities";
import { getChannelFlag, getUserOptOut } from "./consent";

export type GuardContext = {
  client: Client;
  channelId: string;
  guildId?: string | null;
  authorId: string;
  sawImage?: boolean;
};

export async function capGuard(ctx: GuardContext, outgoing: string): Promise<string> {
  const caps = await probeCapabilities(ctx.client);
  const analysisOn = await getChannelFlag(ctx.channelId, "analysisEnabled", true);
  const userOptOut = await getUserOptOut(ctx.authorId, "analysisOptOut");

  // Replace known lazy disclaimers with truthful variants
  outgoing = outgoing
    .replace(/I can'?t (see|look at) images( directly)?\.?/gi, () => {
      if (!caps.aiProviderConfigured) return "My AI analysis isn’t configured in this build.";
      if (!caps.visionEnabled) return "I can receive images; visual analysis is currently disabled.";
      return "I can see and analyze images here when appropriate.";
    })
    .replace(/I can'?t see who'?s in the server\.?/gi, () => {
      return caps.hasGuildMembersIntent
        ? "I can access member info where my role permits."
        : "Member visibility is limited without the Guild Members intent.";
    });

  // Respect per-user / per-channel analysis preference
  if (!analysisOn || userOptOut) {
    // If the message promises analysis, tone it down
    outgoing = outgoing.replace(/I (will|can) analyze (this|that) image/gi,
      "Analysis is off for you or this channel.");
  }

  // Helpful hint only when we *saw* an image and analysis is possible
  if (ctx.sawImage && caps.aiProviderConfigured && caps.visionEnabled && analysisOn && !userOptOut) {
    if (!/opt-?out/i.test(outgoing)) {
      outgoing += "\n\n_(Say “opt-out analysis” to disable me analyzing your attachments.)_";
    }
  }

  return outgoing;
}
