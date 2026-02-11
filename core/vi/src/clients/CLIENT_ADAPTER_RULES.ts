/**
 * CLIENT_ADAPTER_RULES.ts
 *
 * Canonical rules for client adapters (Sovereign, Vigil, Astralis, Console)
 * 
 * Phase 7: Cross-Client Adapter Standardization
 * 
 * PURPOSE: Ensure all clients are "ports" not "personalities"
 * GUARANTEE: Same user + context = consistent behavior across all clients
 * LAW: Clients adapt I/O, Vi controls persona
 */

/**
 * RULE 1: Send Provider Identity, Never Invent Persona
 * 
 * ✅ CORRECT:
 * ```typescript
 * await fetch('/v1/chat', {
 *   headers: {
 *     'X-Provider': 'discord',
 *     'X-Provider-User-ID': discordUserId
 *   },
 *   body: { message: userMessage }
 * });
 * ```
 * 
 * ❌ FORBIDDEN:
 * ```typescript
 * await fetch('/v1/chat', {
 *   body: {
 *     message: userMessage,
 *     persona: 'flirty',  // NEVER override persona
 *     tone: 'casual'       // NEVER inject tone
 *   }
 * });
 * ```
 */

/**
 * RULE 2: Call IdentityResolver Before /v1/chat
 * 
 * ✅ CORRECT:
 * ```typescript
 * // Resolve identity first
 * const viUserId = await identityResolver.resolveIdentity({
 *   provider: 'sovereign',
 *   provider_user_id: jwtSub
 * });
 * 
 * // Then call /v1/chat with vi_user_id
 * await fetch('/v1/chat', {
 *   headers: { 'X-Vi-User-ID': viUserId },
 *   body: { message }
 * });
 * ```
 * 
 * ❌ FORBIDDEN:
 * ```typescript
 * // Sending provider ID directly without mapping
 * await fetch('/v1/chat', {
 *   body: { userId: jwtSub, message }  // Wrong: not mapped to vi_user_id
 * });
 * ```
 */

/**
 * RULE 3: Pass Mode Hints Only, Never Override Core Behavior
 * 
 * ✅ CORRECT (Hints):
 * ```typescript
 * await fetch('/v1/chat', {
 *   body: {
 *     message,
 *     context: {
 *       lore_mode_request: true,  // Hint: user wants lore context
 *       verbose: false             // Hint: user prefers concise
 *     }
 *   }
 * });
 * ```
 * 
 * ❌ FORBIDDEN (Overrides):
 * ```typescript
 * await fetch('/v1/chat', {
 *   body: {
 *     message,
 *     force_response: 'Be flirty and casual',  // NEVER force behavior
 *     override_persona: customPersona          // NEVER override selfModel
 *   }
 * });
 * ```
 */

/**
 * RULE 4: Share Test Harness Patterns
 * 
 * Every client MUST implement:
 * 1. Identity mapping test
 * 2. Cross-session continuity test
 * 3. Relationship context test
 */

export const CLIENT_ADAPTER_RULES = {
  /**
   * Validate client request follows adapter rules
   */
  validateRequest(request: {
    provider?: string;
    provider_user_id?: string;
    vi_user_id?: string;
    message: string;
    context?: any;
  }): { valid: boolean; violations: string[] } {
    const violations: string[] = [];

    // RULE 1: Must send provider identity
    if (!request.provider && !request.vi_user_id) {
      violations.push("Missing provider identity (provider + provider_user_id OR vi_user_id)");
    }

    // RULE 2: Must have message
    if (!request.message || request.message.trim().length === 0) {
      violations.push("Missing or empty message");
    }

    // RULE 3: Check for forbidden overrides
    const forbiddenKeys = [
      'persona',
      'tone',
      'force_response',
      'override_persona',
      'custom_persona',
      'force_mode',
      'override_self_model',
    ];

    const contextKeys = Object.keys(request.context || {});
    const foundForbidden = contextKeys.filter(k => forbiddenKeys.includes(k));
    if (foundForbidden.length > 0) {
      violations.push(`Forbidden keys in context: ${foundForbidden.join(', ')}`);
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  },

  /**
   * Validate client response handling
   */
  validateResponseHandling(clientCode: string): { valid: boolean; violations: string[] } {
    const violations: string[] = [];

    // Check if client is modifying response before displaying
    if (clientCode.includes('response.output.replace(') ||
        clientCode.includes('response.output.toLowerCase()') ||
        clientCode.includes('modifyResponse(')) {
      violations.push("Client is modifying Vi's response output");
    }

    // Check if client is injecting its own personality
    if (clientCode.includes('addPersonality(') ||
        clientCode.includes('injectTone(') ||
        clientCode.includes('formatWithPersona(')) {
      violations.push("Client is injecting personality into response");
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  },

  /**
   * Get adapter compliance checklist for client team
   */
  getComplianceChecklist(): string[] {
    return [
      '✅ Client sends provider + provider_user_id to IdentityResolver',
      '✅ Client receives vi_user_id and uses it for all /v1/chat requests',
      '✅ Client does NOT modify response.output before displaying',
      '✅ Client does NOT inject tone, persona, or custom behavior',
      '✅ Client passes mode hints in context (lore_mode, verbose) but never forces',
      '✅ Client implements cross-client identity test (same user across clients)',
      '✅ Client implements cross-session continuity test (preferences persist)',
      '✅ Client implements relationship context test (owner vs public behavior)',
    ];
  },
};

/**
 * Client Integration Test Template
 * 
 * All clients MUST pass this test suite
 */
export const CLIENT_TEST_TEMPLATE = `
import { describe, it, expect } from 'vitest';
import { IdentityResolver } from '../src/identity/IdentityResolver';
import { YourClientAdapter } from './adapter';

describe('Client Adapter Compliance', () => {
  it('should resolve provider identity to vi_user_id', async () => {
    const resolver = new IdentityResolver(pool);
    const adapter = new YourClientAdapter();

    const providerUserId = 'provider_123';
    const viUserId = await resolver.resolveIdentity({
      provider: 'your_provider',
      provider_user_id: providerUserId,
    });

    expect(viUserId).toBeDefined();
    expect(viUserId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
  });

  it('should send vi_user_id to /v1/chat', async () => {
    const adapter = new YourClientAdapter();
    const request = adapter.buildChatRequest('Hello Vi', { userId: 'user_123' });

    expect(request.headers['X-Vi-User-ID']).toBeDefined();
    expect(request.body.message).toBe('Hello Vi');
  });

  it('should NOT modify response output', async () => {
    const adapter = new YourClientAdapter();
    const response = { output: 'At your command.', recordId: 'rec_1', sessionId: 'sess_1' };

    const displayed = adapter.displayResponse(response);
    expect(displayed).toBe('At your command.'); // No modifications
  });

  it('should pass hints, never overrides', async () => {
    const adapter = new YourClientAdapter();
    const request = adapter.buildChatRequest('Who is Movado?', {
      userId: 'user_123',
      lore_mode_hint: true,  // ✅ Hint
    });

    expect(request.context?.lore_mode_request).toBe(true);
    expect(request.context?.force_response).toBeUndefined();  // ❌ No force
    expect(request.context?.persona).toBeUndefined();         // ❌ No persona
  });

  it('should preserve identity across sessions', async () => {
    const resolver = new IdentityResolver(pool);
    const adapter = new YourClientAdapter();

    // Session 1
    const viUserId1 = await resolver.resolveIdentity({
      provider: 'your_provider',
      provider_user_id: 'provider_123',
    });

    // Session 2 (hours later)
    const viUserId2 = await resolver.resolveIdentity({
      provider: 'your_provider',
      provider_user_id: 'provider_123',
    });

    expect(viUserId1).toBe(viUserId2); // Same user = same vi_user_id
  });
});
`;
