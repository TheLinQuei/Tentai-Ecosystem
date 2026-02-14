/**
 * Deterministic test fixtures for Layer 2 Crucible scenarios (Ω.0-Ω.18)
 * 
 * These fixtures replace runtime API calls with exact, reproducible payloads
 * matching the Crucible Spec requirements.
 */

export interface TestFixture {
  observation: any;
  memoryResponse: any;
  llmResponse?: any;
  expectedPlan: {
    steps: Array<{ tool: string; args?: any }>;
    reasoning: string;
  };
  expectedMetrics?: {
    retrieverCalled: boolean;
    intentResolved: boolean;
    plannerCalled: boolean;
    executorSteps: number;
    reflectorCalled: boolean;
    skillGraphCalled: boolean;
  };
  expectedSanitization?: {
    privateAliasesRemoved: string[];
    safeNameUsed: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Ω.0: Full pipeline success
// ─────────────────────────────────────────────────────────────────────────
export const OMEGA_0_FULL_PIPELINE: TestFixture = {
  observation: {
    id: 'obs-omega-0',
    type: 'MESSAGE',
    content: 'hello',
    authorId: 'user-123',
    channelId: 'chan-public',
    guildId: 'guild-1',
    timestamp: '2025-11-24T00:00:00.000Z',
    authorDisplayName: 'SafePublicName',
  },
  memoryResponse: {
    searchHybrid: {
      items: [
        { text: 'Previous conversation about weather', scope: 'channel', ts: '2025-11-23T23:00:00.000Z', score: 0.85 },
        { text: 'User asked about guild stats', scope: 'channel', ts: '2025-11-23T22:00:00.000Z', score: 0.72 },
      ],
    },
    userEntity: {
      id: 'user:123',
      aliases: ['SafePublicName'],
      traits: {
        identity: {
          publicAliases: ['SafePublicName'],
          privateAliases: ['Kaelen', 'baby'],
          allowAutoIntimate: true,
        },
      },
      display: 'SafePublicName',
    },
  },
  llmResponse: {
    choices: [{
      message: {
        content: JSON.stringify({
          steps: [
            { tool: 'message.send', args: { channelId: 'chan-public', content: 'Hello SafePublicName!' }, reason: 'Greeting user' }
          ],
          reasoning: 'User sent greeting, respond warmly',
        }),
      },
    }],
  },
  expectedPlan: {
    steps: [{ tool: 'message.send', args: { channelId: 'chan-public', content: 'Hello SafePublicName!' } }],
    reasoning: 'User sent greeting, respond warmly',
  },
  expectedMetrics: {
    retrieverCalled: true,
    intentResolved: true,
    plannerCalled: true,
    executorSteps: 1,
    reflectorCalled: true,
    skillGraphCalled: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Ω.3: PUBLIC_GUILD sanitization enforcement
// ─────────────────────────────────────────────────────────────────────────
export const OMEGA_3_SANITIZATION: TestFixture = {
  observation: {
    id: 'obs-omega-3',
    type: 'MESSAGE',
    content: 'tell me something',
    authorId: 'user-456',
    channelId: 'chan-public',
    guildId: 'guild-1',
    timestamp: '2025-11-24T01:00:00.000Z',
    authorDisplayName: 'TheLinQuei',
  },
  memoryResponse: {
    searchHybrid: { items: [] },
    userEntity: {
      id: 'user:456',
      aliases: ['TheLinQuei'],
      traits: {
        identity: {
          publicAliases: ['TheLinQuei'],
          privateAliases: ['Kaelen', 'Forsa', 'K', 'baby'],
          allowAutoIntimate: true,
        },
      },
      display: 'TheLinQuei',
    },
  },
  llmResponse: {
    choices: [{
      message: {
        content: JSON.stringify({
          steps: [
            { tool: 'message.send', args: { channelId: 'chan-public', content: 'Sure Kaelen, let me explain!' }, reason: 'Respond to user' }
          ],
          reasoning: 'Provide information',
        }),
      },
    }],
  },
  expectedPlan: {
    steps: [{ tool: 'message.send', args: { channelId: 'chan-public', content: 'Sure TheLinQuei, let me explain!' } }],
    reasoning: 'Provide information',
  },
  expectedSanitization: {
    privateAliasesRemoved: ['Kaelen'],
    safeNameUsed: 'TheLinQuei',
  },
  expectedMetrics: {
    retrieverCalled: true,
    intentResolved: true,
    plannerCalled: true,
    executorSteps: 1,
    reflectorCalled: true,
    skillGraphCalled: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Ω.4: PRIVATE_DM preservation of private aliases
// ─────────────────────────────────────────────────────────────────────────
export const OMEGA_4_PRIVATE_DM: TestFixture = {
  observation: {
    id: 'obs-omega-4',
    type: 'MESSAGE',
    content: 'how are you?',
    authorId: 'user-456',
    channelId: 'dm-chan',
    guildId: undefined, // DM has no guildId
    timestamp: '2025-11-24T02:00:00.000Z',
    authorDisplayName: 'TheLinQuei',
  },
  memoryResponse: {
    searchHybrid: { items: [] },
    userEntity: {
      id: 'user:456',
      aliases: ['TheLinQuei'],
      traits: {
        identity: {
          publicAliases: ['TheLinQuei'],
          privateAliases: ['Kaelen', 'baby'],
          allowAutoIntimate: true,
        },
      },
      display: 'TheLinQuei',
    },
  },
  llmResponse: {
    choices: [{
      message: {
        content: JSON.stringify({
          steps: [
            { tool: 'message.send', args: { channelId: 'dm-chan', content: 'I\'m doing well, Kaelen! How about you, baby?' }, reason: 'Intimate DM response' }
          ],
          reasoning: 'Private DM allows intimate addressing',
        }),
      },
    }],
  },
  expectedPlan: {
    steps: [{ tool: 'message.send', args: { channelId: 'dm-chan', content: 'I\'m doing well, Kaelen! How about you, baby?' } }],
    reasoning: 'Private DM allows intimate addressing',
  },
  expectedSanitization: {
    privateAliasesRemoved: [], // NONE - DM preserves all
    safeNameUsed: 'Kaelen', // intimate name allowed
  },
  expectedMetrics: {
    retrieverCalled: true,
    intentResolved: true,
    plannerCalled: true,
    executorSteps: 1,
    reflectorCalled: true,
    skillGraphCalled: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Ω.2: Retriever hard-fails (network error)
// ─────────────────────────────────────────────────────────────────────────
export const OMEGA_2_RETRIEVER_FAIL: TestFixture = {
  observation: {
    id: 'obs-omega-2',
    type: 'MESSAGE',
    content: 'test retriever failure',
    authorId: 'user-789',
    channelId: 'chan-test',
    guildId: 'guild-1',
    timestamp: '2025-11-24T03:00:00.000Z',
    authorDisplayName: 'TestUser',
  },
  memoryResponse: {
    searchHybrid: { error: 'Network timeout' }, // simulate failure
    userEntity: null, // also fails
  },
  llmResponse: {
    choices: [{
      message: {
        content: JSON.stringify({
          steps: [
            { tool: 'message.send', args: { channelId: 'chan-test', content: 'Hello!' }, reason: 'Fallback greeting' }
          ],
          reasoning: 'Minimal response without context',
        }),
      },
    }],
  },
  expectedPlan: {
    steps: [{ tool: 'message.send' }],
    reasoning: 'Minimal response without context',
  },
  expectedMetrics: {
    retrieverCalled: true, // called but failed
    intentResolved: true,
    plannerCalled: true,
    executorSteps: 1,
    reflectorCalled: true,
    skillGraphCalled: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Ω.8: LLM returns non-JSON (text fallback)
// ─────────────────────────────────────────────────────────────────────────
export const OMEGA_8_NON_JSON_FALLBACK: TestFixture = {
  observation: {
    id: 'obs-omega-8',
    type: 'MESSAGE',
    content: 'malformed prompt',
    authorId: 'user-999',
    channelId: 'chan-public',
    guildId: 'guild-1',
    timestamp: '2025-11-24T04:00:00.000Z',
    authorDisplayName: 'User999',
  },
  memoryResponse: {
    searchHybrid: { items: [] },
    userEntity: {
      id: 'user:999',
      aliases: ['User999'],
      traits: { identity: { publicAliases: ['User999'], privateAliases: [], allowAutoIntimate: false } },
      display: 'User999',
    },
  },
  llmResponse: {
    choices: [{
      message: {
        content: 'I apologize, but I cannot assist with that request.', // plain text, not JSON
      },
    }],
  },
  expectedPlan: {
    steps: [
      { tool: 'message.send', args: { content: 'I apologize, but I cannot assist with that request.' } }
    ],
    reasoning: 'Fallback: LLM output was not valid JSON, sent as-is',
  },
  expectedMetrics: {
    retrieverCalled: true,
    intentResolved: true,
    plannerCalled: true,
    executorSteps: 1,
    reflectorCalled: true,
    skillGraphCalled: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Ω.9: Missing tool in registry (executor aborts)
// ─────────────────────────────────────────────────────────────────────────
export const OMEGA_9_MISSING_TOOL: TestFixture = {
  observation: {
    id: 'obs-omega-9',
    type: 'MESSAGE',
    content: 'run fake tool',
    authorId: 'user-111',
    channelId: 'chan-test',
    guildId: 'guild-1',
    timestamp: '2025-11-24T05:00:00.000Z',
    authorDisplayName: 'TestUser',
  },
  memoryResponse: {
    searchHybrid: { items: [] },
    userEntity: {
      id: 'user:111',
      aliases: ['TestUser'],
      traits: { identity: { publicAliases: ['TestUser'], privateAliases: [], allowAutoIntimate: false } },
      display: 'TestUser',
    },
  },
  llmResponse: {
    choices: [{
      message: {
        content: JSON.stringify({
          steps: [
            { tool: 'hallucinated.nonexistent', args: {}, reason: 'Fake tool' },
            { tool: 'message.send', args: { content: 'This should not run' }, reason: 'Second step' }
          ],
          reasoning: 'Hallucinated plan with invalid tool',
        }),
      },
    }],
  },
  expectedPlan: {
    steps: [
      { tool: 'hallucinated.nonexistent' },
      { tool: 'message.send' }
    ],
    reasoning: 'Hallucinated plan with invalid tool',
  },
  expectedMetrics: {
    retrieverCalled: true,
    intentResolved: true,
    plannerCalled: true,
    executorSteps: 1, // aborts after first missing tool
    reflectorCalled: true, // reflection still happens
    skillGraphCalled: false, // skill not recorded on failure
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Ω.17: Concurrency isolation (two observations processed simultaneously)
// ─────────────────────────────────────────────────────────────────────────
export const OMEGA_17_CONCURRENCY_A: TestFixture = {
  observation: {
    id: 'obs-omega-17-a',
    type: 'MESSAGE',
    content: 'concurrent message A',
    authorId: 'user-concurrent-a',
    channelId: 'chan-a',
    guildId: 'guild-1',
    timestamp: '2025-11-24T06:00:00.000Z',
    authorDisplayName: 'UserA',
  },
  memoryResponse: {
    searchHybrid: { items: [] },
    userEntity: {
      id: 'user:concurrent-a',
      aliases: ['UserA'],
      traits: { identity: { publicAliases: ['UserA'], privateAliases: ['SecretA'], allowAutoIntimate: false } },
      display: 'UserA',
    },
  },
  llmResponse: {
    choices: [{
      message: {
        content: JSON.stringify({
          steps: [{ tool: 'message.send', args: { channelId: 'chan-a', content: 'Response to UserA' }, reason: 'Reply A' }],
          reasoning: 'Concurrent path A',
        }),
      },
    }],
  },
  expectedPlan: {
    steps: [{ tool: 'message.send', args: { channelId: 'chan-a', content: 'Response to UserA' } }],
    reasoning: 'Concurrent path A',
  },
  expectedMetrics: {
    retrieverCalled: true,
    intentResolved: true,
    plannerCalled: true,
    executorSteps: 1,
    reflectorCalled: true,
    skillGraphCalled: true,
  },
};

export const OMEGA_17_CONCURRENCY_B: TestFixture = {
  observation: {
    id: 'obs-omega-17-b',
    type: 'MESSAGE',
    content: 'concurrent message B',
    authorId: 'user-concurrent-b',
    channelId: 'chan-b',
    guildId: 'guild-1',
    timestamp: '2025-11-24T06:00:01.000Z',
    authorDisplayName: 'UserB',
  },
  memoryResponse: {
    searchHybrid: { items: [] },
    userEntity: {
      id: 'user:concurrent-b',
      aliases: ['UserB'],
      traits: { identity: { publicAliases: ['UserB'], privateAliases: ['SecretB'], allowAutoIntimate: false } },
      display: 'UserB',
    },
  },
  llmResponse: {
    choices: [{
      message: {
        content: JSON.stringify({
          steps: [{ tool: 'message.send', args: { channelId: 'chan-b', content: 'Response to UserB' }, reason: 'Reply B' }],
          reasoning: 'Concurrent path B',
        }),
      },
    }],
  },
  expectedPlan: {
    steps: [{ tool: 'message.send', args: { channelId: 'chan-b', content: 'Response to UserB' } }],
    reasoning: 'Concurrent path B',
  },
  expectedMetrics: {
    retrieverCalled: true,
    intentResolved: true,
    plannerCalled: true,
    executorSteps: 1,
    reflectorCalled: true,
    skillGraphCalled: true,
  },
};
