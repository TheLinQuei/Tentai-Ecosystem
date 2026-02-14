/**
 * Vi Integration Adapter for Sol Calendar
 * 
 * Provides calendar-specific Vi integration including
 * event suggestions, holiday lookups, and natural language parsing.
 */

export { useCalendarAI, useEventSuggestions, useNaturalLanguageParser } from './hooks';
export { parseEventFromText, suggestEventDetails, fetchHolidays } from './services';
export type { CalendarEvent, EventSuggestion, HolidayInfo } from './types';
export { VI_CALENDAR_CONFIG } from './config';
