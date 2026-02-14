// Simple registry for visible UI surfaces members can click/tap.
export type UiElement = {
  area: string;      // "Onboarding", "Applications", ...
  title: string;     // "Ping Selector"
  type: "button" | "dropdown" | "panel" | "form" | "message";
  command?: string;  // related command (e.g., "postpings")
  how?: string;      // short "How to use" line
  notes?: string;    // any extra info or limitations
};

const UI: UiElement[] = [];
let seeded = false;

export function registerUiElement(u: UiElement) {
  UI.push(u);
}

export function listUiElements() {
  // stable ordering by area then title
  return [...UI].sort((a,b) => (a.area.localeCompare(b.area) || a.title.localeCompare(b.title)));
}

// optional: prevent double seeding if you hot-reload
export function markUiSeeded() { seeded = true; }
export function isUiSeeded() { return seeded; }