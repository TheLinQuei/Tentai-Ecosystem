/**
 * Holiday System (v1)
 * Packs: Astronomical (locked), Human-layer (default), Regional/Religious (optional)
 */

export const HOLIDAY_PACKS = [
  {
    id: "astro",
    name: "Astronomical Anchors",
    desc: "Solstices & equinoxes.",
    type: "astronomical",
    locked: true,
    defaultOn: true,
    items: [
      { id: "ws", name: "Winter Solstice", type: "greg", month: 12, day: 21 },
      { id: "ve", name: "Vernal Equinox", type: "greg", month: 3, day: 20 },
      { id: "ss", name: "Summer Solstice", type: "greg", month: 6, day: 21 },
      { id: "ae", name: "Autumnal Equinox", type: "greg", month: 9, day: 22 },
      { id: "sd", name: "Still Day", type: "dayno", dayNo: 365 }
    ]
  },
  {
    id: "human",
    name: "Human Layer",
    desc: "Widely recognized civil holidays.",
    type: "cultural",
    locked: false,
    defaultOn: true,
    items: [
      { id: "gd", name: "Gift Day", type: "greg", month: 12, day: 25 },
      { id: "rd", name: "Renewal Day", type: "greg", month: 4, day: 15 },
      { id: "fd1", name: "Family Day I", type: "greg", month: 1, day: 20 },
      { id: "ed", name: "Expression Day", type: "greg", month: 10, day: 31 },
      { id: "fd2", name: "Family Day II", type: "greg", month: 10, day: 10 }
    ]
  },
  {
    id: "us",
    name: "United States",
    desc: "US national holidays.",
    type: "national",
    region: "US",
    locked: false,
    defaultOn: false,
    items: [
      { id: "mlk", name: "MLK Jr. Day", type: "greg", month: 1, day: 15 },
      { id: "pres", name: "Presidents Day", type: "greg", month: 2, day: 15 },
      { id: "mem", name: "Memorial Day", type: "greg", month: 5, day: 26 },
      { id: "ind", name: "Independence Day", type: "greg", month: 7, day: 4 },
      { id: "lab", name: "Labor Day", type: "greg", month: 9, day: 1 },
      { id: "vet", name: "Veterans Day", type: "greg", month: 11, day: 11 },
      { id: "thnk", name: "Thanksgiving", type: "greg", month: 11, day: 22 }
    ]
  },
  {
    id: "christian",
    name: "Christian",
    desc: "Christian holidays.",
    type: "religious",
    lock: false,
    defaultOn: false,
    items: [
      { id: "chr", name: "Christmas", type: "greg", month: 12, day: 25 },
      { id: "eas", name: "Easter", type: "greg", month: 4, day: 9 },
      { id: "epip", name: "Epiphany", type: "greg", month: 1, day: 6 }
    ]
  },
  {
    id: "jewish",
    name: "Jewish",
    desc: "Jewish holidays.",
    type: "religious",
    locked: false,
    defaultOn: false,
    items: [
      { id: "rs", name: "Rosh Hashanah", type: "greg", month: 9, day: 23 },
      { id: "yk", name: "Yom Kippur", type: "greg", month: 10, day: 2 },
      { id: "han", name: "Hanukkah", type: "greg", month: 12, day: 25 }
    ]
  },
  {
    id: "islamic",
    name: "Islamic",
    desc: "Islamic holidays.",
    type: "religious",
    locked: false,
    defaultOn: false,
    items: [
      { id: "eid1", name: "Eid al-Fitr", type: "greg", month: 4, day: 10 },
      { id: "eid2", name: "Eid al-Adha", type: "greg", month: 7, day: 16 }
    ]
  },
  {
    id: "hindu",
    name: "Hindu",
    desc: "Hindu holidays.",
    type: "religious",
    locked: false,
    defaultOn: false,
    items: [
      { id: "diwali", name: "Diwali", type: "greg", month: 11, day: 1 },
      { id: "holi", name: "Holi", type: "greg", month: 3, day: 25 }
    ]
  }
];

/**
 * Load holiday preferences from localStorage
 */
export function loadHolidayPrefs() {
  try {
    const raw = localStorage.getItem("solcal_holiday_prefs");
    if (!raw) {
      const prefs = {};
      HOLIDAY_PACKS.forEach(p => (prefs[p.id] = !!p.defaultOn));
      return prefs;
    }
    return JSON.parse(raw) || {};
  } catch (e) {
    const prefs = {};
    HOLIDAY_PACKS.forEach(p => (prefs[p.id] = !!p.defaultOn));
    return prefs;
  }
}

/**
 * Save holiday preferences to localStorage
 */
export function saveHolidayPrefs(prefs) {
  try {
    localStorage.setItem("solcal_holiday_prefs", JSON.stringify(prefs || {}));
  } catch (e) {}
}

/**
 * Load custom holidays from localStorage
 */
export function loadCustomHolidays() {
  try {
    const raw = localStorage.getItem("solcal_holidays_custom");
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

/**
 * Save custom holidays to localStorage
 */
export function saveCustomHolidays(arr) {
  try {
    localStorage.setItem("solcal_holidays_custom", JSON.stringify(arr || []));
  } catch (e) {}
}

/**
 * Get all enabled holiday items
 * @param {object} prefs - Optional holiday preferences (defaults to loading from storage)
 * @param {array} customHolidays - Optional custom holidays (defaults to loading from storage)
 */
export function getEnabledHolidayItems(prefs = null, customHolidays = null) {
  const holidayPrefs = prefs || loadHolidayPrefs();
  const customs = customHolidays !== null ? customHolidays : loadCustomHolidays();
  const enabled = [];
  
  for (const pack of HOLIDAY_PACKS) {
    if (holidayPrefs[pack.id]) {
      enabled.push(...pack.items.map(it => ({ ...it, pack: pack.id })));
    }
  }
  
  enabled.push(...customs.map(it => ({ ...it, pack: "custom" })));
  return enabled;
}

/**
 * Check if holiday matches a Gregorian date
 */
export function holidayMatchesGregorian(item, d) {
  return (d.getMonth() + 1) === Number(item.month) && d.getDate() === Number(item.day);
}

/**
 * Get holidays for a Gregorian date
 * @param {Date} date
 * @param {object} prefs - Optional holiday preferences
 * @param {array} customHolidays - Optional custom holidays
 */
export function holidaysForGregorianDate(date, prefs = null, customHolidays = null) {
  const out = [];
  const items = getEnabledHolidayItems(prefs, customHolidays);
  
  for (const it of items) {
    if (it.type === "greg") {
      if (holidayMatchesGregorian(it, date)) out.push(it);
    }
  }
  
  return out;
}

/**
 * Get holidays for a day number
 * @param {number} dayNo
 * @param {object} prefs - Optional holiday preferences
 * @param {array} customHolidays - Optional custom holidays
 */
export function holidaysForDayNo(dayNo, prefs = null, customHolidays = null) {
  const out = [];
  const items = getEnabledHolidayItems(prefs, customHolidays);
  
  for (const it of items) {
    if (it.type === "dayno") {
      if (Number(it.dayNo) === Number(dayNo)) out.push(it);
    }
  }
  
  return out;
}

/**
 * Get region presets for easy setup
 */
export function getRegionPresets() {
  return [
    { name: "None", packs: [] },
    { name: "United States", packs: ["astro", "human", "us"] },
    { name: "Default", packs: ["astro", "human"] }
  ];
}

/**
 * Enable packs for a region
 */
export function applyRegionPreset(regionName) {
  const preset = getRegionPresets().find(p => p.name === regionName);
  if (!preset) return;
  
  const prefs = {};
  HOLIDAY_PACKS.forEach(p => (prefs[p.id] = preset.packs.includes(p.id)));
  saveHolidayPrefs(prefs);
}
