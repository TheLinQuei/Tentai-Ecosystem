/**
 * Vi Lore Integration Point
 * 
 * Defines the interface for accessing lore data for context-aware reasoning
 */

import { z } from 'zod';

/**
 * Schema for lore context
 */
export const LoreCharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  abilities: z.array(z.string()),
  race: z.string().optional(),
  faction: z.string().optional(),
});

export type LoreCharacter = z.infer<typeof LoreCharacterSchema>;

/**
 * Interface for lore integration
 */
export interface ILoreIntegration {
  /**
   * Get character by ID
   */
  getCharacter(characterId: string): Promise<LoreCharacter | null>;

  /**
   * Search characters by name
   */
  searchCharacters(query: string): Promise<LoreCharacter[]>;

  /**
   * Register lore context with Vi's memory system
   * Used to ground reasoning in world state
   */
  registerContext(context: string, source: string): Promise<void>;

  /**
   * Build narrative context for Vi's responses
   * When user asks about the world, Vi can use lore data
   */
  buildNarrativeContext(charactersNeeded: string[]): Promise<string>;
}

/**
 * Lore integration implementation
 */
export class LoreIntegration implements ILoreIntegration {
  private loreCache: Map<string, LoreCharacter> = new Map();

  async getCharacter(characterId: string): Promise<LoreCharacter | null> {
    // TODO: Load from lore system data files
    // Format: /products/lore/data/characters/{id}.json
    if (this.loreCache.has(characterId)) {
      return this.loreCache.get(characterId) || null;
    }
    return null;
  }

  async searchCharacters(query: string): Promise<LoreCharacter[]> {
    // TODO: Semantic search through lore database
    // Could use vector embeddings from Vi's memory system
    return [];
  }

  async registerContext(context: string, source: string): Promise<void> {
    // TODO: Register context with Vi's memory/RAG system
    console.log(`[Lore] Registered context from ${source}`);
  }

  async buildNarrativeContext(charactersNeeded: string[]): Promise<string> {
    // TODO: Fetch character data and build narrative text
    // This gets included in Vi's context window for reasoning
    return '';
  }
}
