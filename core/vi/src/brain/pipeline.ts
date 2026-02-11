/**
 * Cognition Pipeline: orchestrates the full brain workflow
 * Perception → Intent → Planning → Execution → Reflection → Grounding
 */

import { randomUUID } from 'crypto';
import {
  ThoughtState,
  RunRecord,
  CognitionEvent,
} from './types.js';
import { LLMGateway, PolicyEngine, RunRecordStore, ToolRunner, MemoryStore } from './interfaces.js';
import { Planner } from './planner.js';
import { Executor } from './executor.js';
import { Reflector } from './reflector.js';
import { ToolRunner as ToolExecutionEngine } from '../tools/runner.js';
import { SelfModelEnforcer } from './selfModelEnforcer.js';
import { SelfModelRepository } from '../db/repositories/SelfModelRepository.js';
import { GroundingGate, CanonResolver } from './grounding/index.js';
import { CanonInjector } from './canon/CanonInjector.js';
import { BranchingPlanner } from './planning/branchingPlanner.js';
import type { Citation } from './grounding/types.js';
import { BacktrackingExecutor } from './backtrackingExecutor.js';
import { registerDefaultVerifiers } from '../verification/VerifierRegistry.js';
import { traceOperation } from '../telemetry/tracing.js';
import { AmbiguityGate } from './AmbiguityGate.js';
import { getLogger } from '../telemetry/logger.js';

// Lazy logger initialization to avoid module-level evaluation issues
const getModuleLogger = () => getLogger();

export class CognitionPipeline {
  private planner: BranchingPlanner;
  private executor: Executor;
  private backtrackingExecutor: BacktrackingExecutor;
  private reflector: Reflector;
  private enforcer?: SelfModelEnforcer;
  private groundingGate: GroundingGate;
  private canonInjector: CanonInjector;
  private ambiguityGate: AmbiguityGate;

  constructor(
    private llmGateway: LLMGateway,
    policyEngine: PolicyEngine,
    private runRecordStore: RunRecordStore,
    toolRunner: ToolRunner = new ToolExecutionEngine(false),
    private memoryStore?: MemoryStore,
    selfModelRepo?: SelfModelRepository
  ) {
    const planner = new Planner(llmGateway); // M8: pass LLM gateway to enable LLM planning
    this.planner = new BranchingPlanner(planner);
    registerDefaultVerifiers(); // Ensure default tool verifiers are available for Phase 5
    this.executor = new Executor(policyEngine, toolRunner);
    this.backtrackingExecutor = new BacktrackingExecutor(this.executor);
    this.reflector = new Reflector();
    this.groundingGate = new GroundingGate(new CanonResolver(), memoryStore ? { search: async () => [] } as any : undefined);
    this.canonInjector = new CanonInjector();
    this.ambiguityGate = new AmbiguityGate();
    if (selfModelRepo) {
      this.enforcer = new SelfModelEnforcer(selfModelRepo);
    }
  }

  /**
   * Run one complete cognition cycle: input → output
   * Returns output with grounding citations
   */
  async process(
    input: string,
    userId: string,
    sessionId: string,
    context?: Record<string, unknown>,
    progress?: (event: CognitionEvent) => void
  ): Promise<{ output: string; recordId: string; hadViolation: boolean; citations?: Citation[] }> {
    return traceOperation('cognition.pipeline.process', async () => {
      const startTime = Date.now();
      const thoughtStateId = randomUUID();

      if (!context?.continuityPack) {
        throw new Error('ContinuityPack is mandatory and must be provided before pipeline execution.');
      }

      const emit = (type: CognitionEvent['type'], payload: unknown) => {
        progress?.({ type, payload, timestamp: new Date().toISOString() });
      };

      // 1. Perception
      const perception: any = {
        raw: input,
        context: {
          recentHistory: context?.recentHistory as string[] | undefined,
          immediateContext: context?.immediateContext as string[] | undefined,
          personalIdentifiers: context?.personalIdentifiers as string[] | undefined,
          userPreferences: context?.userPreferences as Record<string, unknown> | undefined,
          userProfile: context?.userProfile as any,
          continuityPack: context?.continuityPack as any,
          selfModel: context?.selfModel as any,
        },
        confidence: 0.9,
      };

      // 1a. Canon Auto-Injection (C3: check if query is lore-relevant)
      try {
        const canonContext = await this.canonInjector.injectCanon(
          input,
          userId,
          sessionId,
          context?.userProfile as any
        );
        perception.context.canonContext = canonContext;
      } catch (err) {
        // Log but don't fail perception on canon error
        console.warn({ err, userId, input }, 'Failed to inject canon context');
      }

      emit('perception', perception);

      // Phase 2: Emit relationship context telemetry
      if (context?.continuityPack?.relationship_context) {
        const rc = context.continuityPack.relationship_context;
        getModuleLogger().info('Relationship context active', {
          userId,
          sessionId,
          relationship_type: rc.relationship_type,
          trust_level: rc.trust_level,
          voice_profile: rc.voice_profile,
          source: rc.source,
        });
      }

      // 1b. Ambiguity Gate (v1.1 hardening - pre-planner validation)
      const ambiguityDetection = this.ambiguityGate.detect(
        input,
        (context?.recentHistory as string[]) || []
      );
      
      if (ambiguityDetection?.detected) {
        // Return early with clarification response (do NOT invoke Planner)
        let recordId = randomUUID();
        
        // Build minimal thought state for logging
        const abortedThought: ThoughtState = {
          id: randomUUID(),
          userId,
          sessionId,
          timestamp: new Date(),
          stage: 'aborted_ambiguity',
          input,
          perception,
          intent: undefined as any,
          plan: undefined as any,
          execution: undefined as any,
        };

        // Save the aborted record
        try {
          const record: RunRecord = {
            thoughtStateId: abortedThought.id,
            userId,
            sessionId,
            timestamp: new Date(),
            inputText: input,
            intent: {
              category: 'clarification',
              confidence: ambiguityDetection.confidence,
              reasoning: `AmbiguityGate:${ambiguityDetection.type || 'unknown'}`,
            },
            planExecuted: {
              steps: [],
              reasoning: 'aborted_ambiguity',
              estimatedComplexity: 'simple',
              toolsNeeded: [],
              memoryAccessNeeded: false,
            },
            executionResult: {
              stepsExecuted: [],
              success: true,
              output: ambiguityDetection.clarificationPrompt,
            },
            reflection: {
              summary: 'Ambiguity detected; clarification requested.',
              keyFindings: [],
              confidenceInResponse: ambiguityDetection.confidence,
            },
            assistantOutput: ambiguityDetection.clarificationPrompt,
            citations: [],
            totalDuration: Date.now() - startTime,
            success: true,
          };
          recordId = await this.runRecordStore.save(record);
        } catch (err) {
          console.warn({ err, userId, input }, 'Failed to save aborted ambiguity record');
        }

        emit('ambiguity_detected', ambiguityDetection);

        return {
          output: ambiguityDetection.clarificationPrompt,
          recordId,
          hadViolation: false,
          citations: []
        };
      }

      // 2. Intent Classification (LLM Gateway)
      const intent = await this.llmGateway.classifyIntent(input, context);
      emit('intent', intent);

      // 3. Planning (Phase 3: branching planner + constraint solver)
      const planningResult = await traceOperation('cognition.planner.generate', () =>
        this.planner.generate(intent, context)
      );
      const plan = planningResult.plan;
      emit('plan', { plan, candidates: planningResult.candidates });

      // 4. Execution with self-correction fallback
      const { execution, reflectionDelta } = await traceOperation('cognition.executor.execute', () =>
        this.backtrackingExecutor.execute(plan, userId, sessionId)
      );
      emit('execution', execution);

    // Build thought state
    const thought: ThoughtState = {
      id: thoughtStateId,
      userId,
      sessionId,
      timestamp: new Date(),
      stage: 'reflected',
      input,
      perception,
      intent,
      plan,
      execution,
      metadata: {
        planningCandidates: planningResult.candidates.map((candidate) => ({
          id: candidate.id,
          label: candidate.label,
          score: candidate.score,
          issues: candidate.issues,
          stepCount: candidate.plan.steps.length,
        })),
      },
    };

    // 4a. Stance decision (Layer 5 - pre-generation)
    try {
      const userProfile = (context?.userProfile as any) || undefined;
      const bond = (context?.bond as any) || undefined;
      const immediateContext = (context?.immediateContext as string[]) || [];
      const recentHistory = (context?.recentHistory as string[]) || [];
      const selfModel = (context?.selfModel as any) || undefined;
      if (userProfile) {
        const { computeStanceDecision } = await import('./profile.js');
        const decision = computeStanceDecision(input, { profile: userProfile, bond, immediateContext, recentHistory, selfModel });
        // Ensure perception/context objects exist
        (thought as any).perception = thought.perception || ({} as any);
        (thought.perception as any).context = (thought.perception as any).context || ({} as any);
        ((thought.perception as any).context as any).stanceDecision = decision;

        // Telemetry for stance decision
        try {
          const { getTelemetry } = await import('../telemetry/telemetry.js');
          getTelemetry().recordEvent({
            timestamp: new Date().toISOString(),
            level: 'info',
            type: 'stance_decision',
            data: {
              userId,
              sessionId,
              stance: decision.stance,
              reasoning: decision.reasoning,
            },
          }).catch(() => {});
        } catch {}
      }
    } catch {}

    // 5. Reflection
    const reflection = await this.reflector.reflect(thought);
    if (reflectionDelta) {
      reflection.delta = reflectionDelta;
    }
    thought.reflection = reflection;
    emit('reflection', reflection);

    // 5a. Memory Persistence: save recommended memories from reflection
    if (this.memoryStore && reflection.memoryToStore && reflection.memoryToStore.length > 0) {
      for (const mem of reflection.memoryToStore) {
        try {
          await this.memoryStore.store({
            userId,
            sessionId,
            type: mem.type as 'episodic' | 'semantic',
            subtype: mem.type,
            text: mem.content,
            metadata: {
              timestamp: mem.timestamp.toISOString(),
              citations: mem.citations,
              protocol: {
                type: mem.type,
                content: mem.content,
                userId,
                timestamp: mem.timestamp.toISOString(),
                citations: mem.citations,
                ttl: mem.ttl,
                source: 'reflector',
                sessionId,
                confidence: thought.execution?.success ? 0.8 : 0.2,
              },
            },
          });
        } catch (error) {
          // Don't block on memory storage errors
          console.warn('Failed to store memory:', error);
        }
      }
    }

    // Save run record
    const duration = Date.now() - startTime;
    const runRecord: RunRecord = {
      thoughtStateId,
      userId,
      sessionId,
      timestamp: new Date(),
      inputText: input,
      intent,
      planExecuted: plan,
      executionResult: execution,
      reflection,
      totalDuration: duration,
      success: execution.success,
    };

    // 6. Memory Retrieval: fetch relevant memories BEFORE response generation (fixes Layer 4 recall)
    // This ensures both normal and fallback paths have access to retrieved memories
    let retrievedMemories: any[] = [];
    if (this.memoryStore) {
      try {
        retrievedMemories = await this.memoryStore.retrieve(input, userId, 3);
        if (thought.perception) {
          thought.perception.context.retrievedMemories = retrievedMemories;
        }
      } catch (error) {
        console.warn('Failed to retrieve memories:', error);
      }
    }

    // Generate final response after reflection and memory retrieval
    thought.metadata = { ...(thought.metadata || {}), runRecordId: undefined };
    const output = await this.llmGateway.generateResponse(thought);
    emit('response', { output, thoughtId: thoughtStateId });

    // Phase 2 Task 3: Grounding Check (post-generation)
    // Validate response for hallucinations before returning to user
    let groundingCheck: any = undefined;
    let citations: Citation[] = [];
    try {
      const groundingContext = {
        userId,
        conversationId: sessionId,
        sessionId,
        canonMode: 'query' as const,
        requirements: {
          canonMode: 'query' as const,
          requireCitations: true,
          minConfidence: 0.5,
          allowUnknown: true,
          maxUngroundedClaims: -1, // Allow unlimited ungrounded claims but track them
        },
        availableMemories: new Map(),
        availableCanon: new Map(),
      };

      // Perform grounding check on the response
      groundingCheck = await this.groundingGate.validateResponse(output, groundingContext);
      citations = groundingCheck.citations || [];

      // Attach citations to thought for persistence
      (thought as any).citations = citations;
      (thought as any).groundingConfidence = groundingCheck.confidence;
    } catch (groundingError) {
      // Grounding errors should not block response delivery
      console.warn('Grounding check failed:', groundingError);
    }

    // Post-generation: check for self-model violations
    let hadViolation = false;
    if (this.enforcer && context?.selfModel && typeof context.selfModel === 'object') {
      const selfModel = context.selfModel as any;
      const violation = this.enforcer.analyzeResponse(output, selfModel, {
        userMessage: input,
        nameUsageCount: (output.match(/\b[A-Z][a-z]+\b/g) || []).length,
      });

      if (violation) {
        hadViolation = true;
        // Log and audit the violation
        await this.enforcer.enforceViolation(violation, selfModel).catch((err) => {
          console.warn('Failed to enforce self-model violation:', err);
        });
      }
    }

    // Save run record with assistant output
    const recordId = await this.runRecordStore.save({
      ...runRecord,
      assistantOutput: output,
      citations,
    });

    // Optionally persist citations if store supports it
    if (citations && citations.length > 0 && this.runRecordStore.saveCitations) {
      try {
        await this.runRecordStore.saveCitations(recordId, citations);
      } catch (citationError) {
        console.warn('Failed to persist citations', citationError);
      }
    }

    // Attach recordId after save
    thought.metadata = { ...(thought.metadata || {}), runRecordId: recordId };

    return { output, recordId, hadViolation, citations };
    }); // End traceOperation
  }
}
