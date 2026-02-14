/**
 * Vi API Services for Sol Calendar
 */

import { VI_CALENDAR_CONFIG } from './config';
import type { EventSuggestion, HolidayInfo, NaturalLanguageParseResult } from './types';

/**
 * Parse natural language text into event details
 * Example: "Lunch with Sarah tomorrow at noon" → event object
 */
export async function parseEventFromText(text: string): Promise<NaturalLanguageParseResult> {
  try {
    const response = await fetch(`${VI_CALENDAR_CONFIG.apiBase}/v1/calendar/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(VI_CALENDAR_CONFIG.timeouts.parse),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, event: data.event, suggestions: data.suggestions };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Parse failed',
    };
  }
}

/**
 * Get AI suggestions for event details based on title
 */
export async function suggestEventDetails(title: string, context?: string): Promise<EventSuggestion | null> {
  try {
    const response = await fetch(`${VI_CALENDAR_CONFIG.apiBase}/v1/calendar/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, context }),
      signal: AbortSignal.timeout(VI_CALENDAR_CONFIG.timeouts.suggest),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.suggestion;
  } catch {
    return null;
  }
}

/**
 * Fetch holidays for a specific date range
 */
export async function fetchHolidays(
  startDate: Date,
  endDate: Date,
  country: string = 'US'
): Promise<HolidayInfo[]> {
  try {
    const params = new URLSearchParams({
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      country,
    });

    const response = await fetch(`${VI_CALENDAR_CONFIG.apiBase}/v1/calendar/holidays?${params}`, {
      signal: AbortSignal.timeout(VI_CALENDAR_CONFIG.timeouts.holiday),
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.holidays || [];
  } catch {
    return [];
  }
}
