/**
 * Sol Calendar Vi Adapter
 * Natural language event creation and parsing via Vi
 */

export interface CalendarEvent {
  title: string;
  date: string;
  time?: string;
  duration?: number;
  description?: string;
  reminders?: number[];
}

export interface EventParseRequest {
  input: string;
  userId: string;
  timezone?: string;
}

export interface EventParseResponse {
  events: CalendarEvent[];
  confidence: number;
  requiresConfirmation: boolean;
}

/**
 * Parse natural language input into calendar events via Vi
 * Example: "Schedule a meeting with Sarah tomorrow at 2pm for 30 minutes"
 */
export async function parseEventFromText(
  request: EventParseRequest,
  viApiBase: string = 'http://localhost:3000'
): Promise<EventParseResponse> {
  try {
    const response = await fetch(`${viApiBase}/parse/calendar-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: request.input,
        userId: request.userId,
        timezone: request.timezone || 'UTC',
        platform: 'calendar',
      }),
    });

    if (!response.ok) {
      throw new Error(`Vi API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error parsing event with Vi:', error);
    throw error;
  }
}

/**
 * Get event suggestions based on text context
 */
export async function suggestEventDetails(
  eventTitle: string,
  context: string,
  viApiBase?: string
): Promise<Partial<CalendarEvent>> {
  const response = await parseEventFromText(
    { input: `Suggest details for: ${context}`, userId: 'system' },
    viApiBase
  );

  return response.events[0] || {};
}

/**
 * Fetch holidays for a given year/month via Vi
 */
export async function fetchHolidays(
  year: number,
  month?: number,
  viApiBase?: string
): Promise<CalendarEvent[]> {
  try {
    const response = await fetch(
      `${viApiBase}/data/holidays?year=${year}${month ? `&month=${month}` : ''}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`Vi API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.holidays || [];
  } catch (error) {
    console.error('Error fetching holidays:', error);
    return [];
  }
}
