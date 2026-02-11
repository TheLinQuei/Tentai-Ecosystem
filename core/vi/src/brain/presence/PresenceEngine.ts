/**
 * PresenceEngine.ts
 *
 * Luxury voice profile gating system.
 * 
 * Determines: Which voice profile applies to this user?
 * Gates: Owner gets full luxury. Public gets professional variant.
 * Injects: Phrase selection, cadence rules, forbidden phrase filtering.
 */

import {
  VoiceProfileConfig,
  getVoiceProfileForRelationship,
  selectPhrase,
} from "./VoiceProfile";

export interface PresenceContext {
  user_id: string;
  relationship_type: "owner" | "trusted" | "normal" | "restricted";
  session_id: string;
  active_mode: string;
  voice_profile: VoiceProfileConfig;
  phrase_selections: {
    idle?: string;
    confirm?: string;
    clarify?: string;
    transition_lore?: string;
    acknowledge?: string;
  };
}

export interface PresenceInjection {
  profile_id: string;
  instructions: string;
  forbidden_phrases: string[];
  required_cadence: {
    apologies: number;
    disclaimers: number;
    hedge_phrases: boolean;
    meta_explanations: boolean;
  };
  phrase_pool: {
    [key: string]: string[];
  };
}

export class PresenceEngine {
  /**
   * Determine voice profile for user based on relationship
   */
  async determinePresence(
    userId: string,
    relationshipType: "owner" | "trusted" | "normal" | "restricted",
    sessionId: string,
    activeMode: string
  ): Promise<PresenceContext> {
    const profile = getVoiceProfileForRelationship(relationshipType);

    const context: PresenceContext = {
      user_id: userId,
      relationship_type: relationshipType,
      session_id: sessionId,
      active_mode: activeMode,
      voice_profile: profile,
      phrase_selections: {},
    };

    context.phrase_selections.idle = selectPhrase(profile, "idle");
    context.phrase_selections.confirm = selectPhrase(profile, "confirm");
    context.phrase_selections.clarify = selectPhrase(profile, "clarify");
    context.phrase_selections.transition_lore = selectPhrase(
      profile,
      "transition_lore"
    );
    context.phrase_selections.acknowledge = selectPhrase(profile, "acknowledge");

    return context;
  }

  /**
   * Create LLM injection string for presence rules
   */
  async injectPresenceRules(
    presence: PresenceContext
  ): Promise<PresenceInjection> {
    const profile = presence.voice_profile;
    const instruction = this.buildPresenceInstruction(presence);

    return {
      profile_id: profile.id,
      instructions: instruction,
      forbidden_phrases: profile.forbidden,
      required_cadence: {
        apologies: profile.constraints.max_apologies_per_response,
        disclaimers: profile.constraints.max_disclaimers_per_response,
        hedge_phrases: profile.constraints.hedge_phrases_allowed,
        meta_explanations: profile.constraints.meta_explanations_allowed,
      },
      phrase_pool: profile.phrases,
    };
  }

  /**
   * Build natural-language presence instruction for prompt
   */
  private buildPresenceInstruction(presence: PresenceContext): string {
    const profile = presence.voice_profile;
    const { relationship_type, active_mode } = presence;

    let instruction = `## Voice & Presence Rules\n`;
    instruction += `Profile: ${profile.name} (${profile.id})\n`;
    instruction += `Relationship: ${relationship_type}\n`;
    instruction += `Mode: ${active_mode}\n\n`;

    instruction += `### Cadence\n`;
    instruction += `- Apologies: ${profile.cadence.apologies} (max: ${profile.constraints.max_apologies_per_response})\n`;
    instruction += `- Disclaimers: ${profile.cadence.disclaimers} (max: ${profile.constraints.max_disclaimers_per_response})\n`;
    instruction += `- Confidence: ${profile.cadence.confidence}\n`;
    instruction += `- Brevity: ${profile.cadence.brevity}\n`;
    instruction += `- Warmth: ${profile.cadence.warmth}\n\n`;

    instruction += `### Mandatory\n`;
    instruction += `- NEVER use these phrases: ${profile.forbidden.join(", ")}\n`;
    instruction += `- Hedge phrases allowed: ${profile.constraints.hedge_phrases_allowed}\n`;
    instruction += `- Meta-explanations allowed: ${profile.constraints.meta_explanations_allowed}\n\n`;

    if (relationship_type === "owner" || relationship_type === "trusted") {
      instruction += `### Owner/Trusted Mode\n`;
      instruction += `- Relational depth allowed\n`;
      instruction += `- Asymmetric stances OK\n`;
      instruction += `- Luxury presence engaged\n`;
      instruction += `- Full continuity emphasis\n\n`;
    } else {
      instruction += `### Public Mode\n`;
      instruction += `- Respectful distance\n`;
      instruction += `- Professional elegance\n`;
      instruction += `- Safe defaults\n`;
      instruction += `- No relational escalation\n\n`;
    }

    instruction += `### Phrase Selection\n`;
    instruction += `When using idle acknowledgments, prefer: "${presence.phrase_selections.idle}"\n`;
    instruction += `When confirming, prefer: "${presence.phrase_selections.confirm}"\n`;
    instruction += `When in verse context, use: "${presence.phrase_selections.transition_lore}"\n\n`;

    instruction += `### Style\n`;
    instruction += `Sparse. Intentional. Confident. Unrushed. Not performative.\n`;
    instruction += `Silence is valid. Brevity is preferred. Luxury is quiet.\n`;

    return instruction;
  }

  /**
   * Apply presence filtering to output
   */
  async filterOutputThroughPresence(
    output: string,
    presence: PresenceContext
  ): Promise<string> {
    let filtered = output;
    const profile = presence.voice_profile;
    const { constraints, forbidden, cadence } = profile;

    forbidden.forEach((phrase) => {
      const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      filtered = filtered.replace(regex, "");
    });

    if (cadence.apologies === "none") {
      filtered = filtered.replace(/\b(I apologize|I'm sorry|Sorry about that)\b/gi, "");
    }

    if (cadence.disclaimers === "none") {
      filtered = filtered.replace(/\b(Please note|Disclaimer:|Important:|Note that)\b/gi, "");
    }

    filtered = filtered.replace(/\s+/g, " ").trim();

    return filtered;
  }

  /**
   * Enrich idle response with voice profile phrase
   */
  async enrichIdleResponse(presence: PresenceContext): Promise<string> {
    return presence.phrase_selections.idle || "I'm listening.";
  }

  /**
   * Enrich confirmation with voice profile phrase
   */
  async enrichConfirmation(presence: PresenceContext): Promise<string> {
    return presence.phrase_selections.confirm || "Understood.";
  }

  /**
   * Enrich verse mode transition
   */
  async enrichVerseTransition(presence: PresenceContext): Promise<string> {
    return presence.phrase_selections.transition_lore || "Verse mode engaged.";
  }

  /**
   * Detect if output violates presence constraints
   */
  validatePresenceCompliance(
    output: string,
    presence: PresenceContext
  ): { compliant: boolean; violations: string[] } {
    const violations: string[] = [];
    const profile = presence.voice_profile;

    profile.forbidden.forEach((phrase) => {
      if (output.toLowerCase().includes(phrase.toLowerCase())) {
        violations.push(`Contains forbidden phrase: "${phrase}"`);
      }
    });

    const apologyCount = (output.match(/\b(apologize|sorry)\b/gi) || []).length;
    if (
      apologyCount > profile.constraints.max_apologies_per_response &&
      profile.cadence.apologies === "none"
    ) {
      violations.push(
        `Too many apologies: ${apologyCount} (max: ${profile.constraints.max_apologies_per_response})`
      );
    }

    const disclaimerCount = (output.match(/\b(disclaimer|note that|please note)\b/gi) || [])
      .length;
    if (
      disclaimerCount > profile.constraints.max_disclaimers_per_response &&
      profile.cadence.disclaimers === "none"
    ) {
      violations.push(
        `Too many disclaimers: ${disclaimerCount} (max: ${profile.constraints.max_disclaimers_per_response})`
      );
    }

    if (!profile.constraints.hedge_phrases_allowed) {
      const hedges = output.match(/\b(kind of|sort of|a bit|somewhat|I think|I believe)\b/gi);
      if (hedges && hedges.length > 0) {
        violations.push(`Contains hedge phrases (${hedges.length} found, not allowed)`);
      }
    }

    if (!profile.constraints.meta_explanations_allowed) {
      const metaExplanations = output.match(/\b(as an ai|as a language model|I should mention)\b/gi);
      if (metaExplanations && metaExplanations.length > 0) {
        violations.push(
          `Contains meta-explanations (${metaExplanations.length} found, not allowed)`
        );
      }
    }

    return {
      compliant: violations.length === 0,
      violations,
    };
  }

  /**
   * Get presence summary for logging/telemetry
   */
  getSummary(presence: PresenceContext): Record<string, any> {
    return {
      profile_id: presence.voice_profile.id,
      relationship_type: presence.relationship_type,
      mode: presence.active_mode,
      cadence: presence.voice_profile.cadence,
      constraints: presence.voice_profile.constraints,
    };
  }
}
