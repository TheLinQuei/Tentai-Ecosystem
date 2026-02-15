/**
 * Events & Storage System
 * Version 1 schema with migration support
 */

const KEY = "77ez_calendar_v1";

export const DEFAULT_STATE = {
  version: 1,
  winterSolsticeDate: "",
  vernalEquinoxDate: "",
  winterSolsticeDayNo: 319,
  leapStillDayEnabled: true,
  events: [],
  showAdvanced: false
};

/**
 * Load calendar state from localStorage
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) : {};
    return { ...structuredClone(DEFAULT_STATE), ...s };
  } catch (e) {
    return structuredClone(DEFAULT_STATE);
  }
}

/**
 * Save calendar state to localStorage
 */
export function saveState(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/**
 * Validate event object
 */
export function isValidEvent(e) {
  if (!e || typeof e !== "object") return false;
  if (!e.name || typeof e.name !== "string") return false;
  if (!e.type || !["gregorian", "77ez"].includes(e.type)) return false;
  if (e.type === "gregorian" && !e.gregorianDate) return false;
  if (e.type === "77ez" && typeof e.dayNo !== "number") return false;
  return true;
}

/**
 * Create a new event
 */
export function createEvent(name, type, data) {
  const e = {
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    type,
    recurring: data.recurring || false,
    createdAt: new Date().toISOString()
  };

  if (type === "gregorian") {
    e.gregorianDate = data.gregorianDate;
  } else if (type === "77ez") {
    e.dayNo = data.dayNo;
  }

  return e;
}

/**
 * Update an event
 */
export function updateEvent(state, eventId, updates) {
  const idx = state.events.findIndex(e => e.id === eventId);
  if (idx === -1) return false;

  state.events[idx] = { ...state.events[idx], ...updates };
  return true;
}

/**
 * Delete an event
 */
export function deleteEvent(state, eventId) {
  const idx = state.events.findIndex(e => e.id === eventId);
  if (idx === -1) return false;

  state.events.splice(idx, 1);
  return true;
}

/**
 * Get events for a Gregorian date
 */
export function getEventsForGregorian(gDate, state) {
  return state.events.filter(e => {
    if (e.type === "gregorian") {
      return e.gregorianDate === formatISO(gDate);
    }
    return false;
  });
}

/**
 * Get events for a day number
 */
export function getEventsForDayNo(dayNo, state) {
  return state.events.filter(e => {
    if (e.type === "77ez" && e.recurring) {
      return e.dayNo === dayNo;
    }
    return false;
  });
}

/**
 * Find next occurrence of an event
 */
export function bestNextOccurrenceDate(e, fromDate) {
  for (let i = 0; i < 370; i++) {
    const testDate = new Date(
      fromDate.getFullYear(),
      fromDate.getMonth(),
      fromDate.getDate() + i
    );
    if (e.type === "gregorian") {
      const testISO = formatISO(testDate);
      if (testISO === e.gregorianDate) return testDate;
    }
  }
  return null;
}

/**
 * Export state as JSON
 */
export function exportData(state) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    events: state.events,
    settings: {
      winterSolsticeDate: state.winterSolsticeDate,
      vernalEquinoxDate: state.vernalEquinoxDate,
      winterSolsticeDayNo: state.winterSolsticeDayNo,
      leapStillDayEnabled: state.leapStillDayEnabled
    }
  };
}

/**
 * Import state from JSON
 */
export function importData(data) {
  if (!data || typeof data !== "object") return null;
  if (data.version !== 1) return null;

  const state = {
    ...structuredClone(DEFAULT_STATE),
    events: Array.isArray(data.events) ? data.events : []
  };

  if (data.settings) {
    state.winterSolsticeDate = data.settings.winterSolsticeDate || "";
    state.vernalEquinoxDate = data.settings.vernalEquinoxDate || "";
    state.winterSolsticeDayNo = data.settings.winterSolsticeDayNo || 319;
    state.leapStillDayEnabled =
      data.settings.leapStillDayEnabled !== false;
  }

  return state;
}

/**
 * Format date as ISO string (YYYY-MM-DD)
 */
export function formatISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

/**
 * Migrate old localStorage events to new schema
 */
export function migrateOldEvents() {
  const POSSIBLE_KEYS = [
    "solcal_events",
    "sol_calendar_events",
    "77ez_events",
    "events",
    "calendar_events"
  ];

  for (const k of POSSIBLE_KEYS) {
    const raw = localStorage.getItem(k);
    if (raw) {
      try {
        const events = JSON.parse(raw);
        if (Array.isArray(events)) return events;
      } catch (e) {}
    }
  }

  return [];
}
