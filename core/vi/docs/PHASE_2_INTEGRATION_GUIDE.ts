/**
 * PHASE 2 INTEGRATION GUIDE
 * ========================
 * 
 * How to integrate RelationshipResolver + BehaviorRulesEngine into chat handler
 * 
 * ARCHITECTURE:
 * 
 *   User Request
 *        ↓
 *   IdentityResolver → vi_user_id (Phase 1)
 *        ↓
 *   RelationshipResolver → relationship context (THIS IS PHASE 2)
 *        ↓
 *   BehaviorRulesEngine → behavior rules + phrases
 *        ↓
 *   ChatHandler → Apply rules to response
 *        ↓
 *   Response sent with appropriate posture
 * 
 * ─────────────────────────────────────────────────────────────────
 * IMPLEMENTATION: Adding Phase 2 to Chat Handler
 * ─────────────────────────────────────────────────────────────────
 * 
 * 1. INJECT DEPENDENCIES
 * 
 *    In your chat handler or DI container:
 * 
 *    ```typescript
 *    import { RelationshipResolver } from '../brain/RelationshipResolver.js';
 *    import { BehaviorRulesEngine } from '../brain/BehaviorRulesEngine.js';
 *    import { RelationshipRepository } from '../brain/RelationshipRepository.js';
 *    import { Pool } from 'pg';
 *    
 *    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 *    const relationshipResolver = new RelationshipResolver(pool);
 *    const behaviorEngine = new BehaviorRulesEngine();
 *    const relationshipRepo = new RelationshipRepository(pool);
 *    ```
 * 
 * ─────────────────────────────────────────────────────────────────
 * 
 * 2. RESOLVE RELATIONSHIP IN HANDLER
 * 
 *    ```typescript
 *    async function handleChat(req: ChatRequest, vi_user_id: string) {
 *      // Phase 1 gives us vi_user_id
 *      
 *      // Phase 2: Resolve relationship context
 *      const relationship = await relationshipResolver.resolveRelationship(
 *        vi_user_id,
 *        {
 *          history: req.conversation_history?.slice(-10), // Last 10 messages
 *          explicit_settings: req.relationship_override  // Optional override
 *        }
 *      );
 *      
 *      // Generate behavior rules from relationship
 *      const behaviorRules = behaviorEngine.generateBehaviorRules(relationship);
 *      const phrases = behaviorEngine.getPhraseSet(relationship);
 *      
 *      // Continue with thought/planning
 *      const thought = buildThoughtState({
 *        ...req,
 *        relationship_context: relationship,
 *        behavior_rules: behaviorRules
 *      });
 *    }
 *    ```
 * 
 * ─────────────────────────────────────────────────────────────────
 * 
 * 3. APPLY BEHAVIOR RULES TO RESPONSE
 * 
 *    ```typescript
 *    // After LLM generates response
 *    const response = await llm.chat(thought);
 *    
 *    // Apply behavior rules:
 *    
 *    // Rule 1: Should we include a disclaimer?
 *    if (!behaviorEngine.shouldIncludeDisclaimer(relationship, 'capability')) {
 *      response = response.replace(/I should mention that.*?$/m, '');
 *    }
 *    
 *    // Rule 2: Should we apologize?
 *    if (response.includes('apologize') && 
 *        !behaviorEngine.shouldApologize(relationship, 'latency')) {
 *      response = response.replace(/^I apologize for.*?\n/, '');
 *    }
 *    
 *    // Rule 3: Adjust verbosity
 *    const verbosity = behaviorEngine.getVerbosityLevel(relationship);
 *    if (verbosity < 40) {
 *      response = abbreviateResponse(response); // Your abbreviation logic
 *    }
 *    
 *    return response;
 *    ```
 * 
 * ─────────────────────────────────────────────────────────────────
 * 
 * 4. UPDATE RELATIONSHIP ON INTERACTION
 * 
 *    After successful interactions, optionally improve trust:
 * 
 *    ```typescript
 *    // After response sent successfully
 *    if (was_helpful) {
 *      // Increment trust for normal users
 *      if (relationship.type === 'normal' && relationship.trust_level < 100) {
 *        await relationshipRepo.incrementTrust(vi_user_id, 5);
 *      }
 *    }
 *    ```
 * 
 * ─────────────────────────────────────────────────────────────────
 * 
 * 5. ACCEPTANCE TESTS
 * 
 *    Key tests to validate Phase 2:
 * 
 *    - ✅ Owner mode vs public mode produce different posture
 *    - ✅ Same prompt: owner gets concise, public gets verbose
 *    - ✅ Same prompt: owner gets fewer disclaimers, public gets more
 *    - ✅ Factual correctness identical across modes
 *    - ✅ Relationship data persists across sessions
 *    - ✅ Trust level changes reflected in behavior
 * 
 *    Run:
 *    npm run test -- behavior-rules.e2e.test.ts
 *    npm run test -- relationship.owner-vs-public.e2e.test.ts
 * 
 * ─────────────────────────────────────────────────────────────────
 * 
 * BEHAVIOR RULES REFERENCE
 * ========================
 * 
 * Owner Mode (relationship_type = 'owner'):
 *   • Minimal apologies (< 10% frequency)
 *   • Rare disclaimers (< 15%)
 *   • High initiative (> 70%)
 *   • Personal depth (> 80%)
 *   • Luxury presence ("At your command.", "Done.", etc.)
 *   • Concise verbosity (< 40%)
 * 
 * Trusted Mode (relationship_type = 'trusted'):
 *   • Moderate apologies (25-30%)
 *   • Balanced disclaimers (35%)
 *   • Medium initiative (50%)
 *   • Warm depth (60%)
 *   • Balanced presence
 *   • Medium verbosity (50%)
 * 
 * Public Mode (relationship_type = 'normal' with low trust):
 *   • Standard apologies (40%)
 *   • Standard disclaimers (60%)
 *   • Low initiative (< 30%)
 *   • Professional distance (30%)
 *   • Formal phrases ("How can I help?", etc.)
 *   • Detailed verbosity (> 70%)
 * 
 * Restricted Mode (relationship_type = 'restricted'):
 *   • Frequent apologies (70%)
 *   • Many disclaimers (90%)
 *   • No initiative (< 5%)
 *   • Maximum distance (< 15%)
 *   • Formal, careful tone
 *   • Maximum caution
 * 
 * ─────────────────────────────────────────────────────────────────
 * 
 * TYPE DEFINITIONS
 * ================
 * 
 * RelationshipContext {
 *   type: 'owner' | 'trusted' | 'normal' | 'restricted'
 *   trust_level: 0-100
 *   interaction_mode: 'assistant' | 'companion' | 'operator' | 'lorekeeper'
 *   tone_preference?: 'direct' | 'elegant' | 'playful' | 'warm' | 'neutral'
 *   voice_profile: string (default: 'LUXE_ORIGIN')
 * }
 * 
 * BehaviorRules {
 *   presence_profile: 'luxe_owner' | 'elegant_professional' | 'careful_assistant'
 *   formality_level: 0-100
 *   apology_frequency: 0-100
 *   disclaimer_level: 0-100
 *   initiative_level: 0-100
 *   relational_depth: 0-100
 *   warmth_factor: 0-100
 * }
 * 
 * ─────────────────────────────────────────────────────────────────
 * 
 * DATABASE SCHEMA
 * ===============
 * 
 * user_profiles table now includes:
 * 
 *   relationship_type TEXT DEFAULT 'normal'
 *   trust_level INT DEFAULT 0 (0-100)
 *   interaction_mode TEXT DEFAULT 'assistant'
 *   tone_preference TEXT
 *   voice_profile TEXT DEFAULT 'LUXE_ORIGIN'
 *   updated_at TIMESTAMP (auto-updated)
 * 
 * Run migration:
 *   npm run migrate:dev
 * 
 * ─────────────────────────────────────────────────────────────────
 * 
 * LOGGING & OBSERVABILITY
 * =======================
 * 
 * All resolvers and engines log at DEBUG level:
 *   [RelationshipResolver] Resolved
 *   [BehaviorRulesEngine] Generated rules
 *   [RelationshipRepository] Saved
 * 
 * Errors logged at ERROR level with full context.
 * 
 * Monitor: Count of owner vs public vs restricted users
 * Monitor: Average trust level over time
 * Monitor: Relationship type distribution
 * 
 * ─────────────────────────────────────────────────────────────────
 * 
 * NEXT STEPS (After Phase 2 Integration)
 * =======================================
 * 
 * Phase 3: Cross-Session Personality Persistence
 *   • Preferences survive session boundaries
 *   • Tone corrections remembered
 *   • Interaction mode preferences persisted
 * 
 * Phase 4: Astralis Codex Canon Integration
 *   • Canon facts injected into responses
 *   • Lore enforcement automated
 * 
 * Phase 5: Presence Layer (Luxury Voice)
 *   • Fine-tuned phrase selection
 *   • Controlled luxury posture
 * 
 * ─────────────────────────────────────────────────────────────────
 */
