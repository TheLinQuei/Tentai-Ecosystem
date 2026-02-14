import type { FastifyBaseLogger } from 'fastify';
import type { Observation } from './observer.js';
import type { RetrievedContext } from './retriever.js';
import { getEmotion, type Emotion } from './emotion.js';
import { generateToolDocumentation } from './tools/schema.js';
import {
  composePrompt,
  calculateContextWeight,
  generatePromptId,
  createMetrics,
  logPromptMetrics,
  type PromptInput,
  type PromptOutput,
  type ContextItem,
  type EmotionTone,
} from '@vi/prompts';
import { prepareLog } from './utils/logContract.js';

// ============================================================================
// Phase 4 — Prompt Engine Integration for Brain Service
// ============================================================================

/**
 * Map Brain emotion types to Prompt engine emotion types
 */
const EMOTION_MAP: Partial<Record<Emotion, EmotionTone>> = {
  curious: 'curious',
  playful: 'playful',
  serious: 'serious',
  empathetic: 'empathetic',
  // analytical, creative, defensive, excited not in Brain emotion set yet
  // Default to curious for unmapped emotions
};

/**
 * Convert retrieved context to scored context items
 */
function contextToItems(context: RetrievedContext): ContextItem[] {
  const items: ContextItem[] = [];

  // Add user entity if available
  if (context.userEntity) {
    const entity = context.userEntity;
    const entityText = `User Identity: ${entity.display} (${entity.aliases.join(', ')})`;
    const traits = Object.entries(entity.traits).map(([k, v]) => `${k}: ${v}`).join(', ');
    const fullText = traits ? `${entityText}. Traits: ${traits}` : entityText;
    
    items.push({
      content: fullText,
      score: { recent: 1.0, relevant: 1.0, weight: 1.0 }, // Highest priority
      type: 'identity',
    });
  }

  // Add recent messages with high recency, lower relevance
  context.recent.forEach((msg) => {
    const recency = 0.9; // Recent messages are highly recent
    const relevance = 0.3; // But may not be semantically relevant
    const weight = calculateContextWeight(recency, relevance);

    items.push({
      content: msg.content,
      score: { recent: recency, relevant: relevance, weight },
      timestamp: msg.timestamp,
      type: 'message',
    });
  });

  // Add relevant context with lower recency, high relevance
  context.relevant.forEach((item) => {
    const recency = 0.4; // May be older
    const relevance = item.score; // Use semantic score
    const weight = calculateContextWeight(recency, relevance, 0.3); // Favor relevance

    items.push({
      content: item.content,
      score: { recent: recency, relevant: relevance, weight },
      type: 'memory',
    });
  });

  return items;
}

/**
 * Build prompt using the Prompt Engine
 */
export async function buildPromptWithEngine(
  obs: Observation,
  context: RetrievedContext,
  log: FastifyBaseLogger
): Promise<PromptOutput> {
  const startTime = Date.now();
  const promptId = generatePromptId();

  try {
    // Get current emotion
    const brainEmotion = getEmotion();
    const promptEmotion = EMOTION_MAP[brainEmotion] || 'curious'; // Default to curious

    // Build current timestamp
    const now = new Date();
    const currentTime = now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    // Convert context to scored items
    const contextItems = contextToItems(context);

    // Tool names for basic list
    const toolNames = [
      'message.send',
      'system.diagnostics.selftest',
      'system.reflect',
      'memory.query',
      'user.remind',
      'info.search',
      'weather.get',
      'identity.lookup',
      'identity.user.self',
      'identity.creator',
      'guardian.notifyOwner',
      'guild.members.search',
      'guild.roles.list',
      'guild.roles.admins',
      'guild.member.count',
      'guild.member.roles',
      'guild.uptime',
      'guild.info',
      'guild.stats.overview',
      'guild.health',
      'member.get',
      'member.info',
      'user.ping',
      'system.capabilities',
      'code.read',
    ];

    // Generate comprehensive tool documentation
    const toolDocumentation = generateToolDocumentation(toolNames);

    // Build prompt input
    const input: PromptInput = {
      intent: `User message from ${obs.authorId} in channel ${obs.channelId}: "${obs.content}"`,
      context: contextItems,
      identity: {
        tone: promptEmotion,
        affect: 0.6, // Moderate emotional intensity
        assertiveness: 0.5, // Balanced confidence
        verbosity: 'medium', // Balanced response length
      },
      currentTime,
      tools: toolNames,
      toolDocumentation, // Add detailed tool docs
    };

    // Compose the prompt
    const output = composePrompt(input);

    const latencyMs = Date.now() - startTime;

    // Log metrics for A/B testing
    const metrics = createMetrics(promptId, output.metadata.variant || 'unknown', input, output, {
      success: true,
      latencyMs,
      tokensUsed: output.metadata.estimatedTokens,
    });

    await logPromptMetrics(metrics);

    log.info(
      prepareLog('PromptEngine', {
        promptId,
        variant: output.metadata.variant,
        emotion: promptEmotion,
        contextItems: output.metadata.contextItemsIncluded,
        estimatedTokens: output.metadata.estimatedTokens,
        latencyMs,
        observationId: obs.id,
        message: '🎨 Prompt Engine: Composed prompt'
      })
    );

    return output;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log error metrics
    const metrics = createMetrics(
      promptId,
      'error',
      { intent: obs.content },
      {},
      {
        success: false,
        latencyMs,
        error: errorMessage,
      }
    );

    await logPromptMetrics(metrics);

    log.error(prepareLog('PromptEngine', {
      err: errorMessage,
      promptId,
      observationId: obs.id,
      latencyMs,
      message: 'Prompt Engine: Failed to compose prompt'
    }));

    // Return fallback prompt
    return {
      system: 'You are Vi, an autonomous Discord assistant.',
      user: obs.content,
      metadata: {
        estimatedTokens: 50,
        contextItemsIncluded: 0,
        emotionTone: 'curious',
        variant: 'fallback',
      },
    };
  }
}
