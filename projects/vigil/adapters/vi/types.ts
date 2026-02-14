/**
 * TypeScript Types for Vigil Vi Integration
 */

export type DiscordMessage = {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  channelId: string;
  guildId?: string;
  timestamp: Date;
  mentions?: string[];
  attachments?: string[];
};

export type MessageContext = {
  channelId: string;
  guildId?: string;
  recentMessages: DiscordMessage[];
  userPreferences?: Record<string, any>;
  channelTopic?: string;
};

export type ViResponse = {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: {
    processingTime?: number;
    intentCategory?: string;
    confidence?: number;
  };
};

export type CommandRequest = {
  command: string;
  args: string[];
  context: MessageContext;
  userId: string;
};
