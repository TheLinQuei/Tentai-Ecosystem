/**
 * Vi Configuration for Sol Calendar
 */

const resolveApiBase = () => {
  const userOverride = localStorage.getItem('vi-api-base');
  if (userOverride) return userOverride;

  const configured = import.meta?.env?.VITE_API_BASE as string | undefined;
  if (configured && configured.trim().length > 0) return configured;

  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost') return 'http://localhost:3000';
    return 'https://tentai-ecosystem.onrender.com';
  }
  return 'http://localhost:3000';
};

export const VI_CALENDAR_CONFIG = {
  apiBase: resolveApiBase(),
  features: {
    naturalLanguageParsing: true,
    eventSuggestions: true,
    holidayLookup: true,
    smartReminders: true,
  },
  timeouts: {
    parse: 10000,
    suggest: 15000,
    holiday: 5000,
  },
};
