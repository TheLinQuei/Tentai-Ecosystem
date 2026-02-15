/**
 * Unified Application State Management
 * Version 2: Single source of truth for all app data
 */

import * as Holidays from "./holidays.js";

const MAIN_KEY = "77ez_calendar_v2";
const LEGACY_V1_KEY = "77ez_calendar_v1";

/**
 * Default AppState schema (v2)
 */
export const DEFAULT_APP_STATE = {
  version: 2,
  settings: {
    winterSolsticeDate: "",
    vernalEquinoxDate: "",
    winterSolsticeDayNo: 319,
    leapStillDayEnabled: true,
    showAdvanced: false
  },
  holidayPrefs: {},
  customHolidays: [],
  events: []
};

/**
 * Load unified app state from storage
 * Migrates from v1 or legacy keys if needed
 */
export function loadAppState() {
  try {
    // Try v2 first
    const v2Raw = localStorage.getItem(MAIN_KEY);
    if (v2Raw) {
      const parsed = JSON.parse(v2Raw);
      if (parsed.version === 2) {
        return normalizeAppState(parsed);
      }
    }

    // Migrate from v1
    const v1Raw = localStorage.getItem(LEGACY_V1_KEY);
    if (v1Raw) {
      const v1 = JSON.parse(v1Raw);
      return migrateV1ToV2(v1);
    }

    // Load from scattered legacy keys
    return migrateLegacyToV2();
  } catch (err) {
    console.error("Error loading app state:", err);
    return initializeDefaultState();
  }
}

/**
 * Save unified app state to storage
 */
export function saveAppState(appState) {
  try {
    const normalized = normalizeAppState(appState);
    localStorage.setItem(MAIN_KEY, JSON.stringify(normalized));
    
    // Also update legacy keys for backwards compatibility (optional)
    // You can remove this block once migration is complete
    const legacyState = {
      version: 1,
      ...normalized.settings,
      events: normalized.events
    };
    localStorage.setItem(LEGACY_V1_KEY, JSON.stringify(legacyState));
    
    // Save holiday prefs to legacy key
    localStorage.setItem("solcal_holiday_prefs", JSON.stringify(normalized.holidayPrefs));
    localStorage.setItem("solcal_holidays_custom", JSON.stringify(normalized.customHolidays));
    
    return true;
  } catch (err) {
    console.error("Error saving app state:", err);
    return false;
  }
}

/**
 * Normalize and validate app state
 */
function normalizeAppState(state) {
  const normalized = structuredClone(DEFAULT_APP_STATE);
  
  if (state.settings) {
    normalized.settings = { ...normalized.settings, ...state.settings };
  }
  
  normalized.holidayPrefs = state.holidayPrefs || {};
  normalized.customHolidays = Array.isArray(state.customHolidays) ? state.customHolidays : [];
  normalized.events = Array.isArray(state.events) ? state.events : [];
  
  return normalized;
}

/**
 * Migrate v1 state to v2
 */
function migrateV1ToV2(v1State) {
  const appState = structuredClone(DEFAULT_APP_STATE);
  
  // Migrate settings
  appState.settings.winterSolsticeDate = v1State.winterSolsticeDate || "";
  appState.settings.vernalEquinoxDate = v1State.vernalEquinoxDate || "";
  appState.settings.winterSolsticeDayNo = v1State.winterSolsticeDayNo || 319;
  appState.settings.leapStillDayEnabled = v1State.leapStillDayEnabled !== false;
  appState.settings.showAdvanced = v1State.showAdvanced || false;
  
  // Migrate events
  appState.events = Array.isArray(v1State.events) ? v1State.events : [];
  
  // Load holiday prefs from legacy key
  appState.holidayPrefs = Holidays.loadHolidayPrefs();
  appState.customHolidays = Holidays.loadCustomHolidays();
  
  console.log("Migrated v1 state to v2");
  return appState;
}

/**
 * Migrate from scattered legacy keys
 */
function migrateLegacyToV2() {
  const appState = structuredClone(DEFAULT_APP_STATE);
  
  // Try to load holiday prefs
  appState.holidayPrefs = Holidays.loadHolidayPrefs();
  appState.customHolidays = Holidays.loadCustomHolidays();
  
  // Try to find events in various old keys
  const POSSIBLE_EVENT_KEYS = [
    "solcal_events",
    "sol_calendar_events",
    "77ez_events",
    "events",
    "calendar_events"
  ];
  
  for (const key of POSSIBLE_EVENT_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const events = JSON.parse(raw);
        if (Array.isArray(events)) {
          appState.events = events;
          break;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
  
  console.log("Migrated from legacy scattered keys to v2");
  return appState;
}

/**
 * Initialize with sensible defaults
 */
function initializeDefaultState() {
  const appState = structuredClone(DEFAULT_APP_STATE);
  
  // Set default anchors based on current year
  const now = new Date();
  const guessWS = new Date(now.getFullYear() - 1, 11, 21);
  const guessVE = new Date(now.getFullYear(), 2, 20);
  
  appState.settings.winterSolsticeDate = formatISO(guessWS);
  appState.settings.vernalEquinoxDate = formatISO(guessVE);
  
  // Initialize default holiday packs
  Holidays.HOLIDAY_PACKS.forEach(pack => {
    appState.holidayPrefs[pack.id] = !!pack.defaultOn;
  });
  
  console.log("Initialized default app state");
  return appState;
}

/**
 * Export app state as JSON
 */
export function exportAppState(appState) {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: appState.settings,
    holidayPrefs: appState.holidayPrefs,
    customHolidays: appState.customHolidays,
    events: appState.events
  };
}

/**
 * Import app state from JSON
 */
export function importAppState(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid import data");
  }
  
  // Support both v1 and v2 imports
  if (data.version === 1) {
    return migrateV1ToV2(data);
  }
  
  if (data.version !== 2) {
    throw new Error("Unsupported version: " + data.version);
  }
  
  const appState = structuredClone(DEFAULT_APP_STATE);
  
  if (data.settings) {
    appState.settings = { ...appState.settings, ...data.settings };
  }
  
  appState.holidayPrefs = data.holidayPrefs || {};
  appState.customHolidays = Array.isArray(data.customHolidays) ? data.customHolidays : [];
  appState.events = Array.isArray(data.events) ? data.events : [];
  
  return appState;
}

/**
 * Format date as ISO string (YYYY-MM-DD)
 */
function formatISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
