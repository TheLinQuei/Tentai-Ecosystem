# Holiday System

## Overview

Sol Calendar includes a flexible, modular holiday system with:

- **Locked packs** (always visible)
- **Default packs** (enabled by default)
- **Optional packs** (national, religious, regional)
- **Custom holidays** (user-created)

Users can mix & match packs without forcing everyone to see everything.

## Holiday Packs

### 1. Astronomical Anchors (Locked)

**Always visible. Cannot be disabled.**

| Holiday | Type | Date | Notes |
|---------|------|------|-------|
| Winter Solstice | Gregorian | Dec 21 | Truth anchor, day #319 |
| Vernal Equinox | Gregorian | Mar 20 | Year rollover point |
| Summer Solstice | Gregorian | Jun 21 | No conversion impact |
| Autumnal Equinox | Gregorian | Sep 22 | No conversion impact |
| Still Day | 77EZ | Day #365 | Outside months/weeks |

**Rationale:** These are the foundation of the calendar system.

---

### 2. Human Layer (Default On)

**Widely recognized cultural holidays. Enabled by default.**

| Holiday | Type | Date | Region | Notes |
|---------|------|------|--------|-------|
| Gift Day | Gregorian | Dec 25 | Universal | Midwinter gift tradition (non-religious) |
| Renewal Day | Gregorian | Apr 15 | Universal | Post-Vernal Equinox renewal |
| Family Day I | Gregorian | Jan 20 | Universal | Early-year family gathering |
| Expression Day | Gregorian | Oct 31 | Universal | Costume/cosplay celebration (not Halloween) |
| Family Day II | Gregorian | Oct 10 | Universal | Post-Autumnal Equinox family time |

**Rationale:** Common, inclusive, secular. Most users will want these visible.

---

### 3. National / Regional Packs (Optional)

#### United States

| Holiday | Type | Date | Notes |
|---------|------|------|-------|
| MLK Jr. Day | Gregorian | Jan 15 | Civil rights |
| Presidents Day | Gregorian | Feb 15 | Leadership |
| Memorial Day | Gregorian | May 26 | Remembrance |
| Independence Day | Gregorian | Jul 4 | National |
| Labor Day | Gregorian | Sep 1 | Worker recognition |
| Veterans Day | Gregorian | Nov 11 | Military service |
| Thanksgiving | Gregorian | Nov 22 | Gratitude |

**Packed by default: OFF**
Enable via Settings → Region preset → "United States"

---

### 4. Religious Packs (Optional)

#### Christian

| Holiday | Type | Date |
|---------|------|------|
| Christmas | Gregorian | Dec 25 |
| Easter | Gregorian | Apr 9 |
| Epiphany | Gregorian | Jan 6 |

#### Jewish

| Holiday | Type | Date |
|---------|------|------|
| Rosh Hashanah | Gregorian | Sep 23 |
| Yom Kippur | Gregorian | Oct 2 |
| Hanukkah | Gregorian | Dec 25 |

#### Islamic

| Holiday | Type | Date |
|---------|------|------|
| Eid al-Fitr | Gregorian | Apr 10 |
| Eid al-Adha | Gregorian | Jul 16 |

#### Hindu

| Holiday | Type | Date |
|---------|------|------|
| Diwali | Gregorian | Nov 1 |
| Holi | Gregorian | Mar 25 |

**All packed by default: OFF**
Enable individually or by region preset.

---

## Holiday Configuration

### Settings → Holiday Packs

Users can:

1. **Toggle packs on/off**
   - Checkbox for each optional pack
   - Astronomical & Human always checked
   - Changes apply immediately

2. **Region presets**
   - "None" (astronomical only)
   - "Default" (astronomical + human)
   - "United States" (astronomical + human + US pack)
   - Easy way to enable related packs at once

3. **Search/filter** (future v2)
   - Find holidays by name
   - Filter by type (astronomical, cultural, national, religious)

4. **Custom holidays** (future v2)
   - Add personal holidays (birthdays, anniversaries)
   - Choose Gregorian or 77EZ date
   - Recurring or one-time

---

## Holiday Display

### Visibility Rules

1. **Holiday appears if:**
   - Its pack is enabled (or locked & always-on)
   - The current date or day# matches the holiday definition

2. **Multiple calendars:**
   - Gregorian-based holidays: Match on Gregorian date
   - 77EZ-based holidays: Match on day number
   - Still Day: Always day #365

### Views Showing Holidays

| View | Shows Holidays |
|------|---|
| Today | ✅ List of holidays on current date |
| Month | ✅ Holiday dot on calendar days |
| Year | ✅ Holiday indicator + list on day cells |
| Events | ❌ (separate from events) |

**Visual:**
- Gold dot (·) marks holidays
- Gold tag with holiday name in detail views
- Distinct from event bullets

---

## Holiday Definition Format

### Gregorian-Based

```javascript
{
  id: "chr",                    // unique ID
  name: "Christmas",            // display name
  type: "greg",                 // gregorian
  month: 12,                    // 1–12
  day: 25,                      // 1–31
  pack: "christian"             // pack ID
}
```

### 77EZ Day-Based

```javascript
{
  id: "sd",
  name: "Still Day",
  type: "dayno",                // dayno
  dayNo: 365,                   // 1–365/366
  pack: "astro"
}
```

---

## Storage

### Holiday Preferences (localStorage)

**Key:** `solcal_holiday_prefs`

```json
{
  "astro": true,
  "human": true,
  "us": false,
  "christian": false,
  "jewish": false,
  "islamic": false,
  "hindu": false
}
```

Saves after every toggle.

### Custom Holidays (localStorage)

**Key:** `solcal_holidays_custom`

```json
[
  {
    "id": "custom_1",
    "name": "My Birthday",
    "type": "greg",
    "month": 7,
    "day": 15,
    "recurring": true,
    "pack": "custom"
  }
]
```

---

## API

### `holidays.js`

```javascript
// Get all enabled holiday items (packed + custom)
getEnabledHolidayItems()

// Get holidays for a Gregorian date
holidaysForGregorianDate(date)

// Get holidays for a 77EZ day number
holidaysForDayNo(dayNo)

// Load/save preferences
loadHolidayPrefs() / saveHolidayPrefs(prefs)

// Load/save custom holidays
loadCustomHolidays() / saveCustomHolidays(arr)

// Apply region preset
applyRegionPreset("United States")
getRegionPresets()
```

---

## Inclusion Philosophy

**"Inclusion without forcing."**

1. **Astronomical**: Always visible (foundation of system)
2. **Human-layer**: Visible by default (inclusive, secular)
3. **Regional/Religious**: Optional (users choose what matters to them)

Nobody is forced to see holidays that don't apply to them. Nobody is excluded.

---

## Future (v2+)

- Lunar calendar holidays (Chinese New Year, Diwali exact dates)
- Custom holiday creation UI in Settings
- Holiday search & filtering
- "Favorite" holidays (pin to top)
- Holiday descriptions & links
- Import holiday calendars (iCal format)

---

**Version: 1.0** | **Last Updated: 2026-01-15**
