/**
 * AmbiguityGate: Pre-planner validation layer
 * 
 * Detects malformed, ambiguous, or underspecified user input BEFORE planning.
 * If detected, returns a clarification response without invoking the Planner.
 * 
 * Checks:
 * 1. MALFORMED_QUERY: very short, incoherent input (e.g., "so what not", "when time we")
 * 2. DANGLING_REFERENCE: reference keywords ("that/this/it") with no usable anchor in history
 * 3. UNDERSPECIFIED_COMPARISON: comparison language without second item (e.g., "that was better" → better than what?)
 * 4. CONTRADICTORY_REQUEST: obvious self-contradictions (e.g., "list all but none")
 */

export interface AmbiguityDetection {
  detected: boolean;
  type: 'malformed_query' | 'dangling_reference' | 'underspecified_comparison' | 'contradictory_request' | null;
  confidence: number; // 0-1
  clarificationPrompt: string;
}

export class AmbiguityGate {
  private readonly REFERENCE_KEYWORDS = [
    'that', 'this', 'it', 'which', 'those', 'these',
    'the one', 'previous', 'earlier', 'last', 'before', 'recently'
  ];

  private readonly COMPARISON_KEYWORDS = [
    'better', 'worse', 'different', 'same', 'like', 'prefer', 'compare', 'versus', 'than'
  ];

  /**
   * Detect ambiguities in user input
   * Returns null if no ambiguity detected (proceed normally)
   * Returns AmbiguityDetection if ambiguity found (return clarification, do NOT plan)
   */
  detect(
    input: string,
    recentHistory: string[] = []
  ): AmbiguityDetection | null {
    // Check in priority order (most specific first)
    
    // 1. Check for CONTRADICTORY_REQUEST (highest priority - unambiguous semantic contradiction)
    const contradictory = this.detectContradictoryRequest(input);
    if (contradictory) return contradictory;

    // 2. Check for UNDERSPECIFIED_COMPARISON (more specific than dangling reference)
    const underspecified = this.detectUnderspecifiedComparison(input);
    if (underspecified) return underspecified;

    // 3. Check for MALFORMED_QUERY (very short, invalid tokens)
    const malformed = this.detectMalformedQuery(input);
    if (malformed) return malformed;

    // 4. Check for DANGLING_REFERENCE (no anchor in history)
    // Only check this if the input is substantial enough
    if (input.trim().length > 5) {
      const dangling = this.detectDanglingReference(input, recentHistory);
      if (dangling) return dangling;
    }

    // No ambiguity detected
    return null;
  }

  /**
   * Detect malformed queries: very short, tokenization errors, nonsense patterns
   * Examples: "so what not", "when time we", "the the", "a a a"
   */
  private detectMalformedQuery(input: string): AmbiguityDetection | null {
    const trimmed = input.trim();
    
    // Empty or whitespace-only
    if (!trimmed || trimmed.length === 0) {
      return {
        detected: true,
        type: 'malformed_query',
        confidence: 1.0,
        clarificationPrompt: 'I didn\'t catch that. What are you asking?'
      };
    }

    const tokens = trimmed.split(/\s+/);
    const tokenCount = tokens.length;

    // Very short token count (1-2 tokens) AND not a recognized command/greeting/single verb
    const recognizedShortPatterns = [
      'hi', 'hello', 'hey', 'thanks', 'thank you', 'ok', 'okay', 'yes', 'yeah', 'no', 'nope',
      'sure', 'go', 'stop', 'wait', 'please', 'sorry', 'help', 'quit', 'bye', 'goodbye',
      // Add verbs that can start a query
      'compare', 'list', 'show', 'tell', 'what', 'why', 'how', 'when', 'where', 'who'
    ];

    if (tokenCount <= 2) {
      const normalized = trimmed.toLowerCase();
      const isRecognized = recognizedShortPatterns.some(p => normalized === p || normalized.startsWith(p));
      
      if (!isRecognized) {
        return {
          detected: true,
          type: 'malformed_query',
          confidence: 0.85,
          clarificationPrompt: 'I\'m not sure what you mean. Can you rephrase that more clearly?'
        };
      }
    }

    // Tokenization errors: same token repeated 3+ times, or incoherent pattern
    const tokenLower = tokens.map(t => t.toLowerCase());
    for (let i = 0; i < tokenLower.length - 2; i++) {
      if (tokenLower[i] === tokenLower[i + 1] && tokenLower[i] === tokenLower[i + 2]) {
        return {
          detected: true,
          type: 'malformed_query',
          confidence: 0.9,
          clarificationPrompt: 'That doesn\'t look right. What are you trying to say?'
        };
      }
    }

    // Nonsense patterns: contains gibberish-like sequences
    // Example: "so what not" (grammatically malformed), "when time we"
    const gibberishPatterns = [
      /so\s+what\s+not/i,     // "so what not" instead of "so what now"
      /when\s+time\s+we/i,    // incoherent temporal reference
      /the\s+the\s/i,         // double article
      /and\s+and\s/i,         // double conjunction
    ];

    for (const pattern of gibberishPatterns) {
      if (pattern.test(trimmed)) {
        return {
          detected: true,
          type: 'malformed_query',
          confidence: 0.95,
          clarificationPrompt: 'That phrase doesn\'t parse. Did you mean something else?'
        };
      }
    }

    return null;
  }

  /**
   * Detect dangling references: input uses "that/this/it" but history is empty or too old
   */
  private detectDanglingReference(input: string, recentHistory: string[]): AmbiguityDetection | null {
    // Check if input contains reference keywords
    const hasReference = this.REFERENCE_KEYWORDS.some(kw => 
      new RegExp(`\\b${kw}\\b`, 'i').test(input)
    );

    if (!hasReference) return null;

    // If the input is long (> 50 chars) and self-contained, don't flag as dangling
    // Examples: "I've been thinking about this problem" (self-contained), "what about that?" (ambiguous)
    if (input.trim().length > 50) {
      // Long input likely self-referential or self-contained
      return null;
    }

    // No history = dangling reference
    if (!recentHistory || recentHistory.length === 0) {
      return {
        detected: true,
        type: 'dangling_reference',
        confidence: 0.9,
        clarificationPrompt: 'I don\'t have context for what you\'re referring to. What are you talking about?'
      };
    }

    // History exists but is very old/sparse (< 5 chars total) = likely too old
    const historyContent = recentHistory.join(' ').trim();
    if (historyContent.length < 5) {
      return {
        detected: true,
        type: 'dangling_reference',
        confidence: 0.85,
        clarificationPrompt: 'I\'ve lost context. Can you remind me what you\'re referring to?'
      };
    }

    // History exists and is substantial = assume reference can be resolved (don't flag)
    return null;
  }

  /**
   * Detect underspecified comparisons: "better/worse" without a comparison target
   * Examples: "that was better" (better than what?), "compare X" (with what?)
   */
  private detectUnderspecifiedComparison(input: string): AmbiguityDetection | null {
    const trimmed = input.toLowerCase().trim();

    // Pattern 1: "X is better/worse" without "than Y"
    const adjComparison = /\b(better|worse|different|same|similar|like)\b/i;
    if (adjComparison.test(trimmed)) {
      // Check if there's a "than" clause
      const hasThanClause = /\s+than\s+/i.test(trimmed);
      if (!hasThanClause) {
        // Might be underspecified comparison
        // Exclude cases like "I'm better" or "it's different" (no implicit comparison)
        const impliesComparison = /\b(was|is|are|were)\s+(better|worse|different|same|similar|like)\b/i.test(trimmed);
        if (impliesComparison) {
          return {
            detected: true,
            type: 'underspecified_comparison',
            confidence: 0.8,
            clarificationPrompt: 'Better/worse than what? Can you specify what you\'re comparing?'
          };
        }
      }
    }

    // Pattern 2: "compare X" without second item
    if (/\bcompare\b/i.test(trimmed)) {
      // Check if there are at least 2 distinct items mentioned
      const mentionedItems = (trimmed.match(/\b(and|or|vs|versus|with)\b/i) || []).length;
      if (mentionedItems === 0) {
        return {
          detected: true,
          type: 'underspecified_comparison',
          confidence: 0.85,
          clarificationPrompt: 'Compare that to what? Please specify both items.'
        };
      }
    }

    // Pattern 3: "prefer" or "like" without object
    if (/\b(prefer|like)\b/i.test(trimmed) && trimmed.length < 20) {
      // Very short "like/prefer" phrase = likely incomplete
      const hasObject = /\b(prefer|like)\s+\w+/i.test(trimmed);
      if (!hasObject) {
        return {
          detected: true,
          type: 'underspecified_comparison',
          confidence: 0.75,
          clarificationPrompt: 'What specifically? Prefer or like what?'
        };
      }
    }

    return null;
  }

  /**
   * Detect contradictory requests: "list all X but exclude all X"
   */
  private detectContradictoryRequest(input: string): AmbiguityDetection | null {
    const trimmed = input.toLowerCase().trim();

    // Pattern: "all X" + "none X" or "everything" + "nothing"
    const hasAllKeyword = /\b(all|everything|everyone|every)\b/i.test(trimmed);
    const hasNoneKeyword = /\b(none|nothing|nobody|no one|exclude|exclude all|exclude everything)\b/i.test(trimmed);

    if (hasAllKeyword && hasNoneKeyword) {
      return {
        detected: true,
        type: 'contradictory_request',
        confidence: 0.95,
        clarificationPrompt: 'That request is contradictory. You\'re asking for all X but excluding all X. What do you actually want?'
      };
    }

    // Pattern: "yes and no" / "do it but don't"
    const hasAffirmative = /\b(yes|sure|okay|ok|do it|go|proceed)\b/i.test(trimmed);
    const hasNegative = /\b(no|don't|dont|stop|don't do|never)\b/i.test(trimmed);

    if (hasAffirmative && hasNegative && trimmed.length < 30) {
      return {
        detected: true,
        type: 'contradictory_request',
        confidence: 0.85,
        clarificationPrompt: 'You\'re saying both yes and no. Which is it?'
      };
    }

    return null;
  }
}
