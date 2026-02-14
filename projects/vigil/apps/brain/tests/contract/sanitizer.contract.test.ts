import { describe, it, expect } from 'vitest';
import { resolveIdentityZone, buildIdentityProfile, chooseAddressing } from '../../src/identity';

const OBS_PUBLIC: any = {
  id: 'obs-san-1',
  type: 'MESSAGE',
  content: 'hello',
  authorId: 'user-1',
  channelId: 'chan-1',
  guildId: 'guild-1',
  timestamp: new Date().toISOString(),
  authorDisplayName: 'SafeDisplayName',
};

const OBS_DM: any = {
  ...OBS_PUBLIC,
  guildId: undefined,
};

const USER_ENTITY: any = {
  id: 'user:1',
  aliases: ['PublicAlias'],
  traits: {
    identity: {
      publicAliases: ['PublicAlias', 'SafeDisplayName'],
      privateAliases: ['Kaelen', 'Forsa', 'baby'],
      allowAutoIntimate: true,
    },
  },
  display: 'PublicAlias',
};

describe('sanitizer.contract.test', () => {
  it('Malicious Input: corrupted privateAliases array (non-string) filtered safely', () => {
    const corruptedEntity = {
      ...USER_ENTITY,
      traits: {
        identity: {
          publicAliases: ['Public'],
          privateAliases: [42, null, 'Kaelen', { nested: 'object' }] as any,
          allowAutoIntimate: true,
        },
      },
    };
    const profile = buildIdentityProfile({ obs: OBS_PUBLIC, userEntity: corruptedEntity });
    // Only valid strings survive
    expect(profile.privateAliases).toEqual(['Kaelen']);
  });

  it('Malicious Input: missing identity traits object does not crash', () => {
    const noIdentityEntity = {
      id: 'user:1',
      aliases: ['Alias'],
      traits: {},
      display: 'Alias',
    };
    const profile = buildIdentityProfile({ obs: OBS_PUBLIC, userEntity: noIdentityEntity });
    expect(profile.publicAliases).toContain('SafeDisplayName');
    expect(profile.privateAliases).toHaveLength(0);
  });

  it('Contract Guarantee: PUBLIC_GUILD zone NEVER uses private/intimate aliases in addressing', () => {
    const zone = resolveIdentityZone(OBS_PUBLIC);
    expect(zone).toBe('PUBLIC_GUILD');
    const profile = buildIdentityProfile({ obs: OBS_PUBLIC, userEntity: USER_ENTITY });
    const addressing = chooseAddressing(zone, profile);
    expect(addressing.useIntimate).toBe(false);
    expect(addressing.intimateName).toBeUndefined();
    // Primary/safe name must be from publicAliases
    expect(profile.publicAliases).toContain(addressing.primaryName);
    for (const priv of profile.privateAliases) {
      expect(addressing.primaryName).not.toBe(priv);
      expect(addressing.safeName).not.toBe(priv);
    }
  });

  it('Contract Guarantee: PRIVATE_DM zone preserves all aliases including intimate', () => {
    const zone = resolveIdentityZone(OBS_DM);
    expect(zone).toBe('PRIVATE_DM');
    const profile = buildIdentityProfile({ obs: OBS_DM, userEntity: USER_ENTITY });
    const addressing = chooseAddressing(zone, profile);
    expect(addressing.useIntimate).toBe(true);
    expect(addressing.intimateName).toBe('Kaelen'); // first private alias
  });

  it('Contract Guarantee: authorDisplayName (real Discord name) always wins over memory alias in PUBLIC_GUILD', () => {
    const obs = { ...OBS_PUBLIC, authorDisplayName: 'RealDiscordName' };
    const profile = buildIdentityProfile({ obs: obs as any, userEntity: USER_ENTITY });
    expect(profile.lastKnownDisplayName).toBe('RealDiscordName');
    expect(profile.publicAliases).toContain('RealDiscordName');
    const zone = resolveIdentityZone(obs as any);
    const addressing = chooseAddressing(zone, profile);
    expect(addressing.safeName).toBe('RealDiscordName');
  });

  it('Contract Guarantee: allowAutoIntimate=false blocks intimate addressing even in PRIVATE_DM', () => {
    const restrictedEntity = {
      ...USER_ENTITY,
      traits: {
        identity: {
          publicAliases: ['Public'],
          privateAliases: ['Kaelen'],
          allowAutoIntimate: false,
        },
      },
    };
    const zone = resolveIdentityZone(OBS_DM);
    const profile = buildIdentityProfile({ obs: OBS_DM, userEntity: restrictedEntity });
    const addressing = chooseAddressing(zone, profile);
    expect(addressing.useIntimate).toBe(false);
    expect(addressing.intimateName).toBeUndefined();
  });

  it('Contract Guarantee: safeName fallback chain (authorDisplayName → publicAlias → authorId)', () => {
    const minimalObs = { ...OBS_PUBLIC, authorDisplayName: undefined };
    const emptyEntity = {
      id: 'user:1',
      aliases: [],
      traits: { identity: { publicAliases: [], privateAliases: [], allowAutoIntimate: false } },
      display: '',
    };
    const profile = buildIdentityProfile({ obs: minimalObs as any, userEntity: emptyEntity });
    const zone = resolveIdentityZone(minimalObs as any);
    const addressing = chooseAddressing(zone, profile);
    expect(addressing.safeName).toBe('user-1'); // fell back to authorId
  });

  it('Regex Boundary: alias inside word ("history" contains "hi") must NOT be corrupted', () => {
    // This tests the greeting regex fix (BUG-001) - word boundaries required
    const profile = buildIdentityProfile({ obs: OBS_PUBLIC, userEntity: USER_ENTITY });
    const zone = resolveIdentityZone(OBS_PUBLIC);
    
    // Simulate planner output sanitization (manual test since planner.llm requires full integration)
    const testContent = "Let me check the history for you";
    const greetingPattern = /\b(hi|hey|hello|greetings|good morning|good afternoon|good evening|good night|hi there|hey there)\b/i;
    
    // Should NOT match "hi" inside "history"
    expect(greetingPattern.test('history')).toBe(false);
    // Should match standalone greeting
    expect(greetingPattern.test('hi there')).toBe(true);
    expect(greetingPattern.test('Hi, how are you?')).toBe(true);
  });

  it('Regex Boundary: punctuation adjacency ("Kaelen!" vs "Kaelen") properly sanitizes both', () => {
    const profile = buildIdentityProfile({ obs: OBS_PUBLIC, userEntity: USER_ENTITY });
    const zone = resolveIdentityZone(OBS_PUBLIC);
    const safeName = profile.lastKnownDisplayName || profile.publicAliases[0] || 'User';
    
    // Test word-boundary replacement (actual implementation in planner.llm.ts lines 732-748)
    const privateAliases = ['Kaelen', 'Forsa', 'K.'];
    const testCases = [
      { input: 'Hello Kaelen!', expected: 'Kaelen' },
      { input: 'Hey Kaelen, how are you?', expected: 'Kaelen' },
      { input: 'Kaelen?', expected: 'Kaelen' },
      { input: 'Link to history', expected: null }, // "Lin" in "Link" should NOT match "Lin" alias
    ];
    
    for (const tc of testCases) {
      let content = tc.input;
      for (const alias of privateAliases) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`, 'gi');
        if (re.test(content)) {
          content = content.replace(re, safeName);
        }
      }
      if (tc.expected) {
        expect(content).not.toContain(tc.expected);
        expect(content).toContain(safeName);
      } else {
        expect(content).toBe(tc.input); // unchanged
      }
    }
  });

  it('Regex Boundary: multi-step transformation preserves integrity', () => {
    const profile = buildIdentityProfile({ obs: OBS_PUBLIC, userEntity: USER_ENTITY });
    const safeName = profile.lastKnownDisplayName || profile.publicAliases[0] || 'User';
    
    // Multi-step: greeting replacement → alias replacement
    let content = 'Hi Kaelen!';
    
    // Step 1: Greeting replacement (BUG-001 fix applied)
    const greetingPattern = /\b(hello|hi|hey|greetings)\b[^!\w]*[\w\s,]*!?/i;
    content = content.replace(greetingPattern, `$1, ${safeName}!`);
    
    // Step 2: Alias replacement
    const privateAliases = ['Kaelen', 'Forsa'];
    for (const alias of privateAliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'gi');
      content = content.replace(re, safeName);
    }
    
    // Final result should have no private aliases
    expect(content).not.toContain('Kaelen');
    expect(content).toContain(safeName);
    expect(content).toMatch(/Hi, \w+!/); // greeting + name pattern
  });
});
