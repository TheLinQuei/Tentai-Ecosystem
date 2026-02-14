import { describe, it, expect } from 'vitest';
import { resolveIdentityZone, buildIdentityProfile, chooseAddressing } from '../../src/identity';

const BASE_OBS = {
  id: 'o-1',
  type: 'MESSAGE',
  content: 'hello',
  authorId: 'user-77',
  channelId: 'ch-1',
  timestamp: new Date().toISOString(),
  authorDisplayName: 'PublicNick',
};

describe('identity.unit.test', () => {
  it('Happy Path: PUBLIC_GUILD zone excludes private aliases in addressing', () => {
    const obs = { ...BASE_OBS, guildId: 'guild-123' };
    const zone = resolveIdentityZone(obs as any);
    expect(zone).toBe('PUBLIC_GUILD');
    const profile = buildIdentityProfile({
      obs: obs as any,
      userEntity: {
        id: 'user:77',
        aliases: ['MemoryAlias'],
        traits: {
          identity: {
            publicAliases: ['MemoryAlias'],
            privateAliases: ['Kaelen', 'Forsa'],
            allowAutoIntimate: true,
          },
        },
        display: 'DisplayFromMemory',
      },
    });
    const addressing = chooseAddressing(zone, profile);
    expect(addressing.useIntimate).toBe(false);
    // Ensure primaryName is a public alias and not any private alias
    expect(['Kaelen', 'Forsa']).not.toContain(addressing.primaryName);
  });

  it('Edge Path: PRIVATE_DM preserves private alias and may allow intimacy when flag true', () => {
    const obs = { ...BASE_OBS, guildId: undefined };
    const zone = resolveIdentityZone(obs as any);
    expect(zone).toBe('PRIVATE_DM');
    const profile = buildIdentityProfile({
      obs: obs as any,
      userEntity: {
        id: 'user:77',
        aliases: [],
        traits: {
          identity: {
            publicAliases: ['DMNick'],
            privateAliases: ['baby'],
            allowAutoIntimate: true,
          },
        },
        display: 'DMNick',
      },
    });
    const addressing = chooseAddressing(zone, profile);
    expect(addressing.useIntimate).toBe(true);
    expect(addressing.intimateName).toBe('baby');
  });

  it('Hostile Path: corrupted traits object (non-array aliases) handled safely', () => {
    const obs = { ...BASE_OBS, guildId: 'guild-X' };
    const zone = resolveIdentityZone(obs as any);
    const profile = buildIdentityProfile({
      obs: obs as any,
      userEntity: {
        id: 'user:77',
        aliases: ['PrimaryAlias'],
        traits: { identity: { publicAliases: 'NOT_ARRAY' as any, privateAliases: 42 as any } },
        display: 'PrimaryAlias',
      },
    });
    expect(profile.publicAliases).toContain('PrimaryAlias');
    expect(profile.privateAliases).toHaveLength(0); // invalid private aliases dropped
    const addressing = chooseAddressing(zone, profile);
    // Addressing correctly prioritizes authorDisplayName ('PublicNick') over publicAlias
    expect(addressing.safeName).toBe('PublicNick');
  });

  it('Canon Enforcement: TRUSTED zone preserves private aliases but does not auto-intimate when flag false', () => {
    // Simulate future TRUSTED behavior by forcing zone value directly
    const zone = 'TRUSTED' as const;
    const profile = {
      userId: 'user-99',
      publicAliases: ['PubA'],
      privateAliases: ['IntimateA'],
      allowAutoIntimate: false,
      lastKnownDisplayName: 'PubA',
      lastUpdated: new Date().toISOString(),
    };
    const addressing = chooseAddressing(zone, profile as any);
    expect(addressing.useIntimate).toBe(false);
    expect(addressing.intimateName).toBeUndefined();
  });

  it('Canon Enforcement Edge: PUBLIC_GUILD safeName fallback to authorId when no aliases', () => {
    const obs = { ...BASE_OBS, guildId: 'guild-999', authorDisplayName: undefined };
    const zone = resolveIdentityZone(obs as any);
    const profile = buildIdentityProfile({
      obs: obs as any,
      userEntity: {
        id: 'user:77',
        aliases: [],
        traits: { identity: { publicAliases: [], privateAliases: ['Kaelen'], allowAutoIntimate: true } },
        display: '',
      },
    });
    const addressing = chooseAddressing(zone, profile);
    expect(addressing.safeName).toBe('user-77');
  });

  it('Boundary: private alias substring of public alias does NOT alter addressing (ISSUE-034)', () => {
    const obs = { ...BASE_OBS, guildId: 'guild-1', authorDisplayName: 'Kaelen' };
    const profile = buildIdentityProfile({
      obs: obs as any,
      userEntity: {
        id: 'user:77',
        aliases: ['Kaelen'],
        traits: { identity: { publicAliases: ['Kaelen'], privateAliases: ['Kael'], allowAutoIntimate: true } },
        display: 'Kaelen',
      },
    });
    const addressing = chooseAddressing('PUBLIC_GUILD', profile);
    expect(addressing.primaryName).toBe('Kaelen');
    expect(addressing.primaryName).not.toBe('Kael');
    expect(addressing.useIntimate).toBe(false);
  });

  it('Boundary: case + whitespace duplicates are preserved (identifies normalization gap, ISSUE-033)', () => {
    const obs = { ...BASE_OBS, guildId: 'guild-2', authorDisplayName: 'PublicNick' };
    const profile = buildIdentityProfile({
      obs: obs as any,
      userEntity: {
        id: 'user:77',
        aliases: ['  kaelen  ', 'KAELEN'],
        traits: { identity: { publicAliases: ['Kaelen'], privateAliases: [], allowAutoIntimate: false } },
        display: 'kaelen',
      },
    });
    // Current implementation keeps raw forms (Set collapse only trims leading/trailing whitespace)
    // Shows need for canonicalization; test asserts present duplication prior to fix
    const lower = profile.publicAliases.map(a => a.toLowerCase());
    // Expect at least one duplicate lowercased variant
    const hasDuplicateLower = lower.some((a, i) => lower.indexOf(a) !== i);
    expect(hasDuplicateLower).toBe(true); // indicates normalization gap
  });

  it('Boundary: allowAutoIntimate false even with private aliases blocks useIntimate in PRIVATE_DM', () => {
    const obs = { ...BASE_OBS, guildId: undefined };
    const profile = buildIdentityProfile({
      obs: obs as any,
      userEntity: {
        id: 'user:77',
        aliases: ['Nick'],
        traits: { identity: { publicAliases: ['Nick'], privateAliases: ['Sweet'], allowAutoIntimate: false } },
        display: 'Nick',
      },
    });
    const addressing = chooseAddressing('PRIVATE_DM', profile);
    expect(addressing.useIntimate).toBe(false);
    expect(addressing.intimateName).toBeUndefined();
  });
});
