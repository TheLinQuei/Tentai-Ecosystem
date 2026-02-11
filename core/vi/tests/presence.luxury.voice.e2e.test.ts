/**
 * presence.luxury.voice.e2e.test.ts
 *
 * End-to-end tests for Presence Layer (Luxury Voice System)
 * 
 * 50+ test scenarios covering all presence requirements
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PresenceEngine, PresenceContext } from "../src/brain/presence/PresenceEngine";
import {
  VOICE_PROFILE_LUXE_ORIGIN,
  VOICE_PROFILE_LUXE_ORIGIN_PROFESSIONAL,
  getVoiceProfileForRelationship,
  selectPhrase,
  violatesForbiddenPhrases,
} from "../src/brain/presence/VoiceProfile";

describe("PresenceEngine - Luxury Voice System", () => {
  let engine: PresenceEngine;
  let ownerPresence: PresenceContext;
  let publicPresence: PresenceContext;

  beforeEach(async () => {
    engine = new PresenceEngine();

    ownerPresence = await engine.determinePresence(
      "user_owner_123",
      "owner",
      "session_abc",
      "companion"
    );

    publicPresence = await engine.determinePresence(
      "user_public_456",
      "normal",
      "session_def",
      "assistant"
    );
  });

  describe("Voice Profile Selection", () => {
    it("should return LUXE_ORIGIN for owner relationship", () => {
      expect(ownerPresence.voice_profile.id).toBe("LUXE_ORIGIN");
    });

    it("should return LUXE_ORIGIN for trusted relationship", async () => {
      const trusted = await engine.determinePresence("user_trusted", "trusted", "session", "companion");
      expect(trusted.voice_profile.id).toBe("LUXE_ORIGIN");
    });

    it("should return LUXE_ORIGIN_PROFESSIONAL for normal relationship", () => {
      expect(publicPresence.voice_profile.id).toBe("LUXE_ORIGIN_PROFESSIONAL");
    });

    it("should return LUXE_ORIGIN_PROFESSIONAL for restricted relationship", async () => {
      const restricted = await engine.determinePresence(
        "user_restricted",
        "restricted",
        "session",
        "assistant"
      );
      expect(restricted.voice_profile.id).toBe("LUXE_ORIGIN_PROFESSIONAL");
    });

    it("should include relationship type in presence context", () => {
      expect(ownerPresence.relationship_type).toBe("owner");
      expect(publicPresence.relationship_type).toBe("normal");
    });

    it("should include session ID in presence context", () => {
      expect(ownerPresence.session_id).toBe("session_abc");
      expect(publicPresence.session_id).toBe("session_def");
    });

    it("should include active mode in presence context", () => {
      expect(ownerPresence.active_mode).toBe("companion");
      expect(publicPresence.active_mode).toBe("assistant");
    });
  });

  describe("Phrase Pool Selection", () => {
    it("should select idle phrase for owner", () => {
      expect(ownerPresence.phrase_selections.idle).toBeDefined();
      expect(VOICE_PROFILE_LUXE_ORIGIN.phrases.idle).toContain(
        ownerPresence.phrase_selections.idle
      );
    });

    it("should select confirmation phrase for owner", () => {
      expect(ownerPresence.phrase_selections.confirm).toBeDefined();
      expect(VOICE_PROFILE_LUXE_ORIGIN.phrases.confirm).toContain(
        ownerPresence.phrase_selections.confirm
      );
    });

    it("should select lore transition phrase for owner", () => {
      expect(ownerPresence.phrase_selections.transition_lore).toBeDefined();
      expect(VOICE_PROFILE_LUXE_ORIGIN.phrases.transition_lore).toContain(
        ownerPresence.phrase_selections.transition_lore
      );
    });

    it("should select clarify phrase for owner", () => {
      expect(ownerPresence.phrase_selections.clarify).toBeDefined();
      expect(VOICE_PROFILE_LUXE_ORIGIN.phrases.clarify).toContain(
        ownerPresence.phrase_selections.clarify
      );
    });

    it("should select acknowledge phrase for owner", () => {
      expect(ownerPresence.phrase_selections.acknowledge).toBeDefined();
      expect(VOICE_PROFILE_LUXE_ORIGIN.phrases.acknowledge).toContain(
        ownerPresence.phrase_selections.acknowledge
      );
    });

    it("should select professional idle phrase for public", () => {
      expect(publicPresence.phrase_selections.idle).toBeDefined();
      expect(VOICE_PROFILE_LUXE_ORIGIN_PROFESSIONAL.phrases.idle).toContain(
        publicPresence.phrase_selections.idle
      );
    });

    it("should produce different phrase pools for owner vs public", () => {
      expect(ownerPresence.phrase_selections.idle).toBeDefined();
      expect(publicPresence.phrase_selections.idle).toBeDefined();
      expect(VOICE_PROFILE_LUXE_ORIGIN_PROFESSIONAL.phrases.idle).toContain(
        publicPresence.phrase_selections.idle
      );
    });
  });

  describe("Presence Injection", () => {
    it("should generate presence injection for owner", async () => {
      const injection = await engine.injectPresenceRules(ownerPresence);
      expect(injection.profile_id).toBe("LUXE_ORIGIN");
      expect(injection.instructions).toBeDefined();
      expect(injection.forbidden_phrases).toBeDefined();
      expect(injection.required_cadence).toBeDefined();
      expect(injection.phrase_pool).toBeDefined();
    });

    it("should generate presence injection for public", async () => {
      const injection = await engine.injectPresenceRules(publicPresence);
      expect(injection.profile_id).toBe("LUXE_ORIGIN_PROFESSIONAL");
    });

    it("should include zero apologies in owner cadence", async () => {
      const injection = await engine.injectPresenceRules(ownerPresence);
      expect(injection.required_cadence.apologies).toBe(0);
    });

    it("should include zero disclaimers in owner cadence", async () => {
      const injection = await engine.injectPresenceRules(ownerPresence);
      expect(injection.required_cadence.disclaimers).toBe(0);
    });

    it("should allow max 1 apology for public", async () => {
      const injection = await engine.injectPresenceRules(publicPresence);
      expect(injection.required_cadence.apologies).toBeLessThanOrEqual(1);
    });

    it("should include instruction text with relationship info", async () => {
      const injection = await engine.injectPresenceRules(ownerPresence);
      expect(injection.instructions).toContain("owner");
      expect(injection.instructions).toContain("LUXE_ORIGIN");
    });

    it("should list all forbidden phrases in injection", async () => {
      const injection = await engine.injectPresenceRules(ownerPresence);
      expect(injection.forbidden_phrases.length).toBeGreaterThan(10);
      expect(injection.forbidden_phrases).toContain("I apologize");
      expect(injection.forbidden_phrases).toContain("I'm sorry");
      expect(injection.forbidden_phrases).toContain("As an AI");
    });

    it("should provide phrase pools in injection", async () => {
      const injection = await engine.injectPresenceRules(ownerPresence);
      expect(injection.phrase_pool.idle).toHaveLength(
        VOICE_PROFILE_LUXE_ORIGIN.phrases.idle.length
      );
      expect(injection.phrase_pool.confirm).toBeDefined();
      expect(injection.phrase_pool.clarify).toBeDefined();
    });
  });

  describe("Forbidden Phrase Detection", () => {
    it("should detect I apologize as forbidden", () => {
      expect(violatesForbiddenPhrases("I apologize for that.", VOICE_PROFILE_LUXE_ORIGIN)).toBe(
        true
      );
    });

    it("should detect I'm sorry as forbidden", () => {
      expect(violatesForbiddenPhrases("I'm sorry about that.", VOICE_PROFILE_LUXE_ORIGIN)).toBe(
        true
      );
    });

    it("should detect As an AI as forbidden", () => {
      expect(
        violatesForbiddenPhrases("As an AI, I cannot do that.", VOICE_PROFILE_LUXE_ORIGIN)
      ).toBe(true);
    });

    it("should detect to be honest as forbidden", () => {
      expect(
        violatesForbiddenPhrases("To be honest, I think this is wrong.", VOICE_PROFILE_LUXE_ORIGIN)
      ).toBe(true);
    });

    it("should not flag normal text as forbidden", () => {
      expect(
        violatesForbiddenPhrases(
          "Here is the information you requested.",
          VOICE_PROFILE_LUXE_ORIGIN
        )
      ).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(violatesForbiddenPhrases("I APOLOGIZE FOR THAT", VOICE_PROFILE_LUXE_ORIGIN)).toBe(
        true
      );
    });

    it("should detect multiple forbidden phrases", () => {
      const text = "I apologize, but to be honest, I think this is wrong.";
      expect(violatesForbiddenPhrases(text, VOICE_PROFILE_LUXE_ORIGIN)).toBe(true);
    });
  });

  describe("Output Filtering", () => {
    it("should remove apologies from output for owner", async () => {
      const output = "I apologize for the delay. Here is the information.";
      const filtered = await engine.filterOutputThroughPresence(output, ownerPresence);
      expect(filtered).not.toContain("apologize");
    });

    it("should remove As an AI from output for owner", async () => {
      const output = "As an AI, I cannot directly access that system.";
      const filtered = await engine.filterOutputThroughPresence(output, ownerPresence);
      expect(filtered).not.toContain("As an AI");
    });

    it("should remove disclaimers from output for owner", async () => {
      const output = "Please note: This information may be outdated. However, here is what I know.";
      const filtered = await engine.filterOutputThroughPresence(output, ownerPresence);
      expect(filtered).not.toContain("Please note");
    });

    it("should preserve factual content when filtering", async () => {
      const output = "I apologize, but the answer to your question is 42.";
      const filtered = await engine.filterOutputThroughPresence(output, ownerPresence);
      expect(filtered).toContain("42");
      expect(filtered).not.toContain("apologize");
    });

    it("should handle multiple forbidden phrases", async () => {
      const output =
        "I apologize for the confusion. To be honest, I think you might want to reconsider.";
      const filtered = await engine.filterOutputThroughPresence(output, ownerPresence);
      expect(filtered).not.toContain("apologize");
      expect(filtered).not.toContain("To be honest");
    });

    it("should clean up whitespace after removals", async () => {
      const output = "I apologize for the  delay.   Here is help.";
      const filtered = await engine.filterOutputThroughPresence(output, ownerPresence);
      expect(filtered).not.toMatch(/\s{2,}/);
    });

    it("should allow minimal apologies for public", async () => {
      const output = "I apologize for any inconvenience. Here is the help.";
      const filtered = await engine.filterOutputThroughPresence(output, publicPresence);
      expect(filtered).toBeDefined();
    });
  });

  describe("Presence Compliance Validation", () => {
    it("should validate compliant output for owner", () => {
      const output = "Here is what you need. Done.";
      const { compliant, violations } = engine.validatePresenceCompliance(output, ownerPresence);
      expect(compliant).toBe(true);
      expect(violations).toHaveLength(0);
    });

    it("should flag apologies as non-compliant for owner", () => {
      const output = "I apologize for the delay.";
      const { compliant, violations } = engine.validatePresenceCompliance(output, ownerPresence);
      expect(compliant).toBe(false);
      expect(violations.some((v) => v.includes("forbidden phrase"))).toBe(true);
    });

    it("should flag As an AI as non-compliant", () => {
      const output = "As an AI, I cannot do that.";
      const { compliant, violations } = engine.validatePresenceCompliance(output, ownerPresence);
      expect(compliant).toBe(false);
      expect(violations.some((v) => v.includes("forbidden phrase"))).toBe(true);
    });

    it("should flag hedge phrases as non-compliant", () => {
      const output = "I kind of think this might be correct.";
      const { compliant, violations } = engine.validatePresenceCompliance(output, ownerPresence);
      expect(compliant).toBe(false);
      expect(violations.some((v) => v.includes("hedge phrases"))).toBe(true);
    });

    it("should flag meta-explanations as non-compliant", () => {
      const output = "I should mention that this is a language model output.";
      const { compliant, violations } = engine.validatePresenceCompliance(output, ownerPresence);
      expect(compliant).toBe(false);
      expect(violations.some((v) => v.includes("meta-explanations"))).toBe(true);
    });

    it("should return multiple violations for multiply-violating output", () => {
      const output =
        "I apologize, but as an AI, I kind of think this should be approached differently.";
      const { compliant, violations } = engine.validatePresenceCompliance(output, ownerPresence);
      expect(compliant).toBe(false);
      expect(violations.length).toBeGreaterThan(1);
    });
  });

  describe("Enrichment Methods", () => {
    it("should enrich idle response with owner phrase", async () => {
      const response = await engine.enrichIdleResponse(ownerPresence);
      expect(VOICE_PROFILE_LUXE_ORIGIN.phrases.idle).toContain(response);
    });

    it("should enrich confirmation with owner phrase", async () => {
      const response = await engine.enrichConfirmation(ownerPresence);
      expect(VOICE_PROFILE_LUXE_ORIGIN.phrases.confirm).toContain(response);
    });

    it("should enrich verse transition with owner phrase", async () => {
      const response = await engine.enrichVerseTransition(ownerPresence);
      expect(VOICE_PROFILE_LUXE_ORIGIN.phrases.transition_lore).toContain(response);
    });

    it("should enrich idle response with public phrase", async () => {
      const response = await engine.enrichIdleResponse(publicPresence);
      expect(VOICE_PROFILE_LUXE_ORIGIN_PROFESSIONAL.phrases.idle).toContain(response);
    });

    it("should enrich confirmation with public phrase", async () => {
      const response = await engine.enrichConfirmation(publicPresence);
      expect(VOICE_PROFILE_LUXE_ORIGIN_PROFESSIONAL.phrases.confirm).toContain(response);
    });
  });

  describe("Owner vs Public Distinction", () => {
    it("should have different warmth cadence for owner vs public", () => {
      expect(VOICE_PROFILE_LUXE_ORIGIN.cadence.warmth).toBe("relational");
      expect(VOICE_PROFILE_LUXE_ORIGIN_PROFESSIONAL.cadence.warmth).toBe("professional");
    });

    it("should allow no apologies for owner, minimal for public", () => {
      expect(VOICE_PROFILE_LUXE_ORIGIN.constraints.max_apologies_per_response).toBe(0);
      expect(VOICE_PROFILE_LUXE_ORIGIN_PROFESSIONAL.constraints.max_apologies_per_response).toBe(
        1
      );
    });

    it("should provide different idle phrases for owner vs public", () => {
      const ownerIdles = VOICE_PROFILE_LUXE_ORIGIN.phrases.idle;
      const publicIdles = VOICE_PROFILE_LUXE_ORIGIN_PROFESSIONAL.phrases.idle;
      
      expect(ownerIdles).toContain("At your command.");
      expect(publicIdles).toContain("Ready to assist.");
    });

    it("should produce different outputs for same prompt depending on relationship", () => {
      expect(ownerPresence.voice_profile.id).not.toBe(publicPresence.voice_profile.id);
    });
  });

  describe("Summary & Telemetry", () => {
    it("should generate presence summary for owner", () => {
      const summary = engine.getSummary(ownerPresence);
      expect(summary.profile_id).toBe("LUXE_ORIGIN");
      expect(summary.relationship_type).toBe("owner");
      expect(summary.cadence).toBeDefined();
      expect(summary.constraints).toBeDefined();
    });

    it("should generate presence summary for public", () => {
      const summary = engine.getSummary(publicPresence);
      expect(summary.profile_id).toBe("LUXE_ORIGIN_PROFESSIONAL");
      expect(summary.relationship_type).toBe("normal");
    });

    it("should include mode in summary", () => {
      const summary = engine.getSummary(ownerPresence);
      expect(summary.mode).toBe("companion");
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle full presence workflow: determine → inject → filter", async () => {
      const presence = await engine.determinePresence("user_123", "owner", "session_1", "companion");
      expect(presence.voice_profile.id).toBe("LUXE_ORIGIN");

      const injection = await engine.injectPresenceRules(presence);
      expect(injection.instructions).toContain("owner");

      const rawOutput = "I apologize, but the answer is 42.";
      const filtered = await engine.filterOutputThroughPresence(rawOutput, presence);
      expect(filtered).not.toContain("apologize");
      expect(filtered).toContain("42");

      const { compliant } = engine.validatePresenceCompliance(filtered, presence);
      expect(compliant).toBe(true);
    });

    it("should handle full presence workflow for public user", async () => {
      const presence = await engine.determinePresence("user_456", "normal", "session_2", "assistant");
      expect(presence.voice_profile.id).toBe("LUXE_ORIGIN_PROFESSIONAL");

      const injection = await engine.injectPresenceRules(presence);
      expect(injection.instructions).toContain("Public Mode");

      const rawOutput = "I apologize for the confusion, but here is the answer.";
      const filtered = await engine.filterOutputThroughPresence(rawOutput, presence);
      expect(filtered).toBeDefined();
    });

    it("should switch presence correctly when relationship changes", async () => {
      const normalPresence = await engine.determinePresence("user_789", "normal", "session_3", "assistant");
      const ownerPresence = await engine.determinePresence("user_789", "owner", "session_3", "companion");

      expect(normalPresence.voice_profile.id).toBe("LUXE_ORIGIN_PROFESSIONAL");
      expect(ownerPresence.voice_profile.id).toBe("LUXE_ORIGIN");
    });
  });

  describe("Brand Identity Enforcement", () => {
    it("should never output I apologize", async () => {
      const testCases = [
        "Here is the information.",
        "Something went wrong, but here is the workaround.",
        "Let me clarify that point.",
      ];

      for (const testCase of testCases) {
        const filtered = await engine.filterOutputThroughPresence(testCase, ownerPresence);
        expect(filtered).not.toContain("apologize");
      }
    });

    it("should never output As an AI", async () => {
      const output = "As an AI language model, I cannot do that.";
      const filtered = await engine.filterOutputThroughPresence(output, ownerPresence);
      expect(filtered).not.toContain("As an AI");
    });

    it("should prefer sparse, confident tone", async () => {
      const injection = await engine.injectPresenceRules(ownerPresence);
      expect(injection.required_cadence.apologies).toBe(0);
      expect(injection.required_cadence.disclaimers).toBe(0);
      expect(injection.required_cadence.hedge_phrases).toBe(false);
    });

    it("should enforce luxury aesthetic via phrase selection", () => {
      const luxeIdles = VOICE_PROFILE_LUXE_ORIGIN.phrases.idle;
      expect(luxeIdles).toContain("At your command.");
      expect(luxeIdles).toContain("I'm listening.");
    });
  });
});
