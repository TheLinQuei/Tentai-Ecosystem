# Quick Start Guide

## For End Users

### Open the App

1. **Direct file access**: Open `index.html` in your web browser
   - Works offline (no internet needed)
   - No installation required

2. **Via local server** (for development):
   ```bash
   npm run dev
   # Then visit http://localhost:8000
   ```

### First Time Setup

1. **Set astronomical anchors** (if different from defaults):
   - Go to Settings tab
   - Set Winter Solstice date (default: Dec 21)
   - Set Vernal Equinox date (default: Mar 20)
   - Click Save

2. **Configure holidays**:
   - In Settings, see "Holiday Packs"
   - Toggle regions/religions as needed
   - Changes apply immediately

3. **Start using**:
   - View today's date in **Today** tab
   - Explore **Month** and **Year** views
   - Add events in **Events** tab

---

## For Developers

### Project Setup

```bash
# Clone/download the project
cd sol-calendar

# Install dependencies (optional, for dev server)
npm install

# Start dev server
npm run dev

# Or use any HTTP server
python -m http.server 8000
# OR
npx http-server -p 8000
```

### Structure

```
sol-calendar/
├── index.html           # Main app
├── styles/
│   └── theme.css       # All styling
├── src/
│   ├── app.js          # Main logic
│   ├── calendar.js     # Engine (pure functions)
│   ├── holidays.js     # Holiday system
│   └── storage.js      # localStorage & events
├── docs/               # Documentation
├── README.md           # Full guide
└── package.json        # Scripts & metadata
```

### Key Files to Understand

1. **[calendar.js](src/calendar.js)** - The math
   - `dayNoFromGregorian()` - Convert date to day #
   - `monthDayFromDayNo()` - Convert day # to month/day
   - `yearLabelFromGregorian()` - Compute year

2. **[app.js](src/app.js)** - The UI
   - `renderToday()`, `renderMonth()`, `renderYear()`
   - State management & rendering loop

3. **[holidays.js](src/holidays.js)** - The packs
   - `HOLIDAY_PACKS` - Holiday definitions
   - `loadHolidayPrefs()` - User preferences

4. **[storage.js](src/storage.js)** - Data
   - `createEvent()`, `deleteEvent()` - Event CRUD
   - `exportData()`, `importData()` - JSON I/O

### Running Tests (Manual)

Open browser DevTools (F12) and try:

```javascript
// Test date conversion
import * as Cal from './src/calendar.js';
const today = new Date();
const dayNo = Cal.dayNoFromGregorian(today);
console.log('Today:', today, 'Day#:', dayNo);

// Test holidays
import * as Holidays from './src/holidays.js';
const holidays = Holidays.holidaysForGregorianDate(today);
console.log('Today\'s holidays:', holidays);

// Test storage
import * as Storage from './src/storage.js';
const state = Storage.loadState();
console.log('Current state:', state);
```

### Making Changes

1. **Edit a module** (e.g., `src/calendar.js`)
2. **Refresh browser** (F5)
3. **Check DevTools** for errors (F12 → Console)

### Building for Production

No build tool needed. Just:

1. Deploy the entire folder to a web server
2. Serve `index.html` as the entry point
3. Users can visit `yoursite.com/` and use the app

Optional: Minify CSS/JS for smaller downloads (not required).

---

## Troubleshooting

### "Today" date is wrong

**Check:**
1. Is your system time correct?
2. Are astronomical anchors set properly? (Settings)
3. Console error? (Press F12)

**Fix:**
- Settings → Reset All
- Reload page
- Set anchors again

### Events not showing

**Check:**
1. Did you create an event? (Events tab)
2. Is the event date correct?
3. Console error?

**Fix:**
- Try creating a test event
- Check localStorage (DevTools → Application → localStorage)

### Holiday not appearing

**Check:**
1. Is the pack enabled? (Settings → Holiday Packs)
2. Correct date? (Holidays are gregorian-based by default)

**Fix:**
- Toggle pack off and on again
- Refresh page (F5)

### Import/Export not working

**Check:**
1. File is valid JSON?
2. File downloaded/selected correctly?

**Fix:**
- Export → Open file in text editor → Check structure
- Try import again
- If stuck, reset and start over

---

## Going Deeper

- See [CALENDAR_RULES.md](docs/CALENDAR_RULES.md) for system details
- See [HOLIDAY_SYSTEM.md](docs/HOLIDAY_SYSTEM.md) for holiday setup
- See [MIGRATION.md](docs/MIGRATION.md) for localStorage schema
- See [README.md](README.md) for full feature list

---

**Built with ❤️ and ☀️**
