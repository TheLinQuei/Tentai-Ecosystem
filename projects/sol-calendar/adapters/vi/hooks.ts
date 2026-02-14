/**
 * React Hooks for Sol Calendar Vi Integration
 */

import { useState, useCallback } from 'react';
import { parseEventFromText, suggestEventDetails, fetchHolidays } from './services';
import type { CalendarEvent, EventSuggestion, HolidayInfo, NaturalLanguageParseResult } from './types';

/**
 * Hook for natural language event parsing
 */
export function useNaturalLanguageParser() {
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<NaturalLanguageParseResult | null>(null);

  const parseText = useCallback(async (text: string) => {
    setParsing(true);
    const parsed = await parseEventFromText(text);
    setResult(parsed);
    setParsing(false);
    return parsed;
  }, []);

  return { parseText, parsing, result };
}

/**
 * Hook for getting AI event suggestions
 */
export function useEventSuggestions() {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<EventSuggestion | null>(null);

  const getSuggestions = useCallback(async (title: string, context?: string) => {
    setLoading(true);
    const result = await suggestEventDetails(title, context);
    setSuggestion(result);
    setLoading(false);
    return result;
  }, []);

  return { getSuggestions, loading, suggestion };
}

/**
 * Hook for comprehensive calendar AI features
 */
export function useCalendarAI() {
  const { parseText, parsing } = useNaturalLanguageParser();
  const { getSuggestions, loading: suggestionsLoading } = useEventSuggestions();
  const [holidays, setHolidays] = useState<HolidayInfo[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);

  const loadHolidays = useCallback(async (startDate: Date, endDate: Date, country?: string) => {
    setLoadingHolidays(true);
    const result = await fetchHolidays(startDate, endDate, country);
    setHolidays(result);
    setLoadingHolidays(false);
    return result;
  }, []);

  return {
    parseText,
    getSuggestions,
    loadHolidays,
    holidays,
    loading: parsing || suggestionsLoading || loadingHolidays,
  };
}
