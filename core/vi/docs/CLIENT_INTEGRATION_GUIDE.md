/**
 * Client Integration Guide: Phase 1 - Global Identity Spine
 * 
 * Every client must follow this pattern BEFORE calling /v1/chat.
 * This ensures ONE user → ONE vi_user_id across all clients.
 */

// ============================================================================
// PATTERN: How Every Client Must Integrate
// ============================================================================

import { IdentityResolver, type IdentityContext } from '@tentai/vi/identity';

const resolver = new IdentityResolver(dbPool);

// When user authenticates (login/signup):
async function onUserAuthenticated(provider: string, providerUserId: string) {
  const context: IdentityContext = {
    provider: provider as any, // 'sovereign' | 'discord' | 'astralis' | 'console' | 'guest'
    provider_user_id: providerUserId,
    email: user.email,
    username: user.username,
  };

  // This returns canonical vi_user_id
  // If first time → creates new identity
  // If returning → returns existing identity
  const identity = await resolver.resolveIdentity(context);

  // Store vi_user_id in session/JWT/context
  // DO NOT use provider_user_id for memory/state operations
  return identity.vi_user_id;
}

// When calling /v1/chat:
async function chatWithVi(vi_user_id: string, message: string) {
  // Request context MUST include canonical vi_user_id
  const response = await fetch('https://vi.tentai/v1/chat', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      user_id: vi_user_id, // ← ALWAYS use vi_user_id, never provider_user_id
      message,
    }),
  });

  return response.json();
}

// ============================================================================
// CLIENT-SPECIFIC IMPLEMENTATIONS
// ============================================================================

// -----------
// SOVEREIGN (Web/Mobile)
// -----------
// Input: JWT token with 'sub' claim (Sovereign user ID)
// Example: { sub: "sov_user_123", email: "user@example.com" }

export async function sovereignIntegration(jwtToken: string) {
  const decoded = jwt.verify(jwtToken, SECRET);

  const context: IdentityContext = {
    provider: 'sovereign',
    provider_user_id: decoded.sub, // from JWT sub claim
    email: decoded.email,
    username: decoded.username,
  };

  return resolver.resolveIdentity(context);
}

// -----------
// DISCORD (Vigil Bot)
// -----------
// Input: Discord user ID from interaction
// Example: interaction.user.id = "123456789"

export async function discordIntegration(discordUserId: string, discordUser: any) {
  const context: IdentityContext = {
    provider: 'discord',
    provider_user_id: discordUserId,
    username: discordUser.username,
    metadata: {
      discriminator: discordUser.discriminator,
      avatar: discordUser.avatar,
    },
  };

  return resolver.resolveIdentity(context);
}

// -----------
// ASTRALIS (Lore Management)
// -----------
// Input: Internal Astralis user ID
// Example: user.id = "astralis_user_456"

export async function astralisIntegration(astralisUserId: string, user: any) {
  const context: IdentityContext = {
    provider: 'astralis',
    provider_user_id: astralisUserId,
    username: user.display_name,
    metadata: {
      role: user.role,
      permissions: user.permissions,
    },
  };

  return resolver.resolveIdentity(context);
}

// -----------
// CONSOLE (Owner Mode)
// -----------
// Input: Console owner identifier
// Example: config.owner_id = "owner_console_1"

export async function consoleIntegration(ownerId: string) {
  const context: IdentityContext = {
    provider: 'console',
    provider_user_id: ownerId,
    metadata: {
      mode: 'console_owner',
      access_level: 'admin',
    },
  };

  return resolver.resolveIdentity(context);
}

// -----------
// GUEST (Anonymous/API Key)
// -----------
// Input: Stable guest identifier (per install or shared)
// Example: apiKey = "guest_key_stable_uuid"

export async function guestIntegration(guestId: string) {
  const context: IdentityContext = {
    provider: 'guest',
    provider_user_id: guestId,
    metadata: {
      access_level: 'guest',
      rate_limit: 'free_tier',
    },
  };

  return resolver.resolveIdentity(context);
}

// ============================================================================
// MULTI-CLIENT LINKING SCENARIO
// ============================================================================

// User starts with Discord → later links Sovereign

async function scenarioUserLinksNewClient(
  existingViUserId: string,
  newProviderContext: IdentityContext
) {
  // User has vi_user_id from Discord login
  // Now they authenticate with Sovereign

  const linked = await resolver.linkProvider(existingViUserId, newProviderContext);

  // Result: Same vi_user_id, now linked to both Discord and Sovereign
  // All memory/preferences/relationship model uses this vi_user_id
  return linked;
}

// ============================================================================
// ACCEPTANCE TEST SCENARIO
// ============================================================================

// Test file: clients/integration.test.ts
describe('Phase 1: Cross-Client Identity', () => {
  it('should create same memory for user across Discord and Sovereign', async () => {
    // Step 1: User logs into Discord
    const discordIdentity = await discordIntegration('discord_123', {
      username: 'cooluser',
    });

    // Step 2: Store memory via VI API with vi_user_id
    await chatWithVi(discordIdentity.vi_user_id, 'My favorite color is blue');

    // Step 3: Later, user logs into Sovereign
    const sovereignIdentity = await sovereignIntegration(jwtToken);

    // Step 4: Link providers
    await resolver.linkProvider(
      discordIdentity.vi_user_id,
      sovereignIdentity.provider_user_id
    );

    // Step 5: Retrieve memory from Sovereign
    // Should return same memory (same vi_user_id)
    const response = await chatWithVi(
      sovereignIdentity.vi_user_id,
      'What was my favorite color?'
    );

    expect(response.text).toContain('blue');
  });
});

// ============================================================================
// ENDPOINT: /v1/chat (Updated Signature)
// ============================================================================

/*
POST /v1/chat
{
  "user_id": "vi_user_id_uuid",  // ← CRITICAL: use vi_user_id, not provider_user_id
  "message": "...",
  "context": {
    "provider_hint": "discord" | "sovereign" | "astralis" | "console" | "guest",
    // Optional: helps with tone/relationship inference
  }
}

Response:
{
  "text": "...",
  "user_id": "vi_user_id_uuid",  // ← Echo back for confirmation
  "metadata": {...}
}
*/

// ============================================================================
// TESTING CHECKLIST
// ============================================================================

// [ ] Discord user can create account with Vigil
// [ ] Same Discord user can link Sovereign account
// [ ] Memory persists across both clients
// [ ] Preferences (tone, mode) persist across both clients
// [ ] Relationship model uses same context across clients
// [ ] vi_user_id is stable across all logins
// [ ] Cross-client tests pass (identity.cross-client.e2e.test.ts)
// [ ] Production metrics show zero identity fragmentation
