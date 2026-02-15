/**
 * Sovereign Vi Adapter
 * Web console for interacting with Vi core
 */

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  messages: ConversationMessage[];
  created: number;
  updated: number;
}

/**
 * Send a message to Vi and get a response
 */
export async function chat(
  userId: string,
  message: string,
  conversationId: string,
  viApiBase: string = 'http://localhost:3000'
): Promise<string> {
  try {
    const response = await fetch(`${viApiBase}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        message,
        conversationId,
        platform: 'web',
      }),
    });

    if (!response.ok) {
      throw new Error(`Vi API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.text || data.response;
  } catch (error) {
    console.error('Error messaging Vi:', error);
    throw error;
  }
}

/**
 * Load conversation history
 */
export async function loadConversation(
  conversationId: string,
  viApiBase?: string
): Promise<ConversationMessage[]> {
  try {
    const response = await fetch(
      `${viApiBase}/conversations/${conversationId}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('Error loading conversation:', error);
    return [];
  }
}

/**
 * List user's conversations
 */
export async function listConversations(
  userId: string,
  viApiBase?: string
): Promise<Conversation[]> {
  try {
    const response = await fetch(
      `${viApiBase}/conversations?userId=${userId}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.conversations || [];
  } catch (error) {
    console.error('Error listing conversations:', error);
    return [];
  }
}
