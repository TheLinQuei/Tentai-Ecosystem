/**
 * Tool Schema - Comprehensive documentation for LLM planner
 * Each tool has a description, parameter schema, and usage examples
 */

export interface ToolParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example?: string;
}

export interface ToolSchema {
  name: string;
  category: string;
  description: string;
  parameters: ToolParameter[];
  when_to_use: string;
  examples: string[];
}

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'message.send',
    category: 'Communication',
    description: 'Send a message to a Discord channel. Use this to respond to users, provide information, or engage in conversation.',
    parameters: [
      { name: 'content', type: 'string', required: true, description: 'The message text to send', example: 'Hello! How can I help you today?' },
      { name: 'channelId', type: 'string', required: false, description: 'Discord channel ID (auto-injected if not provided)' },
    ],
    when_to_use: 'When you need to respond to a user, answer a question, or provide any kind of textual information',
    examples: [
      'User: "Hi Vi!" → message.send with content: "Hello! How can I assist you today?"',
      'User: "What can you do?" → message.send with capabilities description',
    ],
  },
  {
    name: 'system.diagnostics.selftest',
    category: 'System',
    description: 'Run comprehensive health checks on all system components (Memory API, Postgres, Qdrant, Neo4j, Redis, NATS, Discord). Returns diagnostic results showing which systems are operational.',
    parameters: [
      { name: 'channelId', type: 'string', required: false, description: 'If provided, sends diagnostic results to this channel' },
    ],
    when_to_use: 'When user asks to "run diagnostics", "self-test", "check system health", "are you working", or wants to verify bot functionality',
    examples: [
      'User: "Vi run diagnostics" → system.diagnostics.selftest',
      'User: "Vi self-test" → system.diagnostics.selftest with channelId for auto-response',
      'User: "Are all systems operational?" → system.diagnostics.selftest',
    ],
  },
  {
    name: 'system.reflect',
    category: 'System',
    description: 'Store a reflection or introspective note in memory. Use when the user EXPLICITLY asks you to "reflect on" something, or when you want to record insights, patterns, or learnings for future reference. This is for storing YOUR thoughts and observations, not for looking up information.',
    parameters: [
      { name: 'text', type: 'string', required: true, description: 'The reflection content to store', example: 'The server has a friendly, collaborative vibe with active discussions about gaming and creative projects' },
      { name: 'scope', type: '"user"|"channel"|"guild"', required: false, description: 'Scope of the reflection (defaults to channel)' },
    ],
    when_to_use: 'When user explicitly asks you to "reflect on" something (e.g., "reflect on the server vibes", "reflect on our conversation"), or when you want to record meta-cognitive insights for later. NOT for info lookup - use memory.query or guild.info for that.',
    examples: [
      'User: "Vi reflect on the server vibes" → system.reflect with text: "The server has a collaborative atmosphere with members actively discussing creative projects and helping each other"',
      'User: "Reflect on our conversation" → system.reflect with text about conversation patterns or insights',
      'User: "Vi, think about what we discussed" → system.reflect with summary of key discussion points',
      'After learning user preference → system.reflect with text: "User prefers concise technical responses"',
      'Recording conversation insight → system.reflect with observation about interaction patterns',
    ],
  },
  {
    name: 'memory.query',
    category: 'Memory',
    description: 'Search memory for relevant information, past conversations, or stored knowledge. Returns semantically similar content from previous interactions. IMPORTANT: When user asks "who/what did I say", always query memory first before saying you don\'t know.',
    parameters: [
      { name: 'query', type: 'string', required: true, description: 'Search query for semantic lookup', example: 'user birthday celebrations' },
      { name: 'channelId', type: 'string', required: false, description: 'Discord channel ID (auto-injected for auto-send)' },
    ],
    when_to_use: 'When you need to recall past information, find previous conversations about a topic, retrieve stored knowledge, or when user asks "who/what did I say about X". ALWAYS use this when user mentions past conversations.',
    examples: [
      'User: "What did I say about pizza yesterday?" → memory.query with query: "pizza yesterday"',
      'User: "Do you remember my favorite color?" → memory.query with query: "favorite color"',
      'User: "Who did I say likes meows?" → memory.query with query: "likes meows"',
      'User: "What do you know about KiingKat?" → memory.query with query: "KiingKat"',
      'User: "Did I tell you about my birthday?" → memory.query with query: "birthday"',
    ],
  },
  {
    name: 'weather.get',
    category: 'Information',
    description: 'Get current weather information for a specific location using OpenWeatherMap API.',
    parameters: [
      { name: 'q', type: 'string', required: true, description: 'Location name (city, city+state, or city+country)', example: 'London,UK' },
    ],
    when_to_use: 'When user asks about weather, temperature, or climate conditions for a specific location',
    examples: [
      'User: "What\'s the weather in Tokyo?" → weather.get with q: "Tokyo,JP"',
      'User: "Is it raining in Seattle?" → weather.get with q: "Seattle,WA,US"',
      'User: "Weather in Paris" → weather.get with q: "Paris,FR"',
    ],
  },
  {
    name: 'info.search',
    category: 'Information',
    description: 'Search the web using Google Custom Search API. Returns top 3 results with titles, snippets, and URLs. Automatically sends formatted results to Discord.',
    parameters: [
      { name: 'query', type: 'string', required: true, description: 'Search query', example: '"latest AI news"' },
      { name: 'channelId', type: 'string', required: false, description: 'Discord channel ID (auto-injected)' },
    ],
    when_to_use: 'When user asks for current information, news, facts, or general knowledge that requires web search. Use this for ANY factual question that needs recent or authoritative information.',
    examples: [
      'User: "What\'s the latest news about AI?" → info.search with query: "latest AI news"',
      'User: "Tell me about the Eiffel Tower" → info.search with query: "Eiffel Tower facts"',
      'User: "Who are the strongest heroes?" → info.search with query: "strongest heroes list"',
      'User: "What is kiingkat?" → info.search with query: "kiingkat"',
    ],
  },
  {
    name: 'user.remind',
    category: 'Utility',
    description: 'Set a reminder for a user. The reminder will be delivered after the specified duration. IMPORTANT: Always extract and pass a duration. Use time ("10s", "5m", "2h", "1d"), or duration/delay/delaySec (seconds). Calls without a duration will fail.',
    parameters: [
      { name: 'userId', type: 'string', required: true, description: 'Discord user ID to remind' },
      { name: 'message', type: 'string', required: true, description: 'Reminder message (what to remind about)' },
      { name: 'time', type: 'string', required: false, description: 'Time string like "10s", "5m", "2h", "1d" - will be converted to seconds', example: '10s' },
      { name: 'duration', type: 'number', required: false, description: 'Duration in seconds until reminder triggers (alternative to time)', example: '3600' },
      { name: 'delay', type: 'string|number', required: false, description: 'Alternative to time/duration. Either a number of seconds (e.g., 10) or a string like "10s", "5m"', example: '10' },
      { name: 'delaySec', type: 'number', required: false, description: 'Alternative explicit seconds field (e.g., 600 for 10 minutes)', example: '600' },
    ],
    when_to_use: 'When user asks to be reminded later. CRITICAL: Always extract a duration from the user message and pass it using time OR duration OR delay OR delaySec. Do not call this tool without a duration.',
    examples: [
      'User: "Remind me in 1 hour to check the oven" → user.remind with time: "1h", message: "check the oven"',
      'User: "Remind me to stretch in 10 seconds" → user.remind with time: "10s", message: "stretch"',
      'User: "Remind me in 5 minutes to take a break" → user.remind with time: "5m", message: "take a break"',
      'User: "Set a reminder for tomorrow" → user.remind with time: "1d", message: "reminder for tomorrow"',
      'User: "Vi remind me in 10 seconds to test" → user.remind with message: "test", time: "10s"',
      'User: "Remind me in 30 seconds to check" → user.remind with message: "check", delay: 30',
    ],
  },
  {
    name: 'guild.member.count',
    category: 'Guild Info',
    description: 'Get the total member count for a Discord guild/server.',
    parameters: [
      { name: 'guildId', type: 'string', required: false, description: 'Guild ID (auto-injected)' },
      { name: 'channelId', type: 'string', required: false, description: 'If provided, sends result to channel' },
    ],
    when_to_use: 'When user asks "how many members", "server size", "member count"',
    examples: [
      'User: "How many members are in this server?" → guild.member.count',
    ],
  },
  {
    name: 'guild.roles.list',
    category: 'Guild Info',
    description: 'List all roles in the guild with their IDs and member counts.',
    parameters: [
      { name: 'guildId', type: 'string', required: false, description: 'Guild ID (auto-injected)' },
    ],
    when_to_use: 'When user asks to "list roles", "show roles", "what roles exist"',
    examples: [
      'User: "What roles are in this server?" → guild.roles.list',
    ],
  },
  {
    name: 'guild.roles.admins',
    category: 'Guild Info',
    description: 'List all admin/moderator roles in the guild.',
    parameters: [
      { name: 'guildId', type: 'string', required: false, description: 'Guild ID (auto-injected)' },
      { name: 'channelId', type: 'string', required: false, description: 'For auto-send' },
    ],
    when_to_use: 'When user asks "who are the admins", "show moderators", "list admin roles"',
    examples: [
      'User: "Who are the admins?" → guild.roles.admins',
    ],
  },
  {
    name: 'guild.member.roles',
    category: 'Guild Info',
    description: 'Get all roles for a specific guild member.',
    parameters: [
      { name: 'guildId', type: 'string', required: false, description: 'Guild ID (auto-injected)' },
      { name: 'userId', type: 'string', required: false, description: 'User ID (defaults to message author)' },
      { name: 'channelId', type: 'string', required: false, description: 'For auto-send' },
    ],
    when_to_use: 'When user asks "what are my roles", "what roles do I have", "check user roles"',
    examples: [
      'User: "What roles do I have?" → guild.member.roles',
    ],
  },
  {
    name: 'guild.uptime',
    category: 'Guild Info',
    description: 'Show how long the bot has been running in this guild.',
    parameters: [
      { name: 'guildId', type: 'string', required: false, description: 'Guild ID (auto-injected)' },
      { name: 'channelId', type: 'string', required: false, description: 'For auto-send' },
    ],
    when_to_use: 'When user asks "how long have you been online", "uptime", "when did you start"',
    examples: [
      'User: "What\'s your uptime?" → guild.uptime',
    ],
  },
  {
    name: 'system.capabilities',
    category: 'System',
    description: 'List all available tools and capabilities that Vi has access to.',
    parameters: [],
    when_to_use: 'When user asks "what can you do", "show capabilities", "list features", "help"',
    examples: [
      'User: "What can you do?" → system.capabilities',
      'User: "Show me your features" → system.capabilities',
    ],
  },
  {
    name: 'identity.lookup',
    category: 'Identity',
    description: 'Look up information about a Discord user by ID or mention.',
    parameters: [
      { name: 'userId', type: 'string', required: true, description: 'Discord user ID or mention' },
    ],
    when_to_use: 'When user asks about another user\'s identity, profile, or information',
    examples: [
      'User: "Who is @username?" → identity.lookup with userId from mention',
    ],
  },
  {
    name: 'identity.user.self',
    category: 'Identity',
    description: 'Get information about the user who sent the message.',
    parameters: [
      { name: 'userId', type: 'string', required: false, description: 'User ID (auto-injected from message author)' },
    ],
    when_to_use: 'When user asks "who am I", "what do you know about me", "my profile"',
    examples: [
      'User: "Who am I?" → identity.user.self',
    ],
  },
  {
    name: 'identity.creator',
    category: 'Identity',
    description: 'Get information about Vi\'s creator/developer.',
    parameters: [],
    when_to_use: 'When user asks "who made you", "who created you", "who is your developer"',
    examples: [
      'User: "Who created you?" → identity.creator',
    ],
  },
  {
    name: 'identity.update',
    category: 'Identity',
    description: 'Update user identity preferences including public/private aliases and intimate addressing settings. Used when user explicitly asks to change how they are addressed.',
    parameters: [
      { name: 'userId', type: 'string', required: true, description: 'Discord user ID (auto-injected from message author)' },
      { name: 'addPublicAliases', type: 'string[]', required: false, description: 'Public aliases to add (visible in all contexts)', example: '["The Lin Quei", "Kaelen"]' },
      { name: 'addPrivateAliases', type: 'string[]', required: false, description: 'Private/intimate aliases to add (only for DM/trusted contexts)', example: '["Forsa"]' },
      { name: 'setAllowAutoIntimate', type: 'boolean', required: false, description: 'Enable/disable intimate addressing in private contexts', example: 'true' },
    ],
    when_to_use: 'When user asks to change their name/alias, enable/disable intimate addressing, or update identity preferences. Pattern: "call me X", "my name is X", "use X in private", "don\'t use intimate names"',
    examples: [
      'User: "Call me The Lin Quei" → identity.update with addPublicAliases: ["The Lin Quei"]',
      'User: "Call me Kaelen in private" → identity.update with addPrivateAliases: ["Kaelen"]',
      'User: "Don\'t use intimate names" → identity.update with setAllowAutoIntimate: false',
      'User: "You can use intimate names" → identity.update with setAllowAutoIntimate: true',
    ],
  },
];

/**
 * Get tool schema by name
 */
export function getToolSchema(toolName: string): ToolSchema | undefined {
  return TOOL_SCHEMAS.find(t => t.name === toolName);
}

/**
 * Generate formatted tool documentation for LLM prompt
 */
export function generateToolDocumentation(toolNames: string[]): string {
  const schemas = toolNames
    .map(name => getToolSchema(name))
    .filter((schema): schema is ToolSchema => schema !== undefined);

  if (schemas.length === 0) return '';

  const lines: string[] = ['\nAvailable Tools:'];
  
  for (const schema of schemas) {
    lines.push(`\n• ${schema.name} (${schema.category})`);
    lines.push(`  ${schema.description}`);
    
    if (schema.parameters.length > 0) {
      const params = schema.parameters
        .map(p => `${p.name}${p.required ? '*' : ''}: ${p.type}`)
        .join(', ');
      lines.push(`  Parameters: ${params}`);
    }
    
    lines.push(`  Use when: ${schema.when_to_use}`);
  }

  return lines.join('\n');
}
