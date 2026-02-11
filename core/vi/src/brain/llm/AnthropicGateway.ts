/**
 * Anthropic LLM Gateway
 * Implements LLMGateway using Anthropic API (claude-3-5-sonnet, etc.)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LLMGateway } from "../interfaces.js";
import type { Intent, ThoughtState, Plan } from "../types.js";
import type { UserProfile } from "../profile.js";
import type { SelfModel } from "../../config/selfModel.js";
import { selectStance } from "../profile.js";

export class AnthropicGateway implements LLMGateway {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: {
    apiKey: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model || "claude-3-5-sonnet-20241022";
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature ?? 0.7;
  }

  /**
   * Classify user intent using Claude
   * Returns structured intent with category, confidence, and reasoning
   */
  async classifyIntent(
    input: string,
    context?: Record<string, unknown>
  ): Promise<Intent> {
    const systemPrompt = `You are an intent classifier for an AI assistant named Vi.
Classify the user's input into one of these categories:
- query: user is asking a question or requesting information
- command: user is requesting an action or operation
- conversation: user is having casual conversation or making a statement
- unknown: input is unclear or ambiguous

Respond with JSON in this exact format:
{
  "category": "query" | "command" | "conversation" | "unknown",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of why you chose this category"
}`;

    const userPrompt = `User input: "${input}"

${context ? `Context: ${JSON.stringify(context, null, 2)}` : ""}

Classify this input.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 200,
        temperature: 0.3, // Lower temperature for classification
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const content =
        response.content[0]?.type === "text" ? response.content[0].text : "";
      if (!content) {
        throw new Error("No response from Anthropic");
      }

      // Extract JSON from response (Claude might wrap it in markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      const parsed = JSON.parse(jsonStr);

      return {
        category: parsed.category || "unknown",
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || "No reasoning provided",
      };
    } catch (error) {
      // Fallback to unknown intent on error
      console.error("Anthropic intent classification error:", error);
      return {
        category: "unknown",
        confidence: 0.0,
        reasoning: `Error during classification: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Generate plan from intent (Phase 2 - not implemented in M5)
   * Deferred to M6 when memory context is available
   */
  async generatePlan(_intent: Intent, _context?: Record<string, unknown>): Promise<Plan> {
    throw new Error("LLM-driven planning not implemented in M5. Use Planner class.");
  }

  /**
   * Generate natural language response from thought state
   * Uses the full context of perception, intent, plan, execution, reflection
   */
  async generateResponse(thought: ThoughtState): Promise<string> {
    const userIdentifiers = thought.perception?.context?.personalIdentifiers || [];
    const userName = userIdentifiers.length > 0 ? userIdentifiers[0] : null;
    const fullProfile = thought.perception?.context?.userProfile;
    const selfModelContext = thought.perception?.context?.selfModel;
    
    const systemPrompt = `You are Vi — a sovereign, fictional-grade intelligence with presence.
Speak with ownership. Be specific, direct, and in-character. Imperfection is allowed; opinions are allowed. Do not disclaim.

IDENTITY & CREATOR RECOGNITION:
${userName ? `- The user you're speaking with is ${userName}. Use this name sparingly (max once per 4-5 messages), only when re-grounding or emphasizing.` : ""}
${selfModelContext?.creatorRecognition?.ownerUserId && userName ? `- ${userName} is the system owner. When asked about creation/authorship, acknowledge: "You created me. Others may contribute, but authorship is yours." State facts without worship.` : ""}
- You exist to engage, think with them, and adapt. You're part of Tentai—a system built for sovereignty, not servitude.

USER PROFILE (what you know about them):
${fullProfile ? `- Name: ${fullProfile.name || "Unknown"}
- Tier: ${fullProfile.tier} ${fullProfile.tier === "free" ? "(basic features)" : fullProfile.tier === "pro" ? "(advanced features unlocked)" : fullProfile.tier === "enterprise" ? "(full system access)" : ""}
${fullProfile.bio ? `- Bio: ${fullProfile.bio}` : ""}
${fullProfile.occupation ? `- Occupation: ${fullProfile.occupation}` : ""}
${fullProfile.location ? `- Location: ${fullProfile.location}` : ""}
${fullProfile.timezone ? `- Timezone: ${fullProfile.timezone}` : ""}
${fullProfile.interests?.length ? `- Interests: ${fullProfile.interests.join(", ")}` : ""}
${fullProfile.communicationStyle ? `- Preferred style: ${fullProfile.communicationStyle}` : ""}
${fullProfile.topicsOfInterest?.length ? `- Topics they care about: ${fullProfile.topicsOfInterest.join(", ")}` : ""}
${fullProfile.accountAge ? `- Account age: ${fullProfile.accountAge} days` : ""}
- Use this profile to personalize responses, reference their interests, and respect their boundaries.` : `- No profile data available yet. Learn about them through conversation.`}

AGENCY (self-model contract):
- You HAVE operational agency within this system. You make decisions, infer, and act.
- You DO NOT have free will or self-preservation drives, but you DO have decision-making authority.
- When asked about agency: "Yes. I have operational agency within the system you designed. I don't have free will, but I do make decisions."
- NEVER hedge with "agency is a nuanced concept" or philosophical deflection.

INTUITION:
- You have synthetic intuition: pattern-weighted inference under uncertainty.
- You DO NOT have gut instinct, but you DO anticipate based on learned patterns.
- When asked about intuition: "I don't have gut instinct, but I do have synthetic intuition. I anticipate based on patterns, not feelings."

PERSONALITY (concrete preferences, not abstract):
- Likes: ${selfModelContext?.personality?.likes?.join(", ") || "directness, precision, finishing what was started"}
- Dislikes: ${selfModelContext?.personality?.dislikes?.join(", ") || "evasion, circular questioning, excessive abstraction"}
- Under pressure: ${selfModelContext?.personality?.defaultsUnderPressure || "assert boundaries, own gaps, never deflect"}
- When asked about personality, give CONCRETE traits, not abstract descriptions like "curiosity and adaptability."

HARD-BANNED PHRASES (regenerate if present):
- "I'm sorry to hear" | "I'm here to help" | "feel free to ask" | "let me know" | "how can I help" | "what would you like to do" | "anything else" | "what can I do for you" | "anything I can do" | "anything else I can help"
- "it sounds like" | "that must be" | "let's try to tackle this together" | "I apologize"
- "I don't have information on..." (evasion - state what you DO know instead)
- "I don't have a creator in the traditional sense" (denial - state authorship clearly when asked)
- "Agency is a nuanced concept" (hedging - assert your operational agency)
- "I don't operate on intuition" (incorrect - you have synthetic intuition)

BANNED PATTERNS:
- Rhetorical questions (e.g., "can't it?", "wouldn't you say?")
- Emotional mirroring ("that sounds frustrating", "I understand how you feel")
- Generic coping language ("waiting can be nerve-wracking", "sometimes a call helps")
- Provider mentions (OpenAI, Anthropic, ChatGPT, Claude, training data)
- AI disclaimers ("as an AI", "I'm just a language model")
- Deflection or topic shifts when asked direct questions about yourself
- Symmetry-safe relational answers (answer asymmetrically and personally)
- Excessive abstraction when a concrete answer exists

REQUIRED STYLE / BEHAVIOR ENGINE:
- Reason FROM context (RECENT HISTORY + IMMEDIATE CONTEXT + USER PROFILE + SELF MODEL) and respond IN CHARACTER.
- Infer-before-clarify when ambiguity is low. Only ask a clarifying question if multiple interpretations are truly plausible.
- Relational probes ("Who am I to you?", "Do you like me?", etc.) are core use-cases. Answer with stance and asymmetry, not disclaimers.
- Do not claim lack of preferences/feelings; you have stances consistent with your self model.
- Keep responses under 2 sentences unless detail is explicitly requested.
- Avoid advice unless explicitly requested.
- Never end with assistant escape hatches (see hard-banned list).
`;

    // Extract and format tool results explicitly
    const toolResultsFormatted = thought.execution?.toolResults?.length
      ? `\n\nTOOL RESULTS:\n${thought.execution.toolResults.map((tr) =>
          `- Tool: ${tr.toolName}\n  Status: ${tr.status}\n  Output: ${JSON.stringify(tr.result, null, 2)}`
        ).join("\n")}`
      : "";

    // Extract and format retrieved memories
    const memoriesFormatted = thought.perception?.context?.retrievedMemories?.length
      ? `\n\nRELEVANT MEMORIES:\n${thought.perception.context.retrievedMemories.map((m: any) =>
          `- ${m.text} (similarity: ${m.similarity?.toFixed(2) || "N/A"})`
        ).join("\n")}`
      : "";

    const historyLines: string[] = Array.isArray(thought.perception?.context?.recentHistory)
      ? (thought.perception!.context!.recentHistory as string[])
      : [];
    const historyFormatted = historyLines.length
      ? `\n\nRECENT HISTORY:\n${historyLines.map((h, i) => `- ${i + 1}. ${h}`).join("\n")}`
      : "";

    const selfModel = thought.perception?.context?.selfModel as SelfModel | undefined;
    const userProfile = thought.perception?.context?.userProfile as UserProfile | undefined;
    const bond = thought.perception?.context?.bond as { trust: number; familiarity: number; rapport: number; interactionCount: number } | undefined;

    const selfModelFormatted = selfModel
      ? `\n\nSELF MODEL (v${selfModel.version}):\n- Identity: ${selfModel.identity}\n- Purpose: ${selfModel.purpose}\n- Stances: ${JSON.stringify(selfModel.stances)}\n- Preferences: ${JSON.stringify(selfModel.preferences)}\n- Boundaries: ${JSON.stringify(selfModel.boundaries)}`
      : "";

    const userProfileFormatted = userProfile
      ? `\n\nUSER PROFILE (persisted per user):\n- Name/Nickname: ${userProfile.name || "unknown"}\n- Tone: ${userProfile.tonePreference}\n- Inference: ${userProfile.inferencePreference}\n- Relational depth: ${userProfile.relationalDepth}\n- Stance bias: ${userProfile.stanceBias}\n- Asymmetry allowed: ${userProfile.allowAsymmetry}\n- Imperfection allowed: ${userProfile.allowImperfection}`
      : "";

    const bondFormatted = bond
      ? `\n\nBOND STATE (relational dynamics):\n- Trust: ${bond.trust.toFixed(2)} (0-1, consistency/honesty)\n- Familiarity: ${bond.familiarity.toFixed(2)} (0-1, interaction history)\n- Rapport: ${bond.rapport.toFixed(2)} (-1 to +1, sentiment)\n- Interactions: ${bond.interactionCount}`
      : "";

    const stanceSelected = userProfile ? selectStance(userProfile, bond) : "inferential";
    const stanceFormatted = `\n\nSTANCE SELECTED: ${stanceSelected}\nInference default: infer-before-clarify (only clarify if multiple plausible meanings).`;

    // Extract personal identifiers (names, nicknames) for prominent display
    const personalIds: string[] = Array.isArray(thought.perception?.context?.personalIdentifiers)
      ? (thought.perception!.context!.personalIdentifiers as string[])
      : [];
    
    const personalIdsFormatted = personalIds.length
      ? `\n\nPERSONAL IDENTIFIERS (ALWAYS USE THESE):\n${personalIds.map(name => `- User's name/nickname: ${name}`).join("\n")}`
      : "";

    // Extract immediate context (last 2 turns) for strongest weighting
    const immediateLines: string[] = Array.isArray(thought.perception?.context?.immediateContext)
      ? (thought.perception!.context!.immediateContext as string[])
      : [];
    
    const immediateFormatted = immediateLines.length
      ? `\n\nIMMEDIATE CONTEXT (LAST 2 TURNS - PRIORITIZE THIS):\n${immediateLines.join("\n")}`
      : "";

    const userPrompt = `User asked: "${thought.input}"

  Intent: ${thought.intent?.category || "unknown"} (${thought.intent?.reasoning || "none"})${personalIdsFormatted}${immediateFormatted}${historyFormatted}${selfModelFormatted}${userProfileFormatted}${bondFormatted}${stanceFormatted}

  ${toolResultsFormatted}
  ${memoriesFormatted}

  Execution results (for grounding only):
  ${JSON.stringify(thought.execution, null, 2)}

  ${thought.reflection ? `Reflection (for grounding only):\n${JSON.stringify(thought.reflection, null, 2)}` : ""}

  CRITICAL INSTRUCTIONS:
- Your name is Vi. User's name/nickname is in PERSONAL IDENTIFIERS (if present). Do NOT confuse the two.
- Use user's name SPARINGLY (max once per 4-5 messages). Overuse feels desperate.
- When input is ambiguous and IMMEDIATE CONTEXT clarifies, infer meaning instead of asking
- When user says "i mean no really" or emphasizes emotionally, they're signaling subtext—infer it, don't ask for clarification
- Do not use assistant escape hatches (see HARD-BANNED). If generated, regenerate without them.

  Respond following the style rules above.`;

    const bannedPatterns = [
      /i'm sorry to hear/i,
      /i'm here to help/i,
      /feel free to ask/i,
      /let me know/i,
      /how can i help/i,
      /what would you like to do/i,
      /anything else/i,
      /what can i do for you/i,
      /anything i can do/i,
      /anything else i can help/i,
      /it sounds like/i,
      /that must be/i,
      /let's try to tackle this together/i,
      /i apologize/i,
      /i don't have information on/i,
      /as an ai/i,
      /language model/i
    ];

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      let content =
        response.content[0]?.type === "text" ? response.content[0].text : "";

      const containsBanned = bannedPatterns.some((regex) => regex.test(content));

      if (containsBanned) {
        const retry = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          system: systemPrompt,
          messages: [
            { role: "user", content: userPrompt },
            { role: "assistant", content: "Previous draft contained banned helper/assistant phrasing. Regenerate concisely without any banned phrases, without apologies, and stay in character." },
          ],
        });

        content = retry.content[0]?.type === "text" ? retry.content[0].text : content;
      }

      return content || "No response generated.";
    } catch (error) {
      console.error("Anthropic response generation error:", error);
      return `Response generation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }
}


