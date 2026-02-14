import OpenAI from 'openai';
import type { FastifyBaseLogger } from 'fastify';
import type { Observation } from './observer.js';
import type { RetrievedContext } from './retriever.js';
import type { SkillGraph } from './skillGraph.js';
import { PlanSchema, StepSchema, type Plan, normalizeArgs } from './planner.js';
import { setEmotion } from './emotion.js';
import { buildPromptWithEngine } from './promptEngine.js';
import { resolveGuildIntent } from './utils/guildIntentMap.js';
import type { IntentDecision } from './intents/types.js';
import type { IdentityZone, IdentityProfile, AddressingChoice } from './identity.js';
import { chooseAddressing } from './identity.js';
import { prepareLog } from './utils/logContract.js';

// Lazy-load OpenAI client to allow dotenv to run first
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY 
    });
  }
  return client;
}

const model = process.env.LLM_MODEL || 'gpt-4o-mini';

/**
 * Apply intent gating to a plan based on the intent decision
 * - Strict: Hard filter to allowlist (fallback to message.send if empty)
 * - Soft: Log when planner goes outside allowlist
 * - None: No filtering
 */
function applyIntentGating(
  plan: Plan,
  obs: Observation,
  intent: IntentDecision,
  log: FastifyBaseLogger
): Plan {
  const allowlist = intent.allowedTools ?? [];
  const gating = intent.gating;

  if (gating === 'strict' && allowlist.length > 0) {
    const filteredSteps = plan.steps.filter(step =>
      allowlist.includes(step.tool) || step.tool === 'message.send'
    );

    if (filteredSteps.length === 0) {
      // If nothing survives, fall back to a safe message.send
      return {
        ...plan,
        steps: [
          {
            tool: 'message.send',
            args: {
              channelId: obs.channelId,
              content:
                "I understand what you're asking, but that action isn't available in this context.",
            },
            reason: 'Strict intent gating blocked all tools; returned safe message instead.',
            confidence: 0.9,
          },
        ],
        reasoning: plan.reasoning + ' | Strict gating: original steps blocked, fallback message.send used.',
      };
    } else {
      return {
        ...plan,
        steps: filteredSteps,
        reasoning: plan.reasoning + ' | Strict gating: filtered steps to allowed tools.',
      };
    }
  } else if (gating === 'soft' && allowlist.length > 0) {
    // Soft gating: allow all steps, but log when planner goes outside allowlist
    const outside = plan.steps
      .map(s => s.tool)
      .filter(t => !allowlist.includes(t) && t !== 'message.send');

    if (outside.length > 0) {
      log.info(
        prepareLog('PlannerLLM', {
          observationId: obs.id,
          outsideTools: outside,
          allowedTools: allowlist,
          message: 'Planner: soft gating – plan uses tools outside suggested allowlist'
        })
      );
    }
  }

  return plan;
}

export async function planLLM(
  obs: Observation,
  context: RetrievedContext,
  log: FastifyBaseLogger,
  skillGraph: SkillGraph,
  intent: IntentDecision,
  identity?: {
    identityZone: IdentityZone;
    identityProfile: IdentityProfile;
  }
): Promise<Plan> {
  // Phase D.1: identity is passed through, planner can start using it in prompts later.
  // For now, it's safe to treat `identity` as optional.

  // Deterministic mock mode for replay/testing: bypass network and return stable plans
  if ((process.env.LLM_MODEL || '').toLowerCase() === 'mock') {
    const content = obs.content.toLowerCase();
    if (content.includes('weather') && !content.match(/\b(in|at|for)\b.+/)) {
      return {
        steps: [
          {
            tool: 'message.send',
            args: { channelId: obs.channelId, content: 'What location would you like weather for?' },
            reason: 'Ask for missing location'
          }
        ],
        reasoning: 'Deterministic mock: weather query missing location'
      };
    }
    return {
      steps: [
        {
          tool: 'message.send',
          args: { channelId: obs.channelId, content: 'Hi! ✨' },
          reason: 'Deterministic mock greeting'
        }
      ],
      reasoning: 'Deterministic mock: greeting'
    };
  }

  // Phase C.1: Skill replay path (before LLM call)
  if (intent.skillMatch && (intent.skillMatch as any).skill) {
    const match = intent.skillMatch as any;
    const skill = match.skill;
    const similarity = match.similarity ?? intent.confidence ?? 0.9;

    const steps = (skill.actions ?? []).map((action: any, index: number) => {
      const tool = String(action.tool);
      const args = normalizeArgs(action.input ?? {});

      return {
        tool,
        args,
        reason: `Replaying promoted skill "${skill.intent ?? intent.intent ?? 'unknown'}" (step ${index + 1})`,
        confidence: similarity,
      };
    });

    if (steps.length === 0) {
      log.warn(
        prepareLog('PlannerLLM', {
          observationId: obs.id,
          skillId: skill.id,
          message: 'Planner: Skill match found but contained no actions; falling back to normal planning'
        })
      );
    } else {
      const plan: Plan = {
        steps,
        reasoning: `Replayed skill "${skill.id}" for intent "${skill.intent ?? intent.intent ?? obs.content}" (similarity=${similarity.toFixed?.(
          3
        ) ?? similarity})`,
        confidence: similarity,
        source: 'skill-graph',
      };

      log.info(
        prepareLog('PlannerLLM', {
          observationId: obs.id,
          skillId: skill.id,
          similarity,
          stepCount: steps.length,
          message: '🧠 Planner: Using skill replay instead of LLM planning'
        })
      );

      // Apply gating logic before returning
      const gatedPlan = applyIntentGating(plan, obs, intent, log);
      return PlanSchema.parse(gatedPlan);
    }
  }

  const start = Date.now();
  // Ambient spam filter: Only respond if Vi is addressed
  const content = obs.content.toLowerCase();
  const isMentioned = content.includes('vi') || content.includes('vibot') || content.includes('@vi');
  // You can add more patterns for direct mention if needed
  if (!isMentioned && !content.startsWith('vi')) {
    // Not addressed to Vi, ignore
    return {
      steps: [],
      reasoning: 'Ignored ambient chat: Vi not addressed.'
    };
  }

  // ⚡ Phase 4.2 - Intent Mapper (deterministic fast-path for common guild queries)
  try {
    const mappedTool = resolveGuildIntent(obs.content);
    if (mappedTool) {
      // Best-effort args injection based on tool pattern; executor will also inject channel/user/guild
      const args: Record<string, any> = {};

      // Most guild tools expect guildId
      if (mappedTool.startsWith('guild.')) {
        (args as any).guildId = (obs as any).guildId;
      }

      // Provide channelId when the tool may auto-send a response
      if (
        mappedTool === 'guild.member.count' ||
        mappedTool === 'guild.roles.admins' ||
        mappedTool === 'guild.member.roles' ||
        mappedTool === 'guild.uptime' ||
        mappedTool === 'guild.bot.role'
      ) {
        (args as any).channelId = (obs as any).channelId;
      }

      // Member-scoped guild tools typically need userId (default to author)
      const needsUser = (
        mappedTool === 'guild.member.roles' ||
        mappedTool === 'guild.member.permissions' ||
        mappedTool === 'guild.member.joinedAt' ||
        mappedTool === 'guild.roles.highest' ||
        mappedTool === 'member.info'
      );
      if (needsUser) {
        (args as any).userId = (obs as any).authorId;
      }

      // Sensible defaults
      if (mappedTool === 'guild.moderation.stats') {
        (args as any).windowHours = 24;
      }

      const plan: Plan = {
        steps: [
          {
            tool: mappedTool,
            args,
            reason: `Intent map: direct route for "${obs.content}"`,
          },
        ],
        reasoning: `Resolved via intent map → ${mappedTool}`,
      };

      const elapsed = Date.now() - start;
      log.info(prepareLog('PlannerLLM', {
        observationId: obs.id,
        tool: mappedTool,
        elapsed,
        message: '🧭 Intent Map: Hit, skipping LLM'
      }));
      // Apply intent gating even on fast-path plans (strict should filter non-allowlisted tools)
      const gated = applyIntentGating(plan, obs, intent, log);
      return gated;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(prepareLog('PlannerLLM', {
      err: message,
      observationId: obs.id,
      message: '🧭 Intent Map: Failed (continuing)'
    }));
  }

  // � Phase 4.1 - Direct intent shortcuts (non-guild)
  try {
    const lc = obs.content.toLowerCase();
    // Reflection shortcut: if user asks to reflect, store a reflection note
    if (lc.includes('reflect')) {
      const plan: Plan = {
        steps: [
          {
            tool: 'system.reflect',
            args: {
              text: `Reflection: ${obs.content}`,
              scope: (obs as any).guildId ? 'guild' : 'channel',
              guildId: (obs as any).guildId,
              channelId: obs.channelId,
              userId: obs.authorId,
            },
            reason: 'Direct reflect intent detected',
          },
        ],
        reasoning: 'Shortcut: reflect phrasing detected, persist a brief reflection',
      };
      log.info(prepareLog('PlannerLLM', {
        observationId: obs.id,
        message: '🧠 Direct intent: reflect'
      }));
      return plan;
    }

    // Memory recall phrasing: "who did I say ...", "who like(s) meow(s)/cats", etc. → query memory and summarize
    if (
      /who\s+did\s+i\s+say/i.test(lc) ||
      /who\s+.*like(s)?\s+(meow|meows|cat|cats)/i.test(lc)
    ) {
      const plan: Plan = {
        steps: [
          {
            tool: 'memory.query',
            args: {
              q: obs.content,
              channelId: obs.channelId,
            },
            reason: 'Phrasing implies recall of prior statement; query memory',
          },
        ],
        reasoning: 'Shortcut: memory recall phrasing detected',
      };
      log.info(prepareLog('PlannerLLM', {
        observationId: obs.id,
        message: '🧠 Direct intent: memory recall'
      }));
      return plan;
    }

    // Recent conversation recall: "what did we talk about X minutes/hours ago?"
    const recentMatch = lc.match(/what\s+did\s+we\s+(talk|chat|discuss).*?(\d+)\s*(min|mins|minute|minutes|hour|hours|day|days)\s+ago/);
    if (recentMatch) {
      const amount = Number(recentMatch[2]);
      const unit = recentMatch[3];
      const window = `${amount} ${unit}`;
      const plan: Plan = {
        steps: [
          {
            tool: 'memory.query',
            args: {
              // Bias retrieval by hinting at recency and this channel context
              q: `recent conversation (${window}) in this channel: ${obs.content}`,
              channelId: obs.channelId,
            },
            reason: `User asked to recall recent conversation (${window})`,
          },
        ],
        reasoning: 'Shortcut: recent conversation recall detected',
      };
      log.info(prepareLog('PlannerLLM', {
        observationId: obs.id,
        message: '🧠 Direct intent: recent convo recall'
      }));
      return plan;
    }
  } catch (err) {
    log.warn(prepareLog('PlannerLLM', {
      err: err instanceof Error ? err.message : String(err),
      message: '🧠 Direct intent shortcuts failed (continuing)'
    }));
  }

  // Phase D.4: Deterministic identity preference handling
  if (intent.intent === 'identity.pref.update') {
    log.info(prepareLog('PlannerLLM', {
      observationId: obs.id,
      metadata: intent.meta,
      message: '🪪 Identity: Deterministic preference update'
    }));

    const args: {
      userId: string;
      addPublicAliases?: string[];
      addPrivateAliases?: string[];
      setAllowAutoIntimate?: boolean;
    } = {
      userId: obs.authorId,
    };

    // Extract aliases based on scope
    if (intent.meta?.aliases && Array.isArray(intent.meta.aliases)) {
      if (intent.meta.scope === 'private') {
        args.addPrivateAliases = intent.meta.aliases;
      } else if (intent.meta.scope === 'public') {
        args.addPublicAliases = intent.meta.aliases;
      }
    }

    // Extract intimacy toggle
    if (typeof intent.meta?.toggleIntimacy === 'boolean') {
      args.setAllowAutoIntimate = intent.meta.toggleIntimacy;
    }

    const plan: Plan = {
      steps: [
        {
          tool: 'identity.update',
          args,
          reason: 'Apply user preference update for identity addressing',
        },
        {
          tool: 'message.send',
          args: {
            content: 'Got it! Your identity preferences have been updated.',
            channelId: obs.channelId,
          },
          reason: 'Confirm preference update to user',
        },
      ],
      reasoning: 'User issued an explicit identity preference command',
      confidence: 0.95,
      source: 'intent-map',
    };

    log.info(
      prepareLog('PlannerLLM', {
        observationId: obs.id,
        args,
        message: '🪪 Identity: Deterministic plan generated'
      })
    );

    return plan;
  }

  // 🧩 Phase 5 - Pre-plan Skill Lookup
  // Check if we have a proven skill for this intent before calling LLM
  try {
    const bestSkill = await skillGraph.shouldUseSkill(obs.content);
    
    if (bestSkill) {
      log.info(
        prepareLog('PlannerLLM', {
          skillId: bestSkill.skill.id,
          similarity: bestSkill.similarity,
          successRate: bestSkill.stats.successRate,
          message: '🧩 Skill Graph: Reusing existing skill (skipping LLM)'
        })
      );
      
      // Convert skill actions to Plan format
      // Handle both array format and single object format from mock skills
      let steps;
      if (Array.isArray(bestSkill.skill.actions)) {
        steps = bestSkill.skill.actions.map((action, idx) => ({
          tool: action.tool,
          args: action.input || {},
          reason: idx === 0 
            ? `Reusing proven skill (${(bestSkill.similarity * 100).toFixed(0)}% match, ${(bestSkill.stats.successRate * 100).toFixed(0)}% success rate)`
            : `Skill step ${idx + 1}`
        }));
      } else {
        // Handle single action object (mock skill format)
        const action = bestSkill.skill.actions as any;
        steps = [{
          tool: action.tool || String(action),
          args: action.input || {},
          reason: `Reusing proven skill (${(bestSkill.similarity * 100).toFixed(0)}% match, ${(bestSkill.stats.successRate * 100).toFixed(0)}% success rate)`
        }];
      }
      
      const plan: Plan = {
        steps,
        reasoning: `Matched existing skill: "${bestSkill.skill.intent}" (similarity: ${bestSkill.similarity.toFixed(2)}, success rate: ${bestSkill.stats.successRate.toFixed(2)})`
      };
      
      const elapsed = Date.now() - start;
      log.info(
        prepareLog('PlannerLLM', {
          observationId: obs.id,
          skillId: bestSkill.skill.id,
          elapsed,
          message: `🧩 Skill Graph: Converted skill to plan (${elapsed}ms)`
        })
      );
      
      return plan;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(prepareLog('PlannerLLM', {
      err: message,
      message: '🧩 Skill Graph: Lookup failed, falling back to LLM'
    }));
  }

  // 🪪 Fetch user entity from Memory API for identity-aware planning
  let userEntity: any = null;
  const memoryApi = process.env.MEMORY_API || 'http://localhost:4311';
  const entityId = `user:${obs.authorId}`;
  
  try {
    const entityRes = await fetch(`${memoryApi}/v1/entities/${entityId}`);
    if (entityRes.ok) {
      userEntity = await entityRes.json();
      log.info(prepareLog('PlannerLLM', {
        userId: obs.authorId,
        aliases: userEntity.aliases,
        message: '🪪 User entity loaded'
      }));
      
      // Inject entity into context for prompt building
      context.userEntity = {
        id: userEntity.id,
        aliases: userEntity.aliases || [],
        traits: userEntity.traits || {},
        display: userEntity.aliases?.[0] || 'Unknown User',
      };
    }
  } catch (err: unknown) {
    log.debug(prepareLog('PlannerLLM', {
      err: err instanceof Error ? err.message : String(err),
      message: '🪪 Entity lookup failed (non-critical)'
    }));
  }

  // Phase D.2: Identity-aware addressing
  const addressing: AddressingChoice | null =
    identity
      ? chooseAddressing(identity.identityZone, identity.identityProfile)
      : null;

  const identityZone = identity?.identityZone ?? 'PUBLIC_GUILD';

  // Log addressing decision for debugging
  if (addressing) {
    log.info(
      prepareLog('PlannerLLM', {
        observationId: obs.id,
        identityZone,
        primaryName: addressing.primaryName,
        safeName: addressing.safeName,
        useIntimate: addressing.useIntimate,
        message: '🪪 Identity: Addressing choice computed'
      })
    );
  }

  // 🎨 Phase 4 - Prompt Engine Integration
  // Build prompt using emotion-aware, token-optimized composition
  const promptOutput = await buildPromptWithEngine(obs, context, log);
  
  log.info(
    prepareLog('PlannerLLM', {
      phase: 'prompt-engine',
      emotion: promptOutput.metadata.emotionTone,
      variant: promptOutput.metadata.variant,
      contextItems: promptOutput.metadata.contextItemsIncluded,
      estimatedTokens: promptOutput.metadata.estimatedTokens,
      message: '🎨 Prompt Engine: Composed prompt'
    })
  );
  // DEBUG raw payload dump if BRAIN_LOG_RAW is enabled
  if (process.env.BRAIN_LOG_RAW === 'true') {
    log.debug(prepareLog('RAW', { rawPrompt: promptOutput, observationId: obs.id }));
  }

  try {
    // Phase 5.0.6: Enforce JSON format instruction with arg standardization
    const formatInstruction = `\n\nCRITICAL JSON FORMAT REQUIREMENTS:
Respond with VALID JSON only - no trailing commas, no comments, strictly RFC 8259 compliant.

Schema:
{
  "steps": [{ "tool": "string", "args": {"content": "string"}, "reason": "string" }],
  "reasoning": "string",
  "emotion": "curious|playful|serious|empathetic"
}

MANDATORY RULES:
- NO trailing commas after last object property
- NO trailing commas after last array element  
- For message.send: ALWAYS use args.content (NOT args.text)
- For weather.get: ALWAYS include args.q with location name
- Emotion field is optional but recommended
- Keep responses natural and conversational in the content field`;

    // Phase D.2: Identity and addressing rules (MANDATORY ENFORCEMENT)
    const identityInstruction = addressing
      ? `\n\nIDENTITY AND ADDRESSING RULES (STRICT COMPLIANCE REQUIRED):
- You MUST address the user using ONLY this name: "${addressing.primaryName}"
- The user's safe/public name is: "${addressing.safeName}"
- Current identity zone: ${identityZone}

CRITICAL RULES:
- If identity_zone is "PUBLIC_GUILD" (public Discord server):
  → You MUST ONLY use "${addressing.safeName}" or neutral "you"
  → NEVER use any other names, nicknames, or aliases from memory
  → This is NON-NEGOTIABLE for privacy protection
  
- If identity_zone is "PRIVATE_DM" or "TRUSTED":
  → You may use "${addressing.primaryName}" as the default
  → You MAY occasionally use "${addressing.intimateName || addressing.safeName}" ONLY IF user_has_intimate is true
  → Use intimate names sparingly: only in serious, personal, or emotionally significant moments
  → NOT every sentence - use neutral "you" most of the time
  
- FORBIDDEN: Never use names from memory, context, or aliases lists that are not explicitly provided above
- FORBIDDEN: Never reveal the full list of aliases or internal identity data
- User has intimate name available: ${!!addressing.intimateName}

If you are unsure which name to use, default to "${addressing.safeName}" or "you".`
      : '';

    // DEBUG: Dump final system prompt to verify identity instructions are included (only when enabled)
    if (process.env.BRAIN_LOG_RAW === 'true') {
      console.log('\n🔍 DIAGNOSTIC: Final system prompt sent to LLM:');
      console.log('─'.repeat(80));
      console.log(promptOutput.system + identityInstruction);
      console.log('─'.repeat(80));
      console.log(`Identity instruction length: ${identityInstruction.length} chars`);
      console.log(`Addressing object:`, addressing);
      console.log('\n');
    }

    const response = await getClient().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: promptOutput.system + identityInstruction },
        { role: 'user', content: promptOutput.user + formatInstruction }
      ],
      // response_format: { type: 'json_object' }, // Temporarily disabled for Phase 5 testing
      temperature: 0.7,
    });

    const rawPlan = response.choices[0]?.message?.content;
    if (!rawPlan) {
      throw new Error('No response from LLM');
    }

    // Phase 5.0.6: Resilient JSON parsing with fallback
    let parsed: any;
    try {
      // Try to fix common JSON issues before parsing
      let cleanedPlan = rawPlan.trim();
      
      // Remove trailing commas before closing braces/brackets (common LLM mistake)
      cleanedPlan = cleanedPlan.replace(/,(\s*[}\]])/g, '$1');
      
      parsed = JSON.parse(cleanedPlan);
    } catch (parseErr) {
      // LLM returned non-JSON (natural language or malformed output)
      log.warn(
        prepareLog('PlannerLLM', {
          observationId: obs.id,
          rawPlan: rawPlan.substring(0, 200),
          parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
          message: 'LLM returned non-JSON output; extracting message content'
        })
      );
      
      // Try to extract just the content field if JSON is malformed
      const contentMatch = rawPlan.match(/"content":\s*"([^"]+)"/);
      if (contentMatch && contentMatch[1]) {
        log.info(prepareLog('PlannerLLM', {
          observationId: obs.id,
          message: 'Extracted content from malformed JSON'
        }));
        
        return {
          steps: [
            {
              tool: 'message.send',
              args: {
                channelId: obs.channelId,
                content: contentMatch[1],
              },
              reason: 'Extracted from malformed LLM JSON',
            },
          ],
          reasoning: 'Fallback: Extracted message from malformed JSON',
        };
      }
      
      // Last resort: treat as plain text IF it looks like natural language
      if (rawPlan.length < 500 && !rawPlan.includes('{') && !rawPlan.includes('[')) {
        return {
          steps: [
            {
              tool: 'message.send',
              args: {
                channelId: obs.channelId,
                content: rawPlan.trim(),
              },
              reason: 'LLM returned natural language',
            },
          ],
          reasoning: 'Fallback: LLM returned plain text response',
        };
      }
      
      // If we got here, JSON is completely broken - return error
      return {
        steps: [
          {
            tool: 'message.send',
            args: {
              channelId: obs.channelId,
              content: "I'm having trouble formulating a response. Could you try rephrasing that?",
            },
            reason: 'LLM returned unparseable output',
          },
        ],
        reasoning: 'Fallback: LLM output completely malformed',
      };
    }

    // If model supplied emotion, store it for future prompts
    if (parsed.emotion) {
      try { setEmotion(parsed.emotion as any); } catch {}
    }
    
    // Zod validation with explicit fallback on schema failure
    let validated: Plan;
    try {
      validated = PlanSchema.parse(parsed);
    } catch (zodErr) {
      log.error(
        prepareLog('PlannerLLM', {
          observationId: obs.id,
          zodError: zodErr instanceof Error ? zodErr.message : String(zodErr),
          parsedData: JSON.stringify(parsed).substring(0, 300),
          message: 'LLM output failed schema validation'
        })
      );
      
      // Fallback: provide helpful error response
      return {
        steps: [
          {
            tool: 'message.send',
            args: {
              channelId: obs.channelId,
              content: "I heard you, but I'm having trouble understanding. Could you rephrase that?",
            },
            reason: 'Fallback response due to schema validation failure',
          },
        ],
        reasoning: 'LLM planning failed: invalid schema',
      };
    }
    
    // BUG-004: safeguard against empty plan from LLM (inject clarification step)
    if (validated.steps.length === 0) {
      validated.steps.push({
        tool: 'message.send',
        args: { channelId: obs.channelId, content: 'Could you clarify what you would like me to do?' },
        reason: 'Auto-injected clarification (LLM returned 0 steps)'
      });
    }

    const elapsed = Date.now() - start;
    log.info(
      prepareLog('PlannerLLM', {
        observationId: obs.id,
        stepCount: validated.steps.length,
        reasoning: validated.reasoning,
        elapsed,
        message: `🧩 LLM Planner: Generated plan (${elapsed}ms)`
      })
    );
    // DEBUG raw payload dump if BRAIN_LOG_RAW is enabled
    if (process.env.BRAIN_LOG_RAW === 'true') {
      log.debug(prepareLog('RAW', { rawLLMResponse: rawPlan, observationId: obs.id }));
    }

    // Apply intent gating to the LLM-generated plan
    // Addressing enforcement: sanitize message.send steps to use correct name
    if (process.env.BRAIN_LOG_RAW === 'true') {
      console.log('\n🔍 DIAGNOSTIC: Addressing enforcement block reached');
      console.log('Addressing object:', addressing);
      console.log('Identity zone:', identityZone);
      console.log('Validated steps count:', validated.steps.length);
    }
    
    if (addressing && identityZone === 'PUBLIC_GUILD') {
      for (const step of validated.steps) {
        if (step.tool === 'message.send' && step.args && typeof step.args.content === 'string') {
          const originalContent = step.args.content;
          if (process.env.BRAIN_LOG_RAW === 'true') {
            console.log(`\n🔍 DIAGNOSTIC: Processing message.send step`);
            console.log(`Original content: "${originalContent}"`);
          }
          
          // If the content contains a greeting or name, replace with correct addressing
          const zone = identityZone;
          // Phase 2 Law: In PUBLIC_GUILD, always use the public display name as safe identifier
          const publicDisplayName = (obs as any).authorDisplayName || 'TheLinQuei';
          let enforcedName = zone === 'PUBLIC_GUILD' ? publicDisplayName : addressing.primaryName;
          if (process.env.BRAIN_LOG_RAW === 'true') {
            console.log(`Enforced name for zone ${zone}: "${enforcedName}"`);
          }
          
          // Simple greeting detection (can be improved)
          // BUG-001 fix: tighten greeting regex to avoid matching substrings like "hi" in "this"
          // Phase 2 Surgical Command #4: Expanded greeting pattern for multi-word greetings
          const greetingPattern = /\b(hi|hey|hello|greetings|good morning|good afternoon|good evening|good night|hi there|hey there)\b/i;
          // Phase 2 Surgical Command #5: Normalize content for greeting matching only
          const contentForMatch = step.args.content.toLowerCase();
          // Phase 2 Surgical Command #6: Tokenized boundary fix to ensure multi-word patterns match cleanly
          const tokens = contentForMatch.split(/\s+/);
          const tokenized = tokens.join(' ');
          if (greetingPattern.test(tokenized)) {
            step.args.content = step.args.content.replace(/\b(hello|hi|hey|greetings)\b[^!\w]*[\w\s,]*!?/i, `$1, ${enforcedName}!`);
            if (process.env.BRAIN_LOG_RAW === 'true') {
              console.log(`After greeting replacement (BUG-001 patched): "${step.args.content}"`);
            }
          }
          
          // If content contains any known alias, replace with enforcedName (legacy pass)
          for (const alias of [addressing.safeName, addressing.primaryName, addressing.intimateName].filter(Boolean)) {
            if (alias && step.args.content.includes(alias)) {
              step.args.content = step.args.content.replace(alias, enforcedName);
              if (process.env.BRAIN_LOG_RAW === 'true') {
                console.log(`Replaced alias "${alias}" with "${enforcedName}"`);
              }
            }
          }
          
          // Phase 2 Surgical Command #3: Non-greeting alias sanitization
          // Replace private/intimate aliases anywhere in content (not just greetings)
          // Pass B: Global alias sweep (PRIVATE_ALIAS + INTIMATE_ALIAS) with word boundaries, case-insensitive
          const dynamicPrivateAliases: string[] = Array.isArray((identity as any)?.identityProfile?.privateAliases)
            ? ((identity as any).identityProfile.privateAliases as string[])
            : [];
          const privateAliases = Array.from(new Set<string>([
            ...dynamicPrivateAliases,
            'Kaelen', 'Forsa', 'K.'
          ]));
          for (const privateAlias of privateAliases) {
            const escaped = privateAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`\\b${escaped}\\b`, 'gi');
            if (re.test(step.args.content)) {
              step.args.content = step.args.content.replace(re, enforcedName);
              if (process.env.BRAIN_LOG_RAW === 'true') {
                console.log(`Sanitized alias "${privateAlias}" → "${enforcedName}"`);
              }
            }
          }
          if (process.env.BRAIN_LOG_RAW === 'true') {
            console.log(`Final content: "${step.args.content}"\n`);
          }
        }
      }
    } else {
      if (process.env.BRAIN_LOG_RAW === 'true') {
        console.log('⚠️ DIAGNOSTIC: No addressing object available or zone is not PUBLIC_GUILD, skipping sanitization\n');
      }
    }
    
    return applyIntentGating(validated, obs, intent, log);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(prepareLog('PlannerLLM', {
      err: message,
      observationId: obs.id,
      message: 'LLM Planner failed'
    }));

    // Fallback to helpful error response (network failure, missing response, etc.)
    return {
      steps: [
        {
          tool: 'message.send',
          args: {
            channelId: obs.channelId,
            content: "Sorry, I'm having technical difficulties right now. Please try again in a moment.",
          },
          reason: 'Fallback response due to LLM error',
        },
      ],
      reasoning: `LLM planning failed: ${message}`,
    };
  }
}
