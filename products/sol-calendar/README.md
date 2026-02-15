# Sol Calendar

Calendar application with natural language event creation powered by Vi.

## Structure

- `src/` - Calendar UI logic (JavaScript)
- `styles/` - CSS and theming
- `adapters/vi/` - Vi integration (natural language → events)
- `index.html` - Entry point

## How It Works

1. User types natural language: "Lunch with Sarah tomorrow at noon"
2. `adapters/vi/` sends to Vi core: "Parse this as a calendar event"
3. Vi returns structured event data
4. Calendar app displays/saves the event

## Setup

```bash
npm install
npm run dev
```

See `/adapters/vi/index.ts` for integration details.
