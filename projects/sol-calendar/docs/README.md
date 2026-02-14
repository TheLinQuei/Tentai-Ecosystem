# Sol Calendar (77EZ)

A luxurious, futuristic calendar app implementing a 13×28 solar calendar system with astronomical anchors, events, and flexible holiday configuration.

**Available on all platforms:** Web, Windows, macOS, Android, iOS

> **⚡ Quick Start:** [START_HERE.md](START_HERE.md) | **📥 Download:** [DOWNLOAD_AND_INSTALL.md](DOWNLOAD_AND_INSTALL.md) | **🚀 Build:** [RELEASE_READY.md](RELEASE_READY.md)

## 🌟 Features

### Core Calendar
- **13 months × 28 days** + 1 Still Day = 364/365 days
- **Astronomical anchors** (Winter Solstice, Vernal Equinox, Summer Solstice, Autumnal Equinox)
- **Gregorian ↔ 77EZ conversion** with UTC-safe date math
- **Mobile-responsive** design (tested 360px+)
- **Premium UI** with dark theme, gold/purple accents

### Events & Holidays
- **Event management** (Create, Edit, Delete with confirmation)
- **Flexible holiday system** with presets (Astronomical, Human-layer, Regional/Religious)
- **Export/Import** JSON support

### Cloud Features (Optional)
- **Cloud sync** across devices via Supabase
- **User authentication** (email/password or magic link)
- **Group sharing** with invite codes
- **Offline-first** - works without internet, syncs when connected
- **Privacy-focused** - works fully local if you don't configure cloud

### Platform Support
- **🌐 Web** - Any modern browser
- **🖥️ Desktop** - Windows, macOS, Linux (Electron)
- **📱 Mobile** - Android, iOS (Capacitor)
- **Same codebase, all platforms** - Build once, run everywhere

### Technical
- **Zero build dependencies for web** (pure HTML/CSS/ES6 modules)
- **Native apps via Electron + Capacitor**
- **Modular architecture** (state, calendar engine, auth, sync, groups)
- **LocalStorage v2 schema** with automatic migration

## 🚀 Quick Start

### Web App (Instant, No Install)

1. Open `index.html` in any modern browser
2. Set astronomical anchors in **Settings** (default: Dec 21 & Mar 20)
3. View today in **Today** tab, or explore **Month** and **Year** views
4. Create events in **Events** tab
5. Configure holidays in **Settings → Holiday Packs**

All data stored in browser localStorage. No internet required.

### Native Apps (Desktop & Mobile)

**Desktop:**
```bash
# Windows, macOS, or Linux
npm install
npm run electron:dev        # Development mode
npm run electron:build      # Production installer
```

**Mobile:**
```bash
# Android or iOS
npm install
npx cap add android         # First time only
npm run mobile:android      # Open Android Studio
npm run mobile:build:android # Build APK
```

See [BUILD_COMMANDS.md](BUILD_COMMANDS.md) for quick reference or [docs/BUILDING_APPS.md](docs/BUILDING_APPS.md) for complete guide.

### Cloud Mode (Optional - Sync & Sharing)

1. Follow setup guide: [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)
2. Create a free Supabase project
3. Run database schema from guide
4. Configure credentials in app (Login tab) or `.env` file
5. Sign up/login to enable sync & groups

Cloud features are **opt-in**. The app works perfectly without them.

## 📁 Project Structure

```
sol-calendar/
├── index.html                 # Main app HTML
├── styles/
│   └── theme.css             # Theme tokens & components
├── src/
│   ├── app.js                # Main app logic & UI rendering
│   ├── state.js              # Unified app state management (v2)
│   ├── calendar.js           # Calendar engine & date conversion
│   ├── holidays.js           # Holiday system with packs
│   ├── storage.js            # Legacy storage helpers (v1 compat)
│   ├── auth.js               # Supabase authentication wrapper
│   ├── sync.js               # Cloud sync engine (offline-first)
│   ├── groups.js             # Group sharing & collaboration
│   └── capacitor-init.js     # Mobile native APIs
├── electron/
│   ├── main.js               # Desktop app main process
│   ├── preload.js            # Secure IPC bridge
│   └── forge.config.js       # Build configuration
├── docs/
│   ├── BUILDING_APPS.md     # Native app build guide
│   ├── SETUP_GUIDE.md       # Cloud sync setup instructions
│   ├── AUDIT_REPORT.md      # Technical audit findings
│   ├── DEV_CHECKLIST.md     # Manual testing checklist
│   ├── CALENDAR_RULES.md    # Calendar system documentation
│   ├── HOLIDAY_SYSTEM.md    # Holiday packs & configuration
│   └── MIGRATION.md         # Storage schema versioning
├── assets/                   # Icons & images (placeholder)
├── .env.example              # Environment variables template
├── package.json              # Dependencies (optional cloud features)
└── README.md                # This file
```

## 🗓️ Calendar System

### 13 Months (in order)

1. **April** (28 days)
2. **May** (28 days)
3. **June** (28 days)
4. **July** (28 days)
5. **August** (28 days)
6. **Sol** (28 days) — *the 6th month*
7. **September** (28 days)
8. **October** (28 days)
9. **November** (28 days)
10. **December** (28 days)
11. **January** (28 days)
12. **February** (28 days)
13. **March** (28 days)

### Week Structure

- 7 days per week: Sunday → Saturday
- 4 weeks per month
- No partial weeks

### Still Day (Day #365)

- Outside of weeks and months
- Marks end of year
- Optional leap Still Day (#366) if configured

### Year Label

- Rolls over at **Vernal Equinox** (default: March 20)
- Gregorian 2025 Q1 → Sol Year 2024
- Gregorian 2025 Q2-Q4 → Sol Year 2025

## 🎯 Date Conversion

### Gregorian → 77EZ

App converts Gregorian dates to 77EZ using astronomical anchors:

1. Find most recent Winter Solstice (≤ target date)
2. Count days from solstice
3. Offset by solstice day# (default: 319)
4. Wrap around year length

### 77EZ → Gregorian

App searches ±400 days around reference date to find Gregorian match.

**Truth anchor:** Winter Solstice is always day #319 (Dec 21 Gregorian by default)

## 🎨 UI Philosophy

- **77EZ Premium**: Black backgrounds (#06060B), gold trim (#E7C26A), purple accents (#A88CFF)
- **Luxury feel**: Glassmorphic cards, subtle gradients, smooth transitions
- **Human-friendly**: No snark, clear labels, responsive to 360px mobile width
- **Dark mode**: Eye-friendly on all devices

## 📅 Views

| View | Purpose |
|------|---------|
| **Today** | Current date in both calendars, events, holidays |
| **Month** | 28-day month grid with day numbers, holidays |
| **Year** | All 13 months + Still Day at once |
| **Events** | Add, list, delete events (with confirmation) |
| **Settings** | Anchors, data export/import, holiday toggles |
| **About** | Help & system info |

## 🏆 Holiday System

### Packs

1. **Astronomical** (locked, always-on)
   - Winter Solstice, Vernal Equinox, Summer Solstice, Autumnal Equinox, Still Day

2. **Human Layer** (on by default)
   - Gift Day, Renewal Day, Family Day I & II, Expression Day

3. **Regional/Religious** (opt-in)
   - US (MLK, Presidents, July 4, Veterans, etc.)
   - Christian (Christmas, Easter, Epiphany)
   - Jewish (Rosh Hashanah, Yom Kippur, Hanukkah)
   - Islamic (Eid al-Fitr, Eid al-Adha)
   - Hindu (Diwali, Holi)

### Configuration

- Enable/disable packs in **Settings**
- Locked packs (Astronomical) always visible
- Changes apply immediately to all views
- Settings saved to localStorage

## 📝 Events

### Types

- **Gregorian** (one-time): Fixed Gregorian date
- **77EZ** (recurring): Same day# every year

### Management

1. **Create**: Events tab → Enter name, type, date/day# → Add Event
2. **Edit**: Events tab → Click event or Edit button → Modify → Save Changes
3. **Delete**: Click Delete button (confirmation required)
4. **List**: Events tab shows all with next occurrence
5. **Export**: Settings → Export (includes events, settings, holiday prefs)
6. **Import**: Settings → Import (restores complete app state)

## 💾 Storage

### Schema (v2)

```javascript
{
  version: 2,
  settings: {
    winterSolsticeDate: "2024-12-21",
    vernalEquinoxDate: "2024-03-20",
    winterSolsticeDayNo: 319,
    leapStillDayEnabled: true,
    showAdvanced: false
  },
  holidayPrefs: {
    astro: true,
    human: true,
    us: false,
    // ... other packs
  },
  customHolidays: [],
  events: [
    {
      id: "evt_...",
      name: "Birthday",
      type: "gregorian|77ez",
      gregorianDate: "2024-12-25",  // for gregorian
      dayNo: 341,                   // for 77ez
      recurring: true|false,
      createdAt: "2024-01-15T..."
    }
  ]
}
```

### Persistence

- Primary key: `77ez_calendar_v2` (localStorage)
- Migrates from v1 automatically
- Also maintains legacy keys for backwards compatibility
- Auto-saves on every state change via `setState()`
- Export/Import includes everything (settings + events + holiday prefs)

## 🧪 Acceptance Tests

### Core Features (No Cloud Required)

- ✅ Mobile width ~360px: layout scales, no overflow, readable
- ✅ "Today" Sol date matches Gregorian conversion with no +1 drift
- ✅ Creating/editing/deleting event works; delete requires confirmation
- ✅ **Event edit works**: Click event → Modal opens → Edit name/type/date → Save
- ✅ Export downloads JSON; Import restores events/settings/holidays **completely**
- ✅ Toggling holiday packs immediately updates all views
- ✅ **Settings save button works**: Changes persist across reload
- ✅ **Calendar engine uses user anchors**: Changing Winter Solstice Day# updates all conversions
- ✅ Year/Month views show holidays and events distinctly
- ✅ Offline: app works without network (no external APIs)
- ✅ Timezone handling: detects user's TZ, displays correctly

### Cloud Features (Requires Supabase)

- ✅ **Auth**: Sign up, login (password + magic link), logout
- ✅ **Sync**: Events sync across devices when logged in
- ✅ **Groups**: Create group, invite by code, view shared events
- ✅ **Offline-first**: Works offline, syncs when reconnected
- ✅ **Privacy**: No data sent to cloud unless logged in

See [docs/DEV_CHECKLIST.md](docs/DEV_CHECKLIST.md) for full test matrix.

## 🛠️ Development

### Modules

- `calendar.js`: Calendar engine (pure functions, no side effects)
- `holidays.js`: Holiday packs & preferences
- `storage.js`: Events & localStorage CRUD
- `app.js`: UI rendering & state management
- `styles/theme.css`: All styling (reusable variables)

### Key Functions

```javascript
// state.js (v2)
loadAppState()                      // Unified state loader (migrates from v1)
saveAppState(appState)              // Persists all state
exportAppState(appState)            // JSON export (complete)
importAppState(data)                // JSON import with migration

// calendar.js
dayNoFromGregorian(gDate, settings)           // 1-365/366
monthDayFromDayNo(dayNo, leapEnabled)         // {month, day} or {special}
yearLabelFromGregorian(gDate, vernalEqISO)    // Year number
findGregorianForDayNoNear(dayNo, yearLabel, nearDate, settings)
winterSolsticeForYear(year, settings)         // Anchor date for year

// holidays.js
getEnabledHolidayItems(prefs, customHolidays) // All active holidays
holidaysForGregorianDate(date, prefs, customHolidays)
holidaysForDayNo(dayNo, prefs, customHolidays)
loadHolidayPrefs() / saveHolidayPrefs(prefs)

// storage.js (legacy v1 support)
createEvent(name, type, data)       // New event
getEventsForGregorian(date, state)  // Events on date
bestNextOccurrenceDate(event, from) // Next event occurrence
```

### Build & Run

#### Local-Only (No Dependencies)

**No build tool required.** Just serve `index.html` with any HTTP server:

```bash
# Python 3
python -m http.server 8000

# Node.js (recommended)
npx http-server -p 8000

# Or open directly: file:///.../index.html
```

Visit `http://localhost:8000` and start using.

#### Cloud Features (Optional)

1. Install dependencies:
```bash
npm install
```

2. Follow [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) to configure Supabase

3. Serve as above - cloud features activate automatically when configured

## 🔧 Recent Changes (v2.0.0)

**Phase 1-5: Core Refactor (Audit-Driven)**
- ✅ Fixed Settings save button (was never mounted)
- ✅ Unified app state (`state.js` v2 schema)
- ✅ Calendar engine now uses user settings (not hardcoded)
- ✅ Export/Import round-trips all data (settings + events + holiday prefs)
- ✅ Event edit UI implemented (modal with validation)
- ✅ Added toast notifications (no more alert boxes)
- ✅ State management with `setState()` helper

**Phase 6-8: Cloud Features (Optional)**
- ✅ User authentication (email/password + magic link)
- ✅ Cloud sync with offline-first architecture
- ✅ Group sharing with invite codes
- ✅ Last-write-wins conflict resolution
- ✅ Progressive enhancement (works without cloud)

See [docs/AUDIT_REPORT.md](docs/AUDIT_REPORT.md) for full findings and [docs/DEV_CHECKLIST.md](docs/DEV_CHECKLIST.md) for testing.

## 🧠 Roadmap

**Implemented (v2.0.0):**
- ✅ User authentication & cloud sync
- ✅ Event sharing via groups
- ✅ Offline-first with auto-sync

**Future Ideas:**
- ❌ Custom holiday creation UI
- ❌ Advanced recurring patterns (weekly, bi-weekly, etc.)
- ❌ Dark/light theme toggle
- ❌ Localization (i18n)
- ❌ PWA installation
- ❌ Calendar integrations (iCal export, Google Calendar sync)

## 📄 License

Open source. Use freely.

## 🤝 Contributing

File an issue or PR. Core rules (13×28, astronomical anchors) are non-negotiable; everything else is negotiable.

---

**Built with ❤️ and ☀️ for a better calendar.**
