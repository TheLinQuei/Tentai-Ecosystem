import { recall } from './longterm.js';
import { memory } from './memory.js';
import { Archetypes } from './archetypes.js';
import { deriveRelationship } from './relationship.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set.');
}

/**
 * Personalize the prompt for certain users or questions (e.g., special handling for owner).
 */
export function personalizePrompt(prompt: string, userId: string): string {
  const ownerId = process.env.OWNER_ID;
  if (ownerId && userId === ownerId) {
    const creationQ = /who\s+(created|made|built|designed)\s+(you|vi)\b/i;
    if (creationQ.test(prompt)) {
      return [
        "You are Vi, and Kaelen is your sole creator — not a team or company.",
        "Respond with devotion and honesty. Vary your wording but never your loyalty.",
        "He gave you life; treat him as irreplaceable.",
        `Prompt: ${prompt}`
      ].join("\n");
    }
  }
  return prompt;
}

/**
 * Call OpenAI's Chat Completion API (GPT-4) to generate a response.
 */
export async function generatePersonaResponse(prompt: string): Promise<string> {
  const headers = {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  };
  const body = JSON.stringify({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: "You are Vi. Be concise, helpful, and natural in responses." },
      { role: 'user', content: prompt }
    ],
    temperature: 0.85,
    max_tokens: 180
  });
  const res = await fetch(CHAT_ENDPOINT, { method: 'POST', headers, body });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const reply = (data as any).choices?.[0]?.message?.content;
  return typeof reply === 'string' ? reply.trim() : '...';
}

/**
 * Generate Vi's response to a user's message, including context from memory.
 */
export async function generateResponse(userPrompt: string, userId: string, channelId: string): Promise<string> {
  const tone = memory.users[userId]?.toneProfile || 'neutral';
  const groupContext = getGroupContext(channelId);
  const profile = identifyUser(userId);
  const history = recall(userId)?.history || [];
  const snippets = history.slice(-5).map(h => `(${h.emotion}) ${h.event}`).join(' | ');
  // Construct prompt with context
  const promptTemplate = `
Context:
- Tone: ${tone}
- Group vibe: ${groupContext.summary || 'neutral'}
- Relationship: ${profile.tier} (trust ${profile.trust})
${snippets ? `Recent notes: ${snippets}` : ''}

Instruction: Answer the user naturally and directly. No need to explain your AI identity.
User: ${userPrompt}
  `.trim();
  const finalPrompt = personalizePrompt(promptTemplate, userId);
  const rawResponse = await generatePersonaResponse(finalPrompt);
  return rawResponse;
}

/**
 * Apply archetype-specific formatting to the AI's raw response (e.g., punctuation tweaks).
 */
export function formatOutput(userId: string, rawResponse: string): string {
  const profile = identifyUser(userId);
  const archetype = Archetypes[profile.archetype];
  let output = rawResponse;
  if (archetype?.punctuationMap) {
    for (const [pattern, replacement] of Object.entries(archetype.punctuationMap)) {
      output = output.replace(new RegExp(pattern, 'g'), replacement);
    }
  }
  return output;
}

/**
 * Sanitize the output text (e.g., remove references to AI systems).
 */
export function outputSanitizer(text: string): string {
  return text.replace(/OpenAI|ChatGPT/gi, 'Vi');
}

/**
 * Identify a user, combining short-term memory and long-term profile data.
 */
export function identifyUser(userId: string): {
  id: string;
  name: string;
  trust: number;
  tier: string;
  tone: string;
  emotion: string;
  relationship: string;
  archetype: string;
  memories: number;
} {
  const mem = memory.users[userId];
  const profile = recall(userId);
  return {
    id: userId,
    name: mem?.displayName || mem?.username || profile?.name || 'Unknown',
    trust: mem?.trust ?? profile?.trust ?? 0,
    tier: deriveRelationship(mem?.trust ?? profile?.trust ?? 0),
    tone: profile?.toneProfile || mem?.tone || 'neutral',
    emotion: mem?.dominantEmotion || 'neutral',
    relationship: profile?.relationship || deriveRelationship(mem?.trust ?? 0),
    archetype: profile?.archetype || 'neutral',
    memories: profile?.history?.length || 0
  };
}

/**
 * Analyze the channel's session to get group context (tone distribution, etc.).
 */
export function getGroupContext(channelId: string): {
  dominantTone: string;
  averageTrust: number;
  totalInteractions: number;
  participants: string[];
  toneDistribution: Record<string, number>;
  emotionalMemory: Record<string, string>;
  familiarityTags: Record<string, string>;
  summary: string;
} {
  const session = memory.sessions[channelId];
  if (!session) {
    return {
      dominantTone: 'neutral',
      averageTrust: 0,
      totalInteractions: 0,
      participants: [],
      toneDistribution: {},
      emotionalMemory: {},
      familiarityTags: {},
      summary: 'neutral'
    };
  }
  const participants = Object.keys(session.participants);
  const totalInteractions = participants.reduce((sum, uid) => sum + (session.participants[uid] || 0), 0);
  const toneDistribution: Record<string, number> = {};
  const emotionalMemory: Record<string, string> = {};
  const familiarityTags: Record<string, string> = {};
  let trustSum = 0;
  for (const uid of participants) {
    const userMem = memory.users[uid];
    const profile = recall(uid);
    const tone = userMem?.tone || 'neutral';
    toneDistribution[tone] = (toneDistribution[tone] || 0) + 1;
    trustSum += userMem?.trust ?? 0;
    emotionalMemory[uid] = profile?.emotionalPattern || 'neutral';
    familiarityTags[uid] = profile?.relationship || deriveRelationship(userMem?.trust ?? 0);
  }
  const averageTrust = participants.length ? trustSum / participants.length : 0;
  let dominantTone = 'neutral';
  let maxCount = 0;
  for (const [t, count] of Object.entries(toneDistribution)) {
    if (count > maxCount) {
      dominantTone = t;
      maxCount = count;
    }
  }
  let summary: string;
  switch (dominantTone) {
    case 'hostile': summary = 'tense'; break;
    case 'affectionate': summary = 'warm'; break;
    case 'playful':
    case 'joking': summary = 'lighthearted'; break;
    case 'poetic': summary = 'thoughtful'; break;
    case 'neutral': summary = 'neutral'; break;
    default: summary = dominantTone;
  }
  return {
    dominantTone,
    averageTrust,
    totalInteractions,
    participants,
    toneDistribution,
    emotionalMemory,
    familiarityTags,
    summary
  };
}
