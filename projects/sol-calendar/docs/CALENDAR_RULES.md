# Sol Calendar Rules

## Calendar Structure

### Formula

**13 months × 28 days + 1 Still Day = 364/365 days**

- **Total regular days**: 364 (no partial weeks)
- **Still Day**: Day #365 (outside weeks/months)
- **Leap Still Day**: Day #366 (optional, if `leapStillDayEnabled`)

### Months (in order)

| # | Name | Gregorian Anchor | Days |
|---|------|------------------|------|
| 1 | April | ~Apr 1–28 | 28 |
| 2 | May | ~May 1–28 | 28 |
| 3 | June | ~Jun 1–28 | 28 |
| 4 | July | ~Jul 1–28 | 28 |
| 5 | August | ~Aug 1–28 | 28 |
| 6 | Sol | ~Sep 1–28 | 28 |
| 7 | September | ~Oct 1–28 | 28 |
| 8 | October | ~Oct 29–Nov 25 | 28 |
| 9 | November | ~Nov 26–Dec 23 | 28 |
| 10 | December | ~Dec 24–Jan 20 | 28 |
| 11 | January | ~Jan 21–Feb 17 | 28 |
| 12 | February | ~Feb 18–Mar 17 | 28 |
| 13 | March | ~Mar 18–Apr 14 | 28 |
| — | Still Day | ~Apr 15 | 1 |

*Gregorian mapping is approximate and shifts based on astronomical anchors.*

### Weeks

- **7 days per week**: Sunday → Saturday
- **4 weeks per month**: No overflow
- **Still Day**: Outside weeks (no weekday name)

### Still Day (Day #365)

- Special day marking end of year
- **Locked holiday** (always visible)
- No weekday assignment
- Separate season designation ("Still")
- Optional 366th day for leap years

## Astronomical Anchors

### Truth Sources

1. **Winter Solstice** (default: Dec 21 Gregorian)
   - Marks day #319 in 77EZ calendar
   - ±1 day tolerance for Earth's orbital mechanics
   - User can adjust if needed

2. **Vernal Equinox** (default: Mar 20 Gregorian)
   - Marks **year label rollover** point
   - Gregorian Jan–Mar → previous Sol year
   - Gregorian Apr–Dec → current Sol year
   - Example: Gregorian 2025-03-19 = Sol Year 2024; 2025-03-21 = Sol Year 2025

3. **Summer Solstice** (locked, non-adjustable internally)
   - ~Jun 21 Gregorian
   - Holiday marker (not date conversion anchor)

4. **Autumnal Equinox** (locked, non-adjustable internally)
   - ~Sep 22 Gregorian
   - Holiday marker

### Date Conversion Algorithm

#### Gregorian → 77EZ (Day Number)

```
1. Find most recent Winter Solstice ≤ target Gregorian date
   (If today is after Dec 21, use current year's Dec 21)
   (If today is before Dec 21, use previous year's Dec 21)

2. Count days elapsed from solstice:
   daysAfter = daysBetween(winterSolstice, targetDate)

3. Compute 77EZ day#:
   solDay = 319 + daysAfter
   
4. Wrap around year:
   solDay = ((solDay - 1) % yearLength) + 1
   (yearLength = 365 or 366 depending on leapStillDayEnabled)

Result: dayNo (1–365/366)
```

#### 77EZ → Gregorian

```
1. Use targetDayNo to search nearby dates
2. Search ±400 days around a reference date
3. For each candidate, compute its dayNo using Gregorian→77EZ
4. Return Gregorian date when dayNo matches

Result: Date object
```

#### Month/Day from Day Number

```
If dayNo === 365:
  → Still Day (special)
Else if dayNo === 366 && leapStillDayEnabled:
  → Leap Still Day (special)
Else:
  monthIndex = floor((dayNo - 1) / 28)  // 0–12
  dayInMonth = ((dayNo - 1) % 28) + 1   // 1–28
  
  → {month: MONTHS[monthIndex], day: dayInMonth}
```

## Year Label

The **year label** (displayed as "Year YYYY") is computed from Vernal Equinox:

```javascript
function yearLabelFromGregorian(gDate, vernalEquinoxISO) {
  const y = gDate.getFullYear();
  const veMD = monthDayFromISO(vernalEquinoxISO); // e.g., {m: 2, d: 20}
  const veThisYear = new Date(y, veMD.m, veMD.d);
  
  return (gDate < veThisYear) ? (y - 1) : y;
}
```

**Examples** (with Vernal Equinox = Mar 20):

| Gregorian Date | Sol Year |
|---|---|
| 2025-01-15 | 2024 |
| 2025-03-19 (before VE) | 2024 |
| 2025-03-21 (after VE) | 2025 |
| 2025-12-31 | 2025 |

## Season Mapping

Seasons are tied to **month index**:

| Month Index | Months | Season |
|---|---|---|
| 0–2 | April, May, June | **Spring** |
| 3–5 | July, August, Sol | **Summer** |
| 6–8 | Sep, Oct, Nov | **Fall** |
| 9–12 | Dec, Jan, Feb, Mar | **Winter** |

Still Day is treated as "Still" (outside seasons).

## Important Constraints

### Must Remain Constant

1. ✅ 13 months, 28 days per month
2. ✅ 7-day weeks
3. ✅ Still Day at position 365
4. ✅ Week names: Sunday → Saturday
5. ✅ Month names & order (April first, Sol 6th, March last)
6. ✅ Winter Solstice = day #319
7. ✅ Vernal Equinox triggers year rollover

### Can Be Adjusted (by User in Settings)

- Winter Solstice **date** (default: Dec 21)
- Vernal Equinox **date** (default: Mar 20)
- Leap Still Day **enabled/disabled** (default: enabled)

### Tech Constraints (UTC-Safe)

- All date math uses UTC noon to avoid DST issues
- `daysBetween()` compares date-only (ignores time)
- "Today" is computed in local timezone, then converted

## Example Mappings

### Winter Solstice (Reference)

**2024-12-21 = Sol Day #319**

Working backward:
- Day #318 = 2024-12-20
- Day #317 = 2024-12-19
- Day #1 = 2024-01-02 (approx)

Working forward:
- Day #320 = 2024-12-22
- Day #364 = 2025-01-19
- Day #365 (Still) = 2025-01-20 (approximate)

### Vernal Equinox (Year Rollover)

**2025-03-20 = Sol Year 2024 → 2025 boundary**

Before: 2025-03-19 (last day of Sol Year 2024)
After: 2025-03-21 (first day of Sol Year 2025)

## Edge Cases

### Leap Years

- Gregorian leap years (366 days) are **not** directly represented
- Sol calendar can optionally include a 366th day ("Leap Still Day")
- If `leapStillDayEnabled = false`, year always has 365 days
- Leap still day is **always day #366**, not inserted into months

### Off-by-One Prevention

1. Use **date-only math** (no time component)
2. Use UTC for all conversions
3. Verify winter solstice alignment on app load
4. Display "Set anchors in Settings" if anchors invalid

### DST / Timezone Handling

- Calendar is **timezone-agnostic**
- "Today" is computed in local timezone
- Conversions happen at UTC midnight
- User sees their local date throughout

## Testing

### Acceptance Criteria

1. ✅ Convert today's Gregorian date → 77EZ day# (no +1 drift)
2. ✅ Convert 77EZ day# → Gregorian (consistent both ways)
3. ✅ Year rollover at Vernal Equinox (±1 day)
4. ✅ Leap Still Day included when enabled
5. ✅ Month/day display matches day# (1–28 range)
6. ✅ Season matches month index
7. ✅ No weeks cross month boundaries (4 weeks × 7 = 28 always)

---

**Version: 1.0** | **Last Updated: 2026-01-15**
