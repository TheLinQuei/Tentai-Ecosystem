/**
 * Vi Discord Integration Point
 * 
 * Defines the interface that Discord products (Vigil) use to connect with Vi
 */

import { z } from 'zod';

/**
 * Schema for Discord message context received from Vigil
 */
export const DiscordContextSchema = z.object({
  userId: z.string(),
  username: z.string(),
  guildId: z.string(),
  channelId: z.string(),
  content: z.string(),
  isSlashCommand: z.boolean().default(false),
  commandName: z.string().optional(),
  platform: z.literal('discord'),
});

export type DiscordContext = z.infer<typeof DiscordContextSchema>;

/**
 * Interface for Discord integration handler
 * Called when Vi receives a message from Vigil
 */
export interface IDiscordIntegration {
  /**
   * Process a Discord message/command through Vi's brain
   */
  processMessage(context: DiscordContext): Promise<string>;

  /**
   * Register a Discord command with Vi's command system
   */
  registerCommand(name: string, handler: (args: any) => Promise<string>): void;

  /**
   * Build Discord-specific context for reasoning
   * (e.g., user reputation, guild settings, command history)
   */
  buildContext(context: DiscordContext): Promise<Record<string, any>>;
}

/**
 * Discord integration implementation
 * This gets instantiated when Vi starts and Vigil connects
 */
export class DiscordIntegration implements IDiscordIntegration {
  private commands: Map<string, (args: any) => Promise<string>> = new Map();

  async processMessage(context: DiscordContext): Promise<string> {
    // TODO: Route to Vi's brain with Discord context
    // This will be implemented in core/vi/src/brain/
    return `Vi processed Discord message from @${context.username}`;
  }

  registerCommand(name: string, handler: (args: any) => Promise<string>): void {
    this.commands.set(name, handler);
  }

  async buildContext(context: DiscordContext): Promise<Record<string, any>> {
    // TODO: Load user reputation, guild config, command history
    return {
      platform: 'discord',
      guild: context.guildId,
      isCommand: context.isSlashCommand,
    };
  }
}
