/**
 * Vigil Vi Adapter
 * Discord bot integration with Vi core
 */

import { Message, CommandInteraction } from 'discord.js';

// Types for Discord message context
export interface DiscordMessageContext {
  userId: string;
  username: string;
  guildId: string;
  channelId: string;
  content: string;
  isSlashCommand: boolean;
  commandName?: string;
}

export interface ViResponse {
  text: string;
  confidence?: number;
  actions?: string[];
  contextUpdate?: Record<string, any>;
}

/**
 * Send a Discord message to Vi for processing
 */
export async function sendToVi(
  context: DiscordMessageContext,
  viApiBase: string = 'http://localhost:3000'
): Promise<ViResponse> {
  try {
    const response = await fetch(`${viApiBase}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: context.userId,
        message: context.content,
        metadata: {
          platform: 'discord',
          username: context.username,
          guildId: context.guildId,
          channelId: context.channelId,
          isCommand: context.isSlashCommand,
          commandName: context.commandName,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Vi API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error communicating with Vi:', error);
    throw error;
  }
}

/**
 * Process a Discord message through Vi
 */
export async function processMessage(
  message: Message,
  viApiBase?: string
): Promise<ViResponse | null> {
  // Ignore bot messages
  if (message.author.bot) return null;

  const context: DiscordMessageContext = {
    userId: message.author.id,
    username: message.author.username,
    guildId: message.guildId || 'dm',
    channelId: message.channelId,
    content: message.content,
    isSlashCommand: false,
  };

  return sendToVi(context, viApiBase);
}

/**
 * Process a slash command through Vi
 */
export async function processSlashCommand(
  interaction: CommandInteraction,
  viApiBase?: string
): Promise<ViResponse | null> {
  const content = interaction.options
    .data.map((opt) => `${opt.name}: ${opt.value}`)
    .join('\n');

  const context: DiscordMessageContext = {
    userId: interaction.user.id,
    username: interaction.user.username,
    guildId: interaction.guildId || 'dm',
    channelId: interaction.channelId || 'unknown',
    content: `/${interaction.commandName} ${content}`,
    isSlashCommand: true,
    commandName: interaction.commandName,
  };

  return sendToVi(context, viApiBase);
}
