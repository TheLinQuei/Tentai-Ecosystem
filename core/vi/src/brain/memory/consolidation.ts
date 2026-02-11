import { MemoryRecord } from '../types.js';
import type { Citation } from '../../schema/Citation.js';

/**
 * Memory consolidation engine: deduplicates, merges, and surfaces conflicts
 * Phase 2: citation-aware consolidation without full reasoning
 */

interface ConsolidatedMemory {
  type: MemoryRecord['type'];
  content: string;
  userId: string;
  citations: Citation[];
  ttl?: number;
  confidence: number;       // 0..1 based on citation agreement
  sourceCount: number;      // How many sources agree
  conflicts?: {
    content: string;
    citations: Citation[];
  }[];
}

/**
 * Consolidate a set of memories by deduplicating similar content
 * and merging citations.
 */
export async function consolidateMemories(
  memories: MemoryRecord[]
): Promise<ConsolidatedMemory[]> {
  if (memories.length === 0) {
    return [];
  }

  // Group by type
  const byType = new Map<string, MemoryRecord[]>();
  for (const mem of memories) {
    const key = mem.type;
    if (!byType.has(key)) {
      byType.set(key, []);
    }
    byType.get(key)!.push(mem);
  }

  const consolidated: ConsolidatedMemory[] = [];

  // Consolidate within each type
  for (const [type, mems] of byType.entries()) {
    const grouped = groupSimilarMemories(mems);
    for (const group of grouped) {
      const merged = mergeMemoryGroup(group, type as any);
      consolidated.push(merged);
    }
  }

  return consolidated;
}

/**
 * Group similar memories (simple string similarity)
 */
function groupSimilarMemories(memories: MemoryRecord[]): MemoryRecord[][] {
  const groups: MemoryRecord[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < memories.length; i++) {
    if (used.has(i)) continue;

    const group = [memories[i]];
    used.add(i);

    // Find similar memories
    for (let j = i + 1; j < memories.length; j++) {
      if (used.has(j)) continue;
      if (isSimilar(memories[i].content, memories[j].content)) {
        group.push(memories[j]);
        used.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}

/**
 * Check if two memory contents are similar (simple heuristic)
 */
function isSimilar(a: string, b: string): boolean {
  return calculateSimilarity(a, b) > 0.7;
}

/**
 * Merge a group of similar memories with citation tracking
 */
function mergeMemoryGroup(
  memories: MemoryRecord[],
  type: string
): ConsolidatedMemory {
  const allCitations: Citation[] = [];
  const citationIds = new Set<string>();
  const conflicts: ConsolidatedMemory['conflicts'] = [];

  // Collect all unique citations
  for (const mem of memories) {
    if (mem.citations) {
      for (const cit of mem.citations) {
        if (!citationIds.has(cit.id)) {
          allCitations.push(cit);
          citationIds.add(cit.id);
        }
      }
    }
  }

  // Check for conflicting content (keep first, flag others)
  const primaryContent = memories[0].content;
  for (let i = 1; i < memories.length; i++) {
    const otherContent = memories[i].content;
    // Only flag as conflict if truly dissimilar (not just similar)
    const similarity = calculateSimilarity(primaryContent, otherContent);
    if (similarity < 0.6) {  // Lower threshold for conflict flagging
      conflicts.push({
        content: otherContent,
        citations: memories[i].citations || [],
      });
    }
  }

  // Confidence based on citation agreement
  const avgConfidence = memories.reduce((sum, m) => {
    const citConfidence = m.citations?.reduce((s, c) => s + (c.confidence || 0.8), 0) || 0;
    return sum + (citConfidence / Math.max(m.citations?.length || 1, 1));
  }, 0) / memories.length;

  return {
    type: type as any,
    content: primaryContent,
    userId: memories[0].userId,
    citations: allCitations,
    ttl: Math.min(...memories.map((m) => m.ttl || Infinity)),
    confidence: Math.min(avgConfidence, 0.95), // Cap at 0.95
    sourceCount: allCitations.length,
    conflicts: conflicts.length > 0 ? conflicts : undefined,
  };
}

/**
 * Calculate similarity ratio between two strings
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const common = [...wordsA].filter((w) => wordsB.has(w)).length;
  return common / Math.max(wordsA.size, wordsB.size);
}

/**
 * Detect citation conflicts (same content with different sources)
 */
export function detectCitationConflicts(memories: ConsolidatedMemory[]): Array<{
  content: string;
  sources: Citation[][];
}> {
  const byContent = new Map<string, Citation[][]>();

  for (const mem of memories) {
    if (!byContent.has(mem.content)) {
      byContent.set(mem.content, []);
    }
    byContent.get(mem.content)!.push(mem.citations);
  }

  const conflicts: Array<{ content: string; sources: Citation[][] }> = [];
  for (const [content, sources] of byContent.entries()) {
    if (sources.length > 1) {
      // Check if sources diverge
      const sourceStrs = sources.map((s) =>
        s.map((c) => c.sourceId ?? '').sort().join(',')
      );
      if (new Set(sourceStrs).size > 1) {
        conflicts.push({ content, sources });
      }
    }
  }

  return conflicts;
}
