/**
 * Lore Vi Adapter
 * Lore context and character/ability lookups for Vi reasoning
 */

export interface LoreCharacter {
  id: string;
  name: string;
  description: string;
  abilities: string[];
  race?: string;
  faction?: string;
  stats?: Record<string, number>;
}

export interface LoreAbility {
  id: string;
  name: string;
  description: string;
  type: string;
  effects?: string[];
  cooldown?: number;
}

export interface LoreRace {
  id: string;
  name: string;
  description: string;
  traits: string[];
  loreAbilities?: string[];
}

/**
 * Fetch character from lore database
 */
export async function getCharacter(characterId: string): Promise<LoreCharacter | null> {
  try {
    // For now, load from local data
    // TODO: Integrate with Vi's memory system for caching
    const data = await import(`../../data/characters/${characterId}.json`);
    return data.default || data;
  } catch (error) {
    console.warn(`Character not found: ${characterId}`, error);
    return null;
  }
}

/**
 * Fetch ability from lore database
 */
export async function getAbility(abilityId: string): Promise<LoreAbility | null> {
  try {
    const data = await import(`../../data/abilities/${abilityId}.json`);
    return data.default || data;
  } catch (error) {
    console.warn(`Ability not found: ${abilityId}`, error);
    return null;
  }
}

/**
 * Fetch race from lore database
 */
export async function getRace(raceId: string): Promise<LoreRace | null> {
  try {
    const data = await import(`../../data/races/${raceId}.json`);
    return data.default || data;
  } catch (error) {
    console.warn(`Race not found: ${raceId}`, error);
    return null;
  }
}

/**
 * Build lore context string for Vi reasoning
 * This is fed to Vi when relevant to ground its responses in world-building
 */
export async function buildLoreContext(
  charactersNeeded: string[],
  abilitiesNeeded: string[],
  racesNeeded: string[]
): Promise<string> {
  const parts: string[] = [];

  // Fetch and format character info
  for (const charId of charactersNeeded) {
    const char = await getCharacter(charId);
    if (char) {
      parts.push(
        `Character: ${char.name}\n${char.description}\nAbilities: ${char.abilities.join(', ')}\n`
      );
    }
  }

  // Fetch and format ability info
  for (const abilityId of abilitiesNeeded) {
    const ability = await getAbility(abilityId);
    if (ability) {
      parts.push(
        `Ability: ${ability.name}\n${ability.description}\nType: ${ability.type}\n`
      );
    }
  }

  // Fetch and format race info
  for (const raceId of racesNeeded) {
    const race = await getRace(raceId);
    if (race) {
      parts.push(
        `Race: ${race.name}\n${race.description}\nTraits: ${race.traits.join(', ')}\n`
      );
    }
  }

  return parts.join('\n---\n');
}

/**
 * Send lore context to Vi as background information
 * Vi uses this to understand world state and character interactions
 */
export async function registerLoreContext(
  viApiBase: string = 'http://localhost:3000',
  context: string
): Promise<void> {
  try {
    await fetch(`${viApiBase}/context/lore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, source: 'lore-system' }),
    });
  } catch (error) {
    console.error('Error registering lore context with Vi:', error);
  }
}
