/**
 * Sol Calendar Engine
 * 13 months × 28 days + 1 Still Day = 364/365 days
 * Astronomical anchors: Winter Solstice (day 319)
 */

export const MONTHS = [
  "April", "May", "June", "July", "August", "Sol",
  "September", "October", "November", "December",
  "January", "February", "March"
];

export const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday"
];

/**
 * Checks if a Gregorian year is a leap year
 */
export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

/**
 * Days between two dates (UTC-safe, date-only)
 */
export function daysBetween(a, b) {
  const ms = 86400000;
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / ms);
}

/**
 * Get winter solstice for a given year from settings
 * @param {number} y - Year
 * @param {object} settings - Calendar settings
 */
export function winterSolsticeForYear(y, settings) {
  const solsticeISO = settings?.winterSolsticeDate || "";
  if (solsticeISO) {
    const parsed = parseISO(solsticeISO);
    if (parsed) {
      // Use the same month/day but for the requested year
      return new Date(y, parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
    }
  }
  // Fallback to Dec 21 if no valid settings
  return new Date(y, 11, 21, 0, 0, 0, 0);
}

/**
 * Convert to ISO date string (YYYY-MM-DD)
 */
export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

/**
 * Parse ISO date string to Date
 */
export function parseISO(iso) {
  if (!iso) return null;
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Extract month/day from ISO string (ignores year)
 */
export function monthDayFromISO(iso, fallbackMonth = 2, fallbackDay = 20) {
  const dt = parseISO(iso);
  if (!dt) return { m: fallbackMonth, d: fallbackDay };
  return { m: dt.getMonth(), d: dt.getDate() };
}

/**
 * Convert 77EZ day number to month/day info
 * dayNo: 1-364 (or 365-366 for Still Day/Leap Still Day)
 */
export function monthDayFromDayNo(dayNo, leapStillDayEnabled) {
  const len = leapStillDayEnabled ? 366 : 365;
  
  if (dayNo === 365) return { special: "Still Day" };
  if (len === 366 && dayNo === 366) return { special: "Leap Still Day" };
  if (dayNo < 1 || dayNo > len) return null;
  
  const idx = Math.floor((dayNo - 1) / 28);
  const dayInMonth = ((dayNo - 1) % 28) + 1;
  
  return {
    month: MONTHS[idx],
    monthIndex: idx,
    day: dayInMonth
  };
}

/**
 * Convert Gregorian date to 77EZ day number
 * @param {Date} gDate - Gregorian date
 * @param {object} settings - Calendar settings with winterSolsticeDate, winterSolsticeDayNo, leapStillDayEnabled
 */
export function dayNoFromGregorian(gDate, settings) {
  const y = gDate.getFullYear();
  const dayNo = settings?.winterSolsticeDayNo || 319;
  const leapEnabled = settings?.leapStillDayEnabled !== false;
  
  const wsThis = winterSolsticeForYear(y, settings);
  const wsPrev = winterSolsticeForYear(y - 1, settings);
  
  // Most recent winter solstice at or before target date
  const anchor = gDate >= wsThis ? wsThis : wsPrev;
  const anchorYear = anchor.getFullYear();
  const len = leapEnabled && isLeapYear(anchorYear) ? 366 : 365;
  
  const daysAfter = daysBetween(anchor, gDate); // 0 on solstice
  let solDay = dayNo + daysAfter;
  
  // Wrap around for multi-year cycles
  solDay = ((solDay - 1) % len) + 1;
  return solDay;
}

/**
 * Find Gregorian date for a given day number near a reference date
 * @param {number} targetDayNo - Target day number (1-366)
 * @param {string} yearLabel - Year label for context
 * @param {Date} nearDate - Reference date to search around
 * @param {object} settings - Calendar settings
 */
export function findGregorianForDayNoNear(targetDayNo, yearLabel, nearDate, settings) {
  const base = new Date(nearDate.getFullYear(), nearDate.getMonth(), nearDate.getDate());
  
  for (let r = 0; r <= 400; r++) {
    const testDate = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (r === 0 ? 0 : r % 2 === 0 ? r / 2 : -(r + 1) / 2));
    const testDayNo = dayNoFromGregorian(testDate, settings);
    if (testDayNo === targetDayNo) {
      return { date: testDate, dayNo: testDayNo };
    }
  }
  return null;
}

/**
 * Get season from month index
 */
export function seasonFromMonthIndex(mi) {
  if (mi <= 2) return "Spring";
  if (mi <= 5) return "Summer";
  if (mi <= 8) return "Fall";
  return "Winter";
}

/**
 * Get year label (rolls over at Vernal Equinox)
 */
export function yearLabelFromGregorian(gDate, vernalEquinoxISO) {
  const y = gDate.getFullYear();
  const veMD = monthDayFromISO(vernalEquinoxISO, 2, 20);
  const veThisYear = new Date(y, veMD.m, veMD.d);
  return gDate < veThisYear ? y - 1 : y;
}

/**
 * Get weekday name for a Gregorian date
 */
export function weekdayName(gDate, dayInfo) {
  if (dayInfo && dayInfo.special) return "";
  return WEEKDAYS[gDate.getDay()];
}

/**
 * Calculate year length (365 or 366)
 */
export function yearLen(leapStillDayEnabled) {
  return leapStillDayEnabled ? 366 : 365;
}
