/**
 * Vi Calendar Integration Point
 * 
 * Defines the interface that calendar products (Sol Calendar) use to connect with Vi
 */

import { z } from 'zod';

/**
 * Schema for calendar event parse request
 */
export const CalendarEventSchema = z.object({
  title: z.string(),
  date: z.string(),
  time: z.string().optional(),
  duration: z.number().optional(),
  description: z.string().optional(),
  reminders: z.array(z.number()).optional(),
});

export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

/**
 * Interface for calendar integration handler
 */
export interface ICalendarIntegration {
  /**
   * Parse natural language into calendar events
   * Example: "Schedule lunch with Sarah tomorrow at noon"
   */
  parseEvent(input: string, userId: string): Promise<CalendarEvent[]>;

  /**
   * Suggest event details based on context
   */
  suggestDetails(eventTitle: string, context: string): Promise<Partial<CalendarEvent>>;

  /**
   * Get holidays for a given period
   */
  getHolidays(year: number, month?: number): Promise<CalendarEvent[]>;
}

/**
 * Calendar integration implementation
 */
export class CalendarIntegration implements ICalendarIntegration {
  async parseEvent(input: string, userId: string): Promise<CalendarEvent[]> {
    // TODO: Route to Vi's NLP pipeline for event extraction
    // This will call core/vi/src/brain/ with the natural language input
    console.log(`[Calendar] Parsing: "${input}" for user ${userId}`);
    return [];
  }

  async suggestDetails(eventTitle: string, context: string): Promise<Partial<CalendarEvent>> {
    // TODO: Use Vi's reasoning to infer event details
    return { title: eventTitle };
  }

  async getHolidays(year: number, month?: number): Promise<CalendarEvent[]> {
    // TODO: Fetch holiday data (could be stored in lore system)
    return [];
  }
}
