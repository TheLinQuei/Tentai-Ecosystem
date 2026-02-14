/**
 * TypeScript Types for Sol Calendar Vi Integration
 */

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  allDay: boolean;
  location?: string;
  attendees?: string[];
  reminder?: number; // minutes before
  recurrence?: RecurrenceRule;
  color?: string;
  tags?: string[];
};

export type RecurrenceRule = {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  until?: Date;
  count?: number;
};

export type EventSuggestion = {
  confidence: number;
  title: string;
  description?: string;
  suggestedStartDate?: Date;
  suggestedEndDate?: Date;
  suggestedLocation?: string;
  reasoning?: string;
};

export type HolidayInfo = {
  name: string;
  date: Date;
  type: 'federal' | 'religious' | 'cultural' | 'observance';
  country?: string;
  description?: string;
};

export type NaturalLanguageParseResult = {
  success: boolean;
  event?: Partial<CalendarEvent>;
  suggestions?: string[];
  error?: string;
};
