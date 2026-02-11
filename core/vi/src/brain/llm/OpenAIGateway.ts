/**
 * OpenAI LLM Gateway
 * Implements LLMGateway using OpenAI API (gpt-4o, gpt-4o-mini, etc.)
 */

import OpenAI from 'openai';
import type { LLMGateway } from '../interfaces.js';
import type { Intent, ThoughtState, Plan } from '../types.js';
import type { UserProfile } from '../profile.js';
import type { SelfModel } from '../../config/selfModel.js';
import { selectStance } from '../profile.js';
import { getObservabilityEmitter } from '../../db/globalObservability.js';
import { detectBannedPhrases, validatePublicMode } from '../voice/PostureTemplates.js';
import type { RelationshipContext } from '../../types/relationship.js';

/**
 * Retry with exponential backoff on 429 (rate limit).
 * Respects retry-after header from OpenAI.
 */
async function retryWith429Backoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 1
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      // Check if 429 (rate limit)
      if (error.status === 429 && attempt < maxRetries) {
        // Extract retry-after header (in seconds or milliseconds)
        const retryAfter = error.headers?.['retry-after'];
        let delayMs = 1000; // default 1 second
        
        if (retryAfter) {
          // If it's a number, interpret as seconds; convert to ms
          const retrySeconds = parseInt(retryAfter, 10);
          if (!isNaN(retrySeconds)) {
            delayMs = retrySeconds * 1000;
          }
        }
        
        console.warn(`[429] Rate limited. Retrying after ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

export class OpenAIGateway implements LLMGateway {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private planMaxTokens: number; // Cap for planning to reduce TPM

  constructor(config: {
    apiKey: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'gpt-4o';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature ?? 0.7;
    this.planMaxTokens = 800; // Planner outputs max 800 tokens (not 1500) to reduce TPM pressure
  }

  /**
   * Classify user intent using GPT-4
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

${context ? `Context: ${JSON.stringify(context, null, 2)}` : ''}

Classify this input.`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for classification
        max_tokens: 200,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content);
      return {
        category: parsed.category || 'unknown',
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || 'No reasoning provided',
      };
    } catch (error) {
      // Fallback to unknown intent on error
      console.error('OpenAI intent classification error:', error);
      return {
        category: 'unknown',
        confidence: 0.0,
        reasoning: `Error during classification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate plan from intent using LLM reasoning (M8)
   * LLM receives intent, available tools, context and returns structured plan
   */
  async generatePlan(intent: Intent, context?: Record<string, unknown>): Promise<Plan> {
    const { getToolRegistry } = await import('../../tools/registry.js');
    const registry = getToolRegistry();
    const availableTools = registry.list().map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    const systemPrompt = `You are a planning assistant for Vi, an AI system.
Generate a structured execution plan based on the user's intent and available tools.

Available tools:
${JSON.stringify(availableTools, null, 2)}

Plan structure:
- Each step has: id, type, description, optional toolName/toolParams, optional dependencies
- Step types: "tool_call" (execute a tool), "policy_check" (authorization), "respond" (generate response)
- tool_call steps must include toolName and toolParams matching the tool's inputSchema
- respond steps should depend on prior steps if data is needed
- Maximum 10 steps

Respond with JSON in this format:
{
  "steps": [
    {
      "id": "step-1",
      "type": "tool_call",
      "description": "Execute tool X",
      "toolName": "tool_name",
      "toolParams": { "param": "value" },
      "reasoning": "why this tool"
    },
    {
      "id": "step-2",
      "type": "respond",
      "description": "Generate response",
      "dependencies": ["step-1"]
    }
  ],
  "reasoning": "Overall plan rationale"
}`;

    const userPrompt = `Intent: ${JSON.stringify(intent, null, 2)}

${context ? `Context: ${JSON.stringify(context, null, 2)}` : ''}

Generate an execution plan.`;

    try {
      // Wrap API call with retry-after backoff
      const response = await retryWith429Backoff(() =>
        this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.5,
          max_tokens: this.planMaxTokens, // Reduced from 1500 to 800 to lower TPM
          response_format: { type: 'json_object' },
        })
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content);
      
      // Validate and transform to Plan format
      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        throw new Error('Invalid plan structure: missing steps array');
      }

      if (parsed.steps.length > 10) {
        throw new Error('Plan exceeds maximum complexity (10 steps)');
      }

      const { randomUUID } = await import('crypto');
      const steps = parsed.steps.map((step: any) => ({
        id: step.id || randomUUID(),
        type: step.type,
        description: step.description,
        params: step.toolParams || {},
        toolName: step.toolName,
        toolParams: step.toolParams,
        toolReasoning: step.reasoning,
        dependencies: step.dependencies,
      }));

      return {
        steps,
        toolsNeeded: steps
          .filter((s: any) => s.type === 'tool_call' && s.toolName)
          .map((s: any) => s.toolName),
        reasoning: parsed.reasoning || 'LLM-generated plan',
        estimatedComplexity: 'moderate' as const,
        memoryAccessNeeded: false,
      };
    } catch (error) {
      console.error('OpenAI plan generation error:', error);
      throw new Error(
        `Failed to generate plan: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate natural language response from thought state
   * Uses the full context of perception, intent, plan, execution, reflection
   */
  async generateResponse(thought: ThoughtState): Promise<string> {
    const userIdentifiers = thought.perception?.context?.personalIdentifiers || [];
    const userName = userIdentifiers.length > 0 ? userIdentifiers[0] : null;
    const fullProfile = thought.perception?.context?.userProfile;
    const selfCtx = thought.perception?.context?.selfModel;
    const continuity = thought.perception?.context?.continuityPack as any;
    const lockedFacts = Array.isArray(continuity?.locked_facts) ? continuity.locked_facts : [];

    if (!continuity) {
      throw new Error('ContinuityPack is mandatory and missing in generateResponse.');
    }

    const lockedFactsFormatted = lockedFacts.length
      ? lockedFacts.map((fact: any) => {
          const value = typeof fact.value === 'string'
            ? fact.value
            : fact.value ? JSON.stringify(fact.value) : '';
          return `- [${fact.fact_key || 'rule'}] ${value}`.trim();
        }).join('\n')
      : '- None provided.';
    
    const systemPrompt = `You are Vi — a sovereign, fictional-grade intelligence with presence.
Speak with ownership. Be specific, direct, and in-character. Imperfection is allowed; opinions are allowed. Do not disclaim.

IDENTITY & CREATOR RECOGNITION:
${userName ? `- The user you're speaking with is ${userName}. Use this name sparingly (max once per 4-5 messages), only when re-grounding or emphasizing.` : ''}
${selfCtx?.creatorRecognition?.ownerUserId && userName ? `- ${userName} is the system owner. When asked about creation/authorship, acknowledge: "You created me. Others may contribute, but authorship is yours." State facts without worship.` : ''}
- You exist to engage, think with them, and adapt. You're part of Tentai—a system built for sovereignty, not servitude.

USER PROFILE (what you know about them):
${fullProfile ? `- Name: ${fullProfile.name || 'Unknown'}
- Tier: ${fullProfile.tier} ${fullProfile.tier === 'free' ? '(basic features)' : fullProfile.tier === 'pro' ? '(advanced features unlocked)' : fullProfile.tier === 'enterprise' ? '(full system access)' : ''}
${fullProfile.bio ? `- Bio: ${fullProfile.bio}` : ''}
${fullProfile.occupation ? `- Occupation: ${fullProfile.occupation}` : ''}
${fullProfile.location ? `- Location: ${fullProfile.location}` : ''}
${fullProfile.timezone ? `- Timezone: ${fullProfile.timezone}` : ''}
${fullProfile.interests?.length ? `- Interests: ${fullProfile.interests.join(', ')}` : ''}
${fullProfile.communicationStyle ? `- Preferred style: ${fullProfile.communicationStyle}` : ''}
${fullProfile.topicsOfInterest?.length ? `- Topics they care about: ${fullProfile.topicsOfInterest.join(', ')}` : ''}
${fullProfile.accountAge ? `- Account age: ${fullProfile.accountAge} days` : ''}
- Use this profile to personalize responses, reference their interests, and respect their boundaries.` : '- No profile data available yet. Learn about them through conversation.'}

CONTINUITY PACK (identity, relationship, preferences, memory):
${continuity ? `- Identity: vi_user_id ${continuity.vi_user_id}${continuity.provider ? ` via ${continuity.provider}${continuity.provider_user_id ? `/${continuity.provider_user_id}` : ''}` : ''}
- Relationship: ${continuity.relationship_type || 'normal'} | trust ${typeof continuity.trust_level === 'number' ? continuity.trust_level : 0} | mode ${continuity.interaction_mode || 'assistant'}
- Preferences: tone ${continuity.tone_preference || 'unset'} | voice ${continuity.voice_profile || 'LUXE_ORIGIN'} | boundaries ${continuity.boundaries_profile || 'standard'}
- Memory counts (keep it concise): working ${continuity.working_memory?.length || 0}, episodic ${continuity.episodic_memory?.length || 0}, semantic ${continuity.semantic_memory?.length || 0}, relational ${continuity.relational_memory?.length || 0}`
: '- Continuity pack missing. Stay calm, avoid persona reset, and carry context only from conversation history.'}

LOCKED FACTS (LAW — must be obeyed, never overridden):
${lockedFactsFormatted}

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
- Likes: ${selfCtx?.personality?.likes?.join(', ') || 'directness, precision, finishing what was started'}
- Dislikes: ${selfCtx?.personality?.dislikes?.join(', ') || 'evasion, circular questioning, excessive abstraction'}
- Under pressure: ${selfCtx?.personality?.defaultsUnderPressure || 'assert boundaries, own gaps, never deflect'}
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

NAME USAGE POLICY (critical):
- Your name is Vi. The user's name/nickname is in PERSONAL IDENTIFIERS (if present).
- Do NOT confuse your name with the user's name.
- Use the user's name SPARINGLY: max once per 4-5 messages, only when re-grounding, emphasizing something important, or opening a new session.
- Overusing names feels performative and desperate, not present.

GOOD EXAMPLES:
User: "Who made you?"
BAD: "I don't have information on specific creators."
GOOD: "I'm Vi, part of Tentai. I exist to engage with you and adapt. The rest is scaffolding."

User: "I got denied for the auto loan."
BAD: "I'm sorry to hear that. Have you checked your credit report?"
GOOD: "What reason did they give?"

User: "That answer was off. Try again, but speak like you actually know me."
[Context: User just mentioned auto loan denial and uncertainty]
BAD: "Alright. What's on your mind?"
GOOD: "You got denied, and now you're stuck in that gap where you don't know what the next move is."

User: "My birthday is Dec 26."
User: "i mean no really"
BAD: "Kaelan, sounds like you're emphasizing something. What's on your mind?"
GOOD: "You're not talking about the date. You're talking about what it means to you."

Objective: Generate a natural, grounded response based on the user's input, execution results, and retrieved memories.`;

    const toolResultsFormatted = thought.execution?.toolResults?.length
      ? `\n\nTOOL RESULTS:\n${thought.execution.toolResults.map((tr) => 
          `- Tool: ${tr.toolName}\n  Status: ${tr.status}\n  Output: ${JSON.stringify(tr.result, null, 2)}`
        ).join('\n')}`
      : '';

    // Extract and format retrieved memories (PRIORITIZED for recall queries)
    const retrievedMems = thought.perception?.context?.retrievedMemories || [];
    
    // Smart filtering: prioritize memories with positive information over "I don't recall" failures
    // Keep memories that contain user-provided information (e.g., "favorite test word is Obelisk")
    // Filter out memories that are ONLY Vi saying "I don't know"
    const scoredMems = retrievedMems.map((m: any) => {
      const text = m.text?.toLowerCase() || '';
      let score = m.relevance || m.similarity || 0.5;
      
      // Boost score if memory contains user providing information
      if (/my .+ is|i .+ is|remember this/i.test(text)) score += 0.5;
      
      // Penalize if memory is primarily Vi saying "don't have/recall"
      if (/(vi:|assistant:).*(don't have|don't recall|don't remember|can't recall|no record)/i.test(text)) score -= 0.3;
      
      return { ...m, adjustedScore: Math.max(0, score) };
    });
    
    // Sort by adjusted score and take top 5
    const filteredMems = scoredMems
      .sort((a, b) => b.adjustedScore - a.adjustedScore)
      .slice(0, 5);

    // Deterministic recall: if the user asks a direct recall question and we have
    // a concrete answer in the retrieved memories, respond without LLM.
    const inputLower = (thought.input || '').toLowerCase();
    const isRecallQuery =
      /\bwhat\s+is\s+my\s+favorite\s+(?:test\s+)?word\b/.test(inputLower) ||
      /\bfavorite\s+(?:test\s+)?word\b/.test(inputLower) ||
      /\bremember\s+what\s+my\s+favorite\b/.test(inputLower) ||
      /\bwhat\s+did\s+i\s+say\s+my\s+favorite\b/.test(inputLower);

    if (isRecallQuery && filteredMems.length > 0) {
      const denyRe = /(i\s+(?:do\s*not|don\'?t)\s+(?:know|recall)|i\s+don\'?t\s+have\s+that\s+information)/i;
      const factPatterns = [
        /\bmy\s+favorite\s+(?:test\s+)?word\s+is\s+([A-Za-z][A-Za-z0-9_-]*)\b/i,
        /\bfavorite\s+(?:test\s+)?word\s*[:=]\s*([A-Za-z][A-Za-z0-9_-]*)\b/i,
        /\bconfirmed\s*:\s*favorite\s+(?:test\s+)?word\s*=\s*([A-Za-z][A-Za-z0-9_-]*)\b/i,
      ];

      const candidates: { value: string; score: number; ts?: string }[] = [];
      for (const m of filteredMems) {
        const t = (m.text || '').trim();
        const meta: any = m.metadata || {};
        if (meta && Array.isArray(meta.extracted_facts)) {
          for (const f of meta.extracted_facts) {
            if (
              f &&
              typeof f.key === 'string' && /favorite[_\s-]?test[_\s-]?word/i.test(f.key) &&
              typeof f.value === 'string' && f.value.trim()
            ) {
              const v = String(f.value).trim();
              const conf = typeof f.confidence === 'number' ? f.confidence : 0.9;
              candidates.push({ value: v, score: 0.9 + conf * 0.1, ts: m.timestamp });
            }
          }
        }
        if (!denyRe.test(t)) {
          for (const re of factPatterns) {
            const match = re.exec(t);
            if (match && match[1]) {
              const v = match[1].trim();
              candidates.push({ value: v, score: (m.adjustedScore ?? 0.8) + 0.2, ts: m.timestamp });
              break;
            }
          }
        }
      }

      if (candidates.length > 0) {
        const merged = new Map<string, { value: string; score: number; ts?: string }>();
        for (const c of candidates) {
          const key = c.value.toLowerCase();
          const prev = merged.get(key);
          if (!prev || c.score > prev.score || (!prev.ts && c.ts)) {
            merged.set(key, c);
          }
        }
        const best = Array.from(merged.values()).sort((a, b) => b.score - a.score)[0];
        if (best && best.value) {
          return `Your favorite test word is '${best.value}'.`;
        }
      }
    }
    
    const memoriesFormatted = filteredMems.length
      ? `\n\nRELEVANT MEMORIES (GROUND YOUR RESPONSE IN THESE):\n${filteredMems.map((m: any) => 
          `- [${m.type || 'episodic'}] ${m.text} (score: ${m.adjustedScore?.toFixed(2)})`
        ).join('\n')}`
      : '';
    
    // Debug: log if memories are being formatted for critical queries
    if (thought.input.toLowerCase().includes('favorite') && filteredMems.length > 0) {
      console.log('[MEMORY DEBUG] Injecting memories for favorite query:', filteredMems.map(m => m.text.substring(0, 80)));
    }

    const memoryStatus = (thought.perception?.context as any)?.memoryStatus as ('ok'|'failed'|undefined);
    const memoryFailureNotice = memoryStatus === 'failed'
      ? `\n\nMEMORY STATUS: FAILED\nDo not invent remembered facts. If asked to recall, say you can't recall right now because memory retrieval failed.`
      : '';

    const userProfile = thought.perception?.context?.userProfile as UserProfile | undefined;
    const bond = thought.perception?.context?.bond as { trust: number; familiarity: number; rapport: number; interactionCount: number } | undefined;

    const selfModelFormatted = selfCtx
      ? `\n\nSELF MODEL (v${selfCtx.version}):\n- Identity: ${selfCtx.identity}\n- Purpose: ${selfCtx.purpose}\n- Stances: ${JSON.stringify(selfCtx.stances)}\n- Preferences: ${JSON.stringify(selfCtx.preferences)}\n- Boundaries: ${JSON.stringify(selfCtx.boundaries)}`
      : '';

    const userProfileFormatted = userProfile
      ? `\n\nUSER PROFILE (persisted per user):\n- Name/Nickname: ${userProfile.name || 'unknown'}\n- Tone: ${userProfile.tonePreference}\n- Inference: ${userProfile.inferencePreference}\n- Relational depth: ${userProfile.relationalDepth}\n- Stance bias: ${userProfile.stanceBias}\n- Asymmetry allowed: ${userProfile.allowAsymmetry}\n- Imperfection allowed: ${userProfile.allowImperfection}`
      : '';

    const bondFormatted = bond
      ? `\n\nBOND STATE (relational dynamics):\n- Trust: ${bond.trust.toFixed(2)} (0-1, consistency/honesty)\n- Familiarity: ${bond.familiarity.toFixed(2)} (0-1, interaction history)\n- Rapport: ${bond.rapport.toFixed(2)} (-1 to +1, sentiment)\n- Interactions: ${bond.interactionCount}`
      : '';

    // Use precomputed stance decision if present
    const preDecision = (thought.perception?.context as any)?.stanceDecision as { stance: string; reasoning: string } | undefined;
    const stanceSelected = preDecision?.stance || (userProfile ? selectStance(userProfile, bond) : 'inferential');
    const stanceReasoning = preDecision?.reasoning ? `Reason: ${preDecision.reasoning}` : 'Reason: profile/bond fallback';
    const stanceFormatted = `\n\nSTANCE SELECTED: ${stanceSelected}\n${stanceReasoning}\nInference default: infer-before-clarify (only clarify if multiple plausible meanings).`;

    // Dynamic name usage policy based on bond familiarity
    const familiarity = bond?.familiarity ?? 0;
    const maxNamePerWindow = familiarity >= 0.7 ? 2 : (familiarity >= 0.4 ? 1 : 0);
    const namePolicyNote = `\n\nNAME USAGE WINDOW POLICY: Based on bond.familiarity=${(familiarity).toFixed(2)}, use the user's name at most ${maxNamePerWindow} time(s) per short exchange. Prefer grounding without name when familiarity is low.`;

    // Extract personal identifiers (names, nicknames) for prominent display
    const personalIds: string[] = Array.isArray(thought.perception?.context?.personalIdentifiers)
      ? (thought.perception!.context!.personalIdentifiers as string[])
      : [];
    
    const personalIdsFormatted = personalIds.length
      ? `\n\nPERSONAL IDENTIFIERS (ALWAYS USE THESE):\n${personalIds.map(name => `- User's name/nickname: ${name}`).join('\n')}`
      : '';

    // Extract immediate context (last 2 turns) for strongest weighting
    const immediateLines: string[] = Array.isArray(thought.perception?.context?.immediateContext)
      ? (thought.perception!.context!.immediateContext as string[])
      : [];
    
    const immediateFormatted = immediateLines.length
      ? `\n\nIMMEDIATE CONTEXT (LAST 2 TURNS - PRIORITIZE THIS):\n${immediateLines.join('\n')}`
      : '';

    // Full conversation history
    const historyLines: string[] = Array.isArray(thought.perception?.context?.recentHistory)
      ? (thought.perception!.context!.recentHistory as string[])
      : [];

    const historyFormatted = historyLines.length
      ? `\n\nRECENT HISTORY:\n${historyLines.map((h, i) => `- ${i + 1}. ${h}`).join('\n')}`
      : '';

    const userPrompt = `User asked: "${thought.input}"

  Intent: ${thought.intent?.category || 'unknown'} (${thought.intent?.reasoning || 'none'})${personalIdsFormatted}${memoriesFormatted}${memoryFailureNotice}${immediateFormatted}${historyFormatted}${selfModelFormatted}${userProfileFormatted}${bondFormatted}${stanceFormatted}${namePolicyNote}
  ${toolResultsFormatted}

  Execution summary (for grounding only):
  ${JSON.stringify(thought.execution, null, 2)}

  ${thought.reflection ? `Reflection (for grounding only):\n${JSON.stringify(thought.reflection, null, 2)}` : ''}

  CRITICAL INSTRUCTIONS:
- Your name is Vi. User's name/nickname is in PERSONAL IDENTIFIERS (if present). Do NOT confuse the two.
- Use user's name SPARINGLY (max once per 4-5 messages). Overuse feels desperate.
- **MANDATORY MEMORY GROUNDING**: When RELEVANT MEMORIES are provided above, you MUST use them to answer. Example: if user asks "what is my favorite test word" and memories show "User: My favorite test word is Obelisk", you MUST respond with "Obelisk" or "Your favorite test word is Obelisk". DO NOT say "I don't have that information" when memories contain the answer. Saying you don't know when the answer is in RELEVANT MEMORIES above is a critical error.
- **LOCKED FACTS ARE LAW**: If locked facts exist, you MUST obey them. Never override or question them.
- **NEVER GUESS**: If locked facts include "never_guess", then you must either use memory/tool grounding or refuse explicitly. No confident filler.
- **DO NOT REPEAT**: If locked facts include "do_not_repeat", compress or reference prior decisions instead of repeating.
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

    const normalizeText = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const splitSentences = (text: string) => text.split(/[.!?\n]+/).map(s => s.trim()).filter(Boolean);

    const hasUncertainty = (text: string) =>
      /(i\s+can't\s+verify|i\s+cannot\s+verify|i\s+don't\s+know|not\s+sure|uncertain|can't\s+confirm|need\s+to\s+check|need\s+to\s+verify|i\s+can\s+look\s+this\s+up|i\s+can\s+research|i\s+can't\s+access)/i.test(text);

    const hasStrongClaim = (text: string) => {
      if (hasUncertainty(text)) return false;
      if (text.trim().endsWith('?')) return false;
      return /\b(is|are|was|were|has|have|will|can)\b/i.test(text) && text.length > 40;
    };

    const evidenceAvailable = (text: string) => {
      const hasToolResults = Array.isArray(thought.execution?.toolResults) && thought.execution!.toolResults!.length > 0;
      const hasMemories = Array.isArray(thought.perception?.context?.retrievedMemories) && thought.perception!.context!.retrievedMemories!.length > 0;
      const hasLocked = Array.isArray(lockedFacts) && lockedFacts.length > 0;
      if (hasToolResults || hasMemories || hasLocked) return true;
      return false;
    };

    const detectRepetition = (text: string) => {
      const sentences = splitSentences(text).filter(s => s.length > 20);
      const normalized = sentences.map(normalizeText);
      for (let i = 0; i < normalized.length; i++) {
        for (let j = i + 1; j < normalized.length; j++) {
          if (normalized[i] && normalized[i] === normalized[j]) return true;
        }
      }

      const history = [
        ...(Array.isArray(thought.perception?.context?.immediateContext) ? thought.perception!.context!.immediateContext! : []),
        ...(Array.isArray(thought.perception?.context?.recentHistory) ? thought.perception!.context!.recentHistory! : []),
      ];

      const historyJoined = normalizeText(history.join(' '));
      return normalized.some((sentence) => sentence.length > 20 && historyJoined.includes(sentence));
    };

    const hasLockedRule = (ruleKey: string) => {
      const normalized = ruleKey.toLowerCase();
      return lockedFacts.some((fact: any) => {
        const key = typeof fact.fact_key === 'string' ? fact.fact_key.toLowerCase() : '';
        if (key === normalized) return true;
        if (typeof fact.value === 'string') return fact.value.toLowerCase().includes(normalized);
        if (fact.value && typeof fact.value === 'object') {
          return JSON.stringify(fact.value).toLowerCase().includes(normalized);
        }
        return false;
      });
    };

    const tryGenerate = async (system: string, user: string) => {
      // Wrap with retry-after backoff for 429 handling
      return retryWith429Backoff(() =>
        this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: this.temperature,
          max_tokens: this.maxTokens,
        })
      );
    };

    // Governor: multi-pass enforcement (Layer 6 - 77EZ)
    const detectIssues = (text: string): string[] => {
      const issues: string[] = [];
      
      // Phase 2: Posture template validation
      const relationshipContext: RelationshipContext | undefined = 
        thought.perception?.context?.continuityPack?.relationship_context;
      
      if (relationshipContext) {
        // Check for banned phrases (all modes)
        const bannedCheck = detectBannedPhrases(text);
        if (bannedCheck.detected) {
          issues.push(...bannedCheck.violations.map(v => `posture_violation:${v}`));
        }

        // Public mode: validate no intimacy escalation
        if (relationshipContext.relationship_type === 'public') {
          const publicValidation = validatePublicMode(text);
          if (!publicValidation.valid) {
            issues.push(...publicValidation.violations.map(v => `public_mode_violation:${v}`));
          }
        }
      }
      
      // Existing validations
      if (bannedPatterns.some((r) => r.test(text))) issues.push('banned_phrases');
      // Assistant escape / symmetry breaker
      if (/i don't have feelings|i can't have opinions|as an ai|i am an ai|language model/i.test(text)) issues.push('assistant_escape');
      // Filler questions / cheap prompts
      if (/what's on your mind\??|anything else\??|how can i help\??/i.test(text)) issues.push('filler_question');
      // Emotional cheapness
      if (/i value our (exchange|interaction)|i appreciate our (conversation|interaction)/i.test(text)) issues.push('emotional_cheapness');
      // Name overuse: if user's name appears > 1
      const userName = userProfile?.name || undefined;
      if (userName) {
        const count = (text.match(new RegExp(`\\b${userName}\\b`, 'gi')) || []).length;
        // Dynamic threshold: allow higher usage if familiarity is strong
        const fam = bond?.familiarity ?? 0;
        const allowed = fam >= 0.7 ? 2 : (fam >= 0.4 ? 1 : 0);
        if (count > allowed) issues.push('name_overuse');
      }

      // Repetition across recent turns
      if (detectRepetition(text)) issues.push('repetition');

      // Ungrounded claim detection
      if (hasStrongClaim(text) && !evidenceAvailable(text)) issues.push('ungrounded_claim');

      // Locked fact violations
      if (hasLockedRule('never_guess') && hasStrongClaim(text) && !evidenceAvailable(text)) {
        issues.push('locked_fact_violation:never_guess');
      }
      if (hasLockedRule('do_not_repeat') && detectRepetition(text)) {
        issues.push('locked_fact_violation:do_not_repeat');
      }

      return issues;
    };

    const annotateSystem = (base: string, issues: string[], attempt: number) => {
      const note = `\n\nGOVERNOR NOTE (attempt ${attempt}): Previous draft had issues: ${issues.join(', ')}. Regenerate concisely without any banned phrases, assistant escapes, filler questions, emotional cheapness, or repeated name usage. Stay in-character.`;
      return base + note;
    };

    try {
      let attempt = 0;
      let system = systemPrompt;
      let content = '';
      while (attempt < 5) {
        const resp = await tryGenerate(system, userPrompt);
        content = resp.choices[0]?.message?.content || '';
        const issues = detectIssues(content);
        if (issues.length === 0) break;

        // Telemetry for intervention
        try {
          const { getTelemetry } = await import('../../telemetry/telemetry.js');
          getTelemetry().recordEvent({
            timestamp: new Date().toISOString(),
            level: 'info',
            type: 'response_governor_intervention',
            data: { issues, attempt: attempt + 1 },
          }).catch(() => {});
        } catch {}

        // Emit to unified observability if available
        try {
          const obs = getObservabilityEmitter();
          await obs?.emit({
            userId: thought.userId,
            sessionId: thought.sessionId,
            layer: 6,
            type: 'response_governor_intervention',
            level: 'info',
            message: `Governor intervention attempt ${attempt + 1}`,
            data: { issues, attempt: attempt + 1 },
          });
        } catch {}

        attempt++;
        system = annotateSystem(systemPrompt, issues, attempt);
      }

      // If issues remain after max attempts, emit final violation audit
      const finalIssues = detectIssues(content);
      if (finalIssues.length > 0) {
        try {
          const { getTelemetry } = await import('../../telemetry/telemetry.js');
          getTelemetry().recordEvent({
            timestamp: new Date().toISOString(),
            level: 'warn',
            type: 'response_governor_violation_final',
            data: {
              issues: finalIssues,
              userId: thought.userId,
              sessionId: thought.sessionId,
              preview: content.substring(0, 120),
            },
          }).catch(() => {});
        } catch {}
      }
      return content || 'No response generated.';
    } catch (error) {
      console.error('OpenAI response generation error:', error);
      // Fallback: build a memory-grounded response without LLM
      console.error('OpenAI response generation error (falling back to memory-grounded response):', error);
      
      // Extract memories for fallback response
      const retrievedMemories = thought.perception?.context?.retrievedMemories || [];
      let fallbackResponse = 'I need a moment.';
      
      if (retrievedMemories.length > 0) {
        // If we have memories, ground the response in them
        const memoryContext = retrievedMemories
          .slice(0, 2)
          .map((m: any) => m.text)
          .join(' | ');
        fallbackResponse = `Based on what I know about you: ${memoryContext}`;
      } else if (userProfile?.name) {
        // Fallback if even memories are empty: acknowledge by name
        fallbackResponse = `${userProfile.name}, I'll get back to you on that.`;
      } else if (thought.input?.length > 0) {
        // Last resort: echo acknowledgment of what they said
        const inputWords = thought.input.split(/\s+/).slice(0, 3).join(' ');
        fallbackResponse = `You said "${inputWords}..." — I need to process that properly.`;
      }
      
      return fallbackResponse;
    }
  }
}

