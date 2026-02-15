/**
 * Sol Calendar - Main Application
 */

import * as Cal from "./calendar.js";
import * as Holidays from "./holidays.js";
import * as Storage from "./storage.js";
import * as State from "./state.js";
import * as Auth from "./auth.js";
import * as Sync from "./sync.js";
import * as Groups from "./groups.js";

// ============================================================================
// STATE & INITIALIZATION
// ============================================================================

let appState = State.loadAppState();
let state = appState.settings; // Backwards compatibility shorthand
let currentUser = null;
let userGroups = [];
const now = new Date();

// Initialize Supabase (optional - works without it)
const SUPABASE_URL = localStorage.getItem('supabase_url') || '';
const SUPABASE_ANON_KEY = localStorage.getItem('supabase_anon_key') || '';
const authEnabled = Auth.initSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);

// Ensure anchors are set
if (!state.winterSolsticeDate) {
  const guessWS = new Date(now.getFullYear() - 1, 11, 21);
  state.winterSolsticeDate = Cal.toISO(guessWS);
}
if (!state.vernalEquinoxDate) {
  const guessVE = new Date(now.getFullYear(), 2, 20);
  state.vernalEquinoxDate = Cal.toISO(guessVE);
}

State.saveAppState(appState);

document.body.setAttribute("data-adv", state.showAdvanced ? "1" : "0");
document.getElementById("tzLabel").textContent =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";

// ============================================================================
// STATE UPDATE HELPER
// ============================================================================

function setState(patch) {
  // Merge patch into appState
  if (patch.settings) {
    appState.settings = { ...appState.settings, ...patch.settings };
    state = appState.settings; // Update shorthand
  }
  if (patch.holidayPrefs) {
    appState.holidayPrefs = { ...appState.holidayPrefs, ...patch.holidayPrefs };
  }
  if (patch.customHolidays !== undefined) {
    appState.customHolidays = patch.customHolidays;
  }
  if (patch.events !== undefined) {
    appState.events = patch.events;
  }
  
  // Save to storage (local cache)
  State.saveAppState(appState);
  
  // Sync to cloud if logged in
  if (currentUser) {
    Sync.pushStateChange(currentUser.id, patch).catch(err => {
      console.error("Cloud sync failed:", err);
      // Don't show toast - sync happens in background
    });
  }
  
  // Re-render current view
  render();
}

// ============================================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================================

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 12px 20px;
    background: ${type === "error" ? "#E74C3C" : type === "success" ? "#2ECC71" : "#3498DB"};
    color: white;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s ease-in";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================================
// AUTH STATE MANAGEMENT
// ============================================================================

// Listen for auth state changes
Auth.onAuthStateChange(async (event, session) => {
  console.log("Auth state changed:", event, session?.user?.id);
  
  if (session?.user) {
    currentUser = session.user;
    
    // Sync with cloud
    try {
      appState = await Sync.syncAppState(currentUser.id, appState);
      state = appState.settings;
      State.saveAppState(appState);
      
      // Load groups
      userGroups = await Groups.getMyGroups(currentUser.id);
      
      showToast(`Welcome back!`, "success");
    } catch (err) {
      console.error("Sync failed on login:", err);
      showToast("Sync failed - using local data", "error");
    }
    
    // Show calendar if we're on login view
    if (view === "login") {
      setView("today");
    }
    render();
  } else {
    currentUser = null;
    userGroups = [];
    // Stay in local-only mode, don't force login
    render();
  }
});

// Initialize auth state
(async () => {
  try {
    const session = await Auth.getSession();
    if (session) {
      currentUser = session.user;
      userGroups = await Groups.getMyGroups(currentUser.id);
    }
  } catch (err) {
    console.log("No active session");
  }
})();

// ============================================================================
// VIEW MANAGEMENT
// ============================================================================

const tabs = [
  { id: "today", label: "Today" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "events", label: "Events" },
  { id: "groups", label: "Groups", authOnly: true },
  { id: "settings", label: "Settings" },
  { id: "about", label: "About" },
  { id: "login", label: "Login", hideWhenAuth: true }
];

const tabsEl = document.getElementById("tabs");
const controlEl = document.getElementById("control");
const mainEl = document.getElementById("main");
const viewTitleEl = document.getElementById("viewTitle");

let view = "today";
let focusDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let focusMonthIndex = null;
let focusYearLabel = null;

function setView(id) {
  view = id;
  renderTabs();
  render();
}

function renderTabs() {
  tabsEl.innerHTML = "";
  tabs.forEach(t => {
    // Skip auth-only tabs if not logged in
    if (t.authOnly && !currentUser) return;
    // Skip login tab if logged in
    if (t.hideWhenAuth && currentUser) return;
    
    const b = document.createElement("div");
    b.className = "tab";
    b.textContent = t.label;
    b.dataset.id = t.id;
    if (view === t.id) b.classList.add("active");
    b.onclick = () => setView(t.id);
    tabsEl.appendChild(b);
  });
  
  // Add logout button if logged in
  if (currentUser) {
    const logoutBtn = document.createElement("div");
    logoutBtn.className = "tab";
    logoutBtn.textContent = "Logout";
    logoutBtn.style.marginLeft = "auto";
    logoutBtn.style.color = "var(--muted)";
    logoutBtn.onclick = async () => {
      await Auth.signOut();
      showToast("Signed out", "info");
      setView("today");
    };
    tabsEl.appendChild(logoutBtn);
  }
}

tabs.forEach(t => {
  const b = document.createElement("div");
  b.className = "tab";
  b.textContent = t.label;
  b.dataset.id = t.id;
  b.onclick = () => setView(t.id);
  tabsEl.appendChild(b);
});

// ============================================================================
// RENDERING FUNCTIONS
// ============================================================================

function renderControl() {
  const dayNo = Cal.dayNoFromGregorian(focusDate, state);
  const dayInfo = dayNo ? Cal.monthDayFromDayNo(dayNo, state.leapStillDayEnabled) : null;
  const yLabel = Cal.yearLabelFromGregorian(focusDate, state.vernalEquinoxDate);
  const wname = Cal.weekdayName(focusDate, dayInfo);

  controlEl.innerHTML = "";

  // Gregorian date input
  const f1 = document.createElement("div");
  f1.className = "field";
  f1.innerHTML = `<label>Gregorian Date</label>
    <input type="date" id="gdate" value="${Cal.toISO(focusDate)}" />`;
  controlEl.appendChild(f1);
  f1.querySelector("#gdate").onchange = e => {
    const newDate = Cal.parseISO(e.target.value);
    if (newDate) focusDate = newDate;
    render();
  };

  // Output section
  const out = document.createElement("div");
  out.className = "field";
  out.innerHTML = `<label>77EZ Output</label>
    <div style="font-size:18px; font-weight:650; margin-top:4px" id="outMain">—</div>
    <div class="mini" id="outSub"></div>`;
  controlEl.appendChild(out);

  const outMain = out.querySelector("#outMain");
  const outSub = out.querySelector("#outSub");

  if (!dayNo) {
    outMain.textContent = "Set anchors";
    outSub.textContent = "";
  } else if (dayInfo && dayInfo.special) {
    outMain.textContent = dayInfo.special;
    outSub.innerHTML = `<strong>Year:</strong> ${yLabel} | Outside weeks`;
  } else {
    const season = Cal.seasonFromMonthIndex(dayInfo.monthIndex);
    outMain.textContent = `${dayInfo.month} ${dayInfo.day}`;
    outSub.innerHTML = `<strong>Day#:</strong> ${dayNo} | <strong>Week:</strong> ${wname} | <strong>Season:</strong> ${season}`;
  }

  // Day jump input
  const fDay = document.createElement("div");
  fDay.className = "field";
  fDay.innerHTML = `<label>Jump to Day# (1–366)</label>
    <input type="number" id="dayJump" min="1" max="366" placeholder="e.g., 341" value="${dayNo || ''}" />`;
  controlEl.appendChild(fDay);
  fDay.querySelector("#dayJump").onchange = e => {
    const dayNo = Number(e.target.value);
    if (dayNo >= 1 && dayNo <= 366) {
      const result = Cal.findGregorianForDayNoNear(dayNo, String(yLabel), focusDate, state);
      if (result && result.date) {
        focusDate = result.date;
      }
      render();
    }
  };

  // Actions
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <button class="btn primary" id="addEvt">+ Event</button>
    <button class="btn" id="jumpMonth">Open Month</button>
  `;
  controlEl.appendChild(row);

  row.querySelector("#addEvt").onclick = () => {
    setView("events");
    setTimeout(() => {
      const typeSelect = document.getElementById("eType");
      if (typeSelect) typeSelect.value = "gregorian";
      const dateInput = document.getElementById("eDate");
      if (dateInput) dateInput.value = Cal.toISO(focusDate);
    }, 80);
  };

  row.querySelector("#jumpMonth").onclick = () => {
    focusMonthIndex = dayInfo ? dayInfo.monthIndex : 0;
    focusYearLabel = yLabel;
    setView("month");
  };
}

function renderToday() {
  viewTitleEl.textContent = "Today";
  const dayNo = Cal.dayNoFromGregorian(focusDate, state);
  const dayInfo = dayNo ? Cal.monthDayFromDayNo(dayNo, state.leapStillDayEnabled) : null;
  const yLabel = Cal.yearLabelFromGregorian(focusDate, state.vernalEquinoxDate);
  const wname = Cal.weekdayName(focusDate, dayInfo);

  const wrap = document.createElement("div");
  wrap.className = "hero";

  const big = document.createElement("div");
  big.className = "bigdate";
  const mdy = document.createElement("div");
  mdy.className = "mdy";

  if (!dayNo) {
    mdy.textContent = "Set anchors in Settings.";
  } else if (dayInfo && dayInfo.special) {
    mdy.textContent = dayInfo.special;
  } else {
    mdy.textContent = `${dayInfo.month} ${dayInfo.day}`;
  }

  const yr = document.createElement("div");
  yr.className = "year";
  yr.textContent = `Year ${yLabel}`;

  big.appendChild(mdy);
  big.appendChild(yr);

  const meta = document.createElement("div");
  meta.className = "meta";

  const p1 = document.createElement("div");
  p1.className = "pill";
  p1.innerHTML = `<span class="dot"></span> <span>Day#</span> <span style="opacity:.9">${dayNo ?? "—"}</span>`;

  const p2 = document.createElement("div");
  p2.className = "pill";
  p2.innerHTML = `<span class="dot2"></span> <span>Week</span> <span style="opacity:.9">${(dayInfo && dayInfo.special) ? "—" : wname}</span>`;

  const p3 = document.createElement("div");
  p3.className = "pill";
  const season = dayInfo && dayInfo.monthIndex != null ? Cal.seasonFromMonthIndex(dayInfo.monthIndex) : "—";
  p3.innerHTML = `<span class="dot3"></span> <span>Season</span> <span style="opacity:.9">${(dayInfo && dayInfo.special) ? "Still" : season}</span>`;

  const p4 = document.createElement("div");
  p4.className = "pill";
  p4.innerHTML = `<span class="dot4"></span> <span>Anchors</span> <span style="opacity:.9">${state.winterSolsticeDate}</span>`;

  meta.appendChild(p1);
  meta.appendChild(p2);
  meta.appendChild(p3);
  meta.appendChild(p4);

  wrap.appendChild(big);
  wrap.appendChild(meta);

  const list = document.createElement("div");
  list.className = "body";
  list.style.paddingTop = "0";

  const dayEvents = Storage.getEventsForGregorian(focusDate, appState);
  const dayHolidays = Holidays.holidaysForGregorianDate(focusDate, appState.holidayPrefs, appState.customHolidays);

  if (dayHolidays.length) {
    const hDiv = document.createElement("div");
    hDiv.style.padding = "12px";
    hDiv.innerHTML = "<strong style='color: var(--gold)'>🏆 Holidays</strong>";
    dayHolidays.forEach(h => {
      hDiv.innerHTML += `<div class="mini" style="margin-top:4px">${h.name}</div>`;
    });
    list.appendChild(hDiv);
  }

  if (dayEvents.length) {
    dayEvents.forEach(e => list.appendChild(renderEventCard(e, focusDate)));
  } else {
    const empty = document.createElement("div");
    empty.className = "mini";
    empty.style.padding = "12px";
    empty.textContent = "No events.";
    list.appendChild(empty);
  }

  mainEl.innerHTML = "";
  mainEl.appendChild(wrap);
  mainEl.appendChild(list);
}

function renderMonth() {
  viewTitleEl.textContent = "Month";
  const dayNo = Cal.dayNoFromGregorian(focusDate, state);
  const yLabel = Cal.yearLabelFromGregorian(focusDate, state.vernalEquinoxDate);
  const dayInfo = dayNo ? Cal.monthDayFromDayNo(dayNo, state.leapStillDayEnabled) : null;

  if (focusMonthIndex == null) focusMonthIndex = dayInfo ? dayInfo.monthIndex : 0;
  if (focusYearLabel == null) focusYearLabel = yLabel;

  const top = document.createElement("div");
  top.className = "body";
  top.style.paddingBottom = "6px";

  const selRow = document.createElement("div");
  selRow.className = "row";

  const fM = document.createElement("div");
  fM.className = "field";
  fM.innerHTML = `<label>Month</label><select id="mSel"></select>`;
  const mSel = fM.querySelector("#mSel");
  Cal.MONTHS.forEach((m, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = m;
    if (i === focusMonthIndex) o.selected = true;
    mSel.appendChild(o);
  });
  mSel.onchange = e => {
    focusMonthIndex = Number(e.target.value);
    render();
  };

  const fY = document.createElement("div");
  fY.className = "field";
  fY.innerHTML = `<label>Year Label</label><input id="ySel" type="number" value="${focusYearLabel}" />`;
  const ySel = fY.querySelector("#ySel");
  ySel.onchange = e => {
    focusYearLabel = Number(e.target.value);
    render();
  };

  selRow.appendChild(fM);
  selRow.appendChild(fY);
  top.appendChild(selRow);

  const gridWrap = document.createElement("div");
  gridWrap.className = "body";
  gridWrap.style.paddingTop = "6px";

  const grid = document.createElement("div");
  grid.className = "month";
  grid.style.maxWidth = "560px";
  grid.style.margin = "0 auto";

  const mhd = document.createElement("div");
  mhd.className = "mhd";
  mhd.innerHTML = `<div class="mname">${Cal.MONTHS[focusMonthIndex]}</div><div class="mcap">28 days • 4 weeks</div>`;

  const mgrid = document.createElement("div");
  mgrid.className = "mgrid";

  const startDayNo = focusMonthIndex * 28 + 1;
  for (let d = 1; d <= 28; d++) {
    const cellDayNo = startDayNo + d - 1;
    const dayInfo = Cal.monthDayFromDayNo(cellDayNo, state.leapStillDayEnabled);
    const result = Cal.findGregorianForDayNoNear(cellDayNo, String(focusYearLabel), now, state);
    const gDate = result && result.date ? result.date : null;

    const dcell = document.createElement("div");
    dcell.className = "dcell";

    const holidays = Holidays.holidaysForDayNo(cellDayNo, appState.holidayPrefs, appState.customHolidays);
    if (holidays.length) dcell.classList.add("has-holiday");

    const isToday =
      gDate &&
      gDate.toDateString() === new Date().toDateString();
    if (isToday) dcell.classList.add("today");

    dcell.innerHTML = `<div class="dtop">${d}</div>`;
    if (holidays.length) {
      dcell.innerHTML += `<div class="hdot"></div>`;
    }

    mgrid.appendChild(dcell);
  }

  grid.appendChild(mhd);
  grid.appendChild(mgrid);
  gridWrap.appendChild(grid);

  mainEl.innerHTML = "";
  mainEl.appendChild(top);
  mainEl.appendChild(gridWrap);
}

function renderYear() {
  viewTitleEl.textContent = "Year";
  const dayNo = Cal.dayNoFromGregorian(focusDate, state);
  const yLabel = Cal.yearLabelFromGregorian(focusDate, state.vernalEquinoxDate);

  const top = document.createElement("div");
  top.className = "body";
  top.innerHTML = `<div class="field" style="margin-bottom:0">
    <label>Year Label</label>
    <input type="number" id="yBig" value="${focusYearLabel ?? yLabel}" style="font-size:16px; font-weight:650" />
  </div>`;
  top.querySelector("#yBig").onchange = e => {
    focusYearLabel = Number(e.target.value);
    render();
  };

  const grid13 = document.createElement("div");
  grid13.className = "grid13";

  const yrLbl = focusYearLabel == null ? yLabel : focusYearLabel;

  Cal.MONTHS.forEach((m, mi) => {
    const box = document.createElement("div");
    box.className = "month";

    const hd = document.createElement("div");
    hd.className = "mhd";
    hd.innerHTML = `<div class="mname">${m}</div><div class="mcap">28 days</div>`;

    const body = document.createElement("div");
    body.style.padding = "6px";

    const ygrid = document.createElement("div");
    ygrid.className = "ygrid";

    for (let d = 1; d <= 28; d++) {
      const cellDayNo = mi * 28 + d;
      const dayInfo = Cal.monthDayFromDayNo(cellDayNo, state.leapStillDayEnabled);
      const result = Cal.findGregorianForDayNoNear(
        cellDayNo,
        String(yrLbl),
        now,
        state
      );
      const gDate = result && result.date ? result.date : null;
      const holidays = Holidays.holidaysForDayNo(cellDayNo, appState.holidayPrefs, appState.customHolidays);

      const dcell = document.createElement("div");
      dcell.className = "dcell";
      if (holidays.length) dcell.classList.add("has-holiday");

      const isToday =
        gDate &&
        gDate.toDateString() === new Date().toDateString();
      if (isToday) dcell.classList.add("today");

      dcell.innerHTML = `<div class="dtop">${d}</div>`;
      if (holidays.length) {
        dcell.innerHTML += `<div class="hdot"></div>`;
      }

      ygrid.appendChild(dcell);
    }

    body.appendChild(ygrid);
    box.appendChild(hd);
    box.appendChild(body);
    grid13.appendChild(box);
  });

  const sbox = document.createElement("div");
  sbox.className = "month";
  const sHd = document.createElement("div");
  sHd.className = "mhd";
  sHd.innerHTML = `<div class="mname">STILL</div><div class="mcap">${state.leapStillDayEnabled ? "#365–366" : "#365"}</div>`;

  const sBody = document.createElement("div");
  sBody.style.padding = "10px";

  const stillHolidays = Holidays.holidaysForDayNo(365, appState.holidayPrefs, appState.customHolidays);
  sBody.innerHTML = `<div style="font-size:13px; font-weight:650">Still Day</div>
    <div class="mini" style="margin-top:6px">Day #365 – outside weeks and months.</div>`;

  if (stillHolidays.length) {
    sBody.innerHTML += `<div class="mini" style="margin-top:6px"><strong>🏆</strong> ${stillHolidays.map(h => h.name).join(", ")}</div>`;
  }

  sbox.appendChild(sHd);
  sbox.appendChild(sBody);
  grid13.appendChild(sbox);

  mainEl.innerHTML = "";
  mainEl.appendChild(top);
  mainEl.appendChild(grid13);
}

function renderEvents() {
  viewTitleEl.textContent = "Events";
  const wrap = document.createElement("div");
  wrap.className = "body";

  const form = document.createElement("div");
  form.className = "card";
  form.style.boxShadow = "none";
  form.style.borderRadius = "16px";
  form.innerHTML = `
    <div class="body">
      <div class="field">
        <label>Event Name</label>
        <input type="text" id="eName" placeholder="My event..." />
      </div>
      <div class="field">
        <label>Type</label>
        <select id="eType">
          <option value="gregorian">Gregorian Date (One-time)</option>
          <option value="77ez">77EZ Day# (Recurring)</option>
        </select>
      </div>
      <div id="eRow2"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn primary" id="eAdd">Add Event</button>
        <button class="btn danger" id="eClear">Clear All</button>
      </div>
    </div>
  `;
  wrap.appendChild(form);

  const row2 = form.querySelector("#eRow2");
  const typeSel = form.querySelector("#eType");

  function renderRow2() {
    row2.innerHTML = "";
    if (typeSel.value === "gregorian") {
      row2.innerHTML = `
        <div class="field">
          <label>Date</label>
          <input type="date" id="eDate" value="${Cal.toISO(focusDate)}" />
        </div>
      `;
    } else {
      row2.innerHTML = `
        <div class="field">
          <label>Day# (1–366)</label>
          <input type="number" id="eDayNo" min="1" max="366" placeholder="e.g., 1" />
        </div>
      `;
    }
  }

  typeSel.onchange = renderRow2;
  renderRow2();

  form.querySelector("#eAdd").onclick = () => {
    const name = form.querySelector("#eName").value.trim();
    if (!name) {
      alert("Enter event name");
      return;
    }

    if (typeSel.value === "gregorian") {
      const dateStr = form.querySelector("#eDate").value;
      if (!dateStr) {
        alert("Select date");
        return;
      }
      const e = Storage.createEvent(name, "gregorian", {
        gregorianDate: dateStr
      });
      const newEvents = [...appState.events, e];
      setState({ events: newEvents });
      form.querySelector("#eName").value = "";
      showToast("Event added", "success");
    } else {
      const dayNo = Number(form.querySelector("#eDayNo").value);
      if (!dayNo || dayNo < 1 || dayNo > 366) {
        showToast("Enter valid day# (1–366)", "error");
        return;
      }
      const e = Storage.createEvent(name, "77ez", { dayNo, recurring: true });
      const newEvents = [...appState.events, e];
      setState({ events: newEvents });
      form.querySelector("#eName").value = "";
      showToast("Event added", "success");
    }
  };

  form.querySelector("#eClear").onclick = () => {
    if (confirm("Delete all events?")) {
      setState({ events: [] });
      showToast("All events deleted", "info");
    }
  };

  const list = document.createElement("div");
  list.className = "list";
  list.style.padding = "16px";
  list.style.paddingTop = "0";

  const eventsSorted = [...appState.events].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );

  if (!eventsSorted.length) {
    const empty = document.createElement("div");
    empty.className = "mini";
    empty.textContent = "No events yet.";
    list.appendChild(empty);
  } else {
    eventsSorted.forEach(e => {
      const item = document.createElement("div");
      item.className = "evt";
      const nextOcc = Storage.bestNextOccurrenceDate(e, new Date());
      const nextStr =
        nextOcc && e.type === "gregorian"
          ? Cal.toISO(nextOcc)
          : e.type === "77ez"
            ? `Day #${e.dayNo}`
            : "—";
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px">
          <div style="flex:1; cursor:pointer" class="evt-clickable">
            <div class="evt .name">${escapeHtml(e.name)}</div>
            <div class="sub">${e.type === "gregorian" ? "Gregorian" : "77EZ"} • ${e.recurring ? "Recurring" : "One-time"} • ${nextStr}</div>
          </div>
          <div style="display:flex; gap:4px">
            <button class="btn" data-action="edit" data-evt-id="${e.id}" style="font-size:11px; padding:6px 8px">Edit</button>
            <button class="btn" data-action="delete" data-evt-id="${e.id}" style="font-size:11px; padding:6px 8px">Delete</button>
          </div>
        </div>
      `;
      
      // Edit button
      item.querySelector("[data-action='edit']").onclick = () => {
        openEventEditor(e);
      };
      
      // Delete button
      item.querySelector("[data-action='delete']").onclick = () => {
        if (confirm("Delete this event?")) {
          const newEvents = appState.events.filter(evt => evt.id !== e.id);
          setState({ events: newEvents });
          showToast("Event deleted", "info");
        }
      };
      
      // Click anywhere on event to edit
      item.querySelector(".evt-clickable").onclick = () => {
        openEventEditor(e);
      };
      
      list.appendChild(item);
    });
  }

  mainEl.innerHTML = "";
  mainEl.appendChild(wrap);
  mainEl.appendChild(list);
}

function openEventEditor(event) {
  // Create modal overlay
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  `;
  
  const modal = document.createElement("div");
  modal.className = "card";
  modal.style.cssText = `
    max-width: 500px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
  `;
  
  modal.innerHTML = `
    <div class="body">
      <h3 style="margin:0 0 16px; font-size:16px">Edit Event</h3>
      <div class="field">
        <label>Event Name</label>
        <input type="text" id="editName" value="${escapeHtml(event.name)}" />
      </div>
      <div class="field">
        <label>Type</label>
        <select id="editType" ${event.type ? '' : 'disabled'}>
          <option value="gregorian" ${event.type === "gregorian" ? "selected" : ""}>Gregorian Date (One-time)</option>
          <option value="77ez" ${event.type === "77ez" ? "selected" : ""}>77EZ Day# (Recurring)</option>
        </select>
        <div class="mini" style="margin-top:4px">Note: Changing type will reset date/day#</div>
      </div>
      <div id="editRow2"></div>
      <div class="row" style="margin-top:16px">
        <button class="btn primary" id="editSave">Save Changes</button>
        <button class="btn" id="editCancel">Cancel</button>
      </div>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  const row2 = modal.querySelector("#editRow2");
  const typeSel = modal.querySelector("#editType");
  
  function renderEditRow2() {
    row2.innerHTML = "";
    if (typeSel.value === "gregorian") {
      const dateVal = event.type === "gregorian" && event.gregorianDate ? event.gregorianDate : Cal.toISO(focusDate);
      row2.innerHTML = `
        <div class="field">
          <label>Date</label>
          <input type="date" id="editDate" value="${dateVal}" />
        </div>
      `;
    } else {
      const dayNoVal = event.type === "77ez" && event.dayNo ? event.dayNo : 1;
      row2.innerHTML = `
        <div class="field">
          <label>Day# (1–366)</label>
          <input type="number" id="editDayNo" min="1" max="366" value="${dayNoVal}" />
        </div>
      `;
    }
  }
  
  typeSel.onchange = renderEditRow2;
  renderEditRow2();
  
  // Save button
  modal.querySelector("#editSave").onclick = () => {
    const name = modal.querySelector("#editName").value.trim();
    if (!name) {
      showToast("Enter event name", "error");
      return;
    }
    
    const updatedEvent = { ...event, name };
    
    if (typeSel.value === "gregorian") {
      const dateStr = modal.querySelector("#editDate").value;
      if (!dateStr) {
        showToast("Select date", "error");
        return;
      }
      updatedEvent.type = "gregorian";
      updatedEvent.gregorianDate = dateStr;
      updatedEvent.recurring = false;
      delete updatedEvent.dayNo;
    } else {
      const dayNo = Number(modal.querySelector("#editDayNo").value);
      if (!dayNo || dayNo < 1 || dayNo > 366) {
        showToast("Enter valid day# (1–366)", "error");
        return;
      }
      updatedEvent.type = "77ez";
      updatedEvent.dayNo = dayNo;
      updatedEvent.recurring = true;
      delete updatedEvent.gregorianDate;
    }
    
    // Update event in appState
    const newEvents = appState.events.map(evt => 
      evt.id === event.id ? updatedEvent : evt
    );
    setState({ events: newEvents });
    showToast("Event updated", "success");
    overlay.remove();
  };
  
  // Cancel button
  modal.querySelector("#editCancel").onclick = () => {
    overlay.remove();
  };
  
  // Click overlay to close
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  };
}

function renderAbout() {
  viewTitleEl.textContent = "About";
  const wrap = document.createElement("div");
  wrap.className = "body";
  wrap.innerHTML = `
    <h2 style="margin:0 0 12px; font-size:18px">About Sol Calendar</h2>
    <p style="margin:0 0 12px; line-height:1.6">
      Sol Calendar (77EZ) is a luxurious, futuristic web app implementing a 13×28 solar calendar system.
    </p>
    <h3 style="margin:18px 0 8px; font-size:14px">Key Features</h3>
    <ul style="margin:0; padding-left:18px">
      <li>13 months × 28 days + 1 Still Day = 364/365 days</li>
      <li>Astronomical anchors (solstices & equinoxes)</li>
      <li>Gregorian ↔ 77EZ date conversion</li>
      <li>Event management & holidays</li>
      <li>Offline-first, localStorage-backed</li>
      <li>Mobile-responsive design</li>
    </ul>
    <h3 style="margin:18px 0 8px; font-size:14px">Calendar Structure</h3>
    <ul style="margin:0; padding-left:18px">
      <li>Months: April through March (13 total)</li>
      <li>Each month: 28 days</li>
      <li>Each week: 7 days (Sun–Sat)</li>
      <li>Still Day: Day #365 (outside weeks/months)</li>
    </ul>
    <p style="margin:18px 0 0; font-size:12px; color:var(--muted)">
      Built with pure HTML, CSS, and ES6 modules. See Settings for more.
    </p>
  `;
  mainEl.innerHTML = "";
  mainEl.appendChild(wrap);
}

function renderSettings() {
  viewTitleEl.textContent = "Settings";
  const wrap = document.createElement("div");
  wrap.className = "body";

  wrap.innerHTML = `
    <div class="split">
      <div>
        <h3 style="margin:0 0 12px; font-size:14px">Astronomical Anchors</h3>
        <div class="field">
          <label>Winter Solstice (2024)</label>
          <input type="date" id="ws" value="${state.winterSolsticeDate}" />
        </div>
        <div class="field">
          <label>Vernal Equinox (2024)</label>
          <input type="date" id="ve" value="${state.vernalEquinoxDate}" />
        </div>
        <div class="field">
          <label>Winter Solstice Day#</label>
          <input type="number" id="wsn" value="${state.winterSolsticeDayNo}" />
        </div>
        <div class="field">
          <label>Leap Still Day</label>
          <select id="leap">
            <option value="true" ${state.leapStillDayEnabled ? "selected" : ""}>Enabled (366 days)</option>
            <option value="false" ${!state.leapStillDayEnabled ? "selected" : ""}>Disabled (365 days)</option>
          </select>
        </div>
      </div>
      <div>
        <h3 style="margin:0 0 12px; font-size:14px">Data</h3>
        <div class="field">
          <button class="btn primary" id="btnExport" style="width:100%">📥 Export</button>
        </div>
        <div class="field">
          <button class="btn primary" id="btnImport" style="width:100%">📤 Import</button>
          <input type="file" id="importFile" accept=".json" style="display:none" />
        </div>
        <div class="field">
          <button class="btn danger" id="reset" style="width:100%">⚠️ Reset All</button>
        </div>
      </div>
    </div>
    <div style="margin-top:24px; padding-top:18px; border-top:1px solid var(--line)">
      <h3 style="margin:0 0 12px; font-size:14px">Holiday Packs</h3>
      <div id="holidayPacks"></div>
    </div>
  `;

  // Save Settings button (must be appended to wrap)
  const saveRow = document.createElement("div");
  saveRow.className = "field";
  saveRow.style.marginTop = "24px";
  saveRow.style.paddingTop = "18px";
  saveRow.style.borderTop = "1px solid var(--line)";
  
  const btnSave = document.createElement("button");
  btnSave.className = "btn primary";
  btnSave.textContent = "💾 Save Settings";
  btnSave.style.width = "100%";
  btnSave.onclick = () => {
    const wsVal = wrap.querySelector("#ws").value;
    const veVal = wrap.querySelector("#ve").value;
    const wsnVal = Number(wrap.querySelector("#wsn").value);
    const leapVal = wrap.querySelector("#leap").value === "true";

    // Validation
    const errors = [];
    if (!wsVal || !Cal.parseISO(wsVal)) errors.push("Invalid Winter Solstice date");
    if (!veVal || !Cal.parseISO(veVal)) errors.push("Invalid Vernal Equinox date");
    if (!wsnVal || wsnVal < 1 || wsnVal > 366) errors.push("Winter Solstice Day# must be 1-366");

    if (errors.length > 0) {
      showToast(errors.join("; "), "error");
      return;
    }

    // Update state
    setState({
      settings: {
        winterSolsticeDate: wsVal,
        vernalEquinoxDate: veVal,
        winterSolsticeDayNo: wsnVal,
        leapStillDayEnabled: leapVal
      }
    });
    
    showToast("Settings saved successfully!", "success");
  };
  
  saveRow.appendChild(btnSave);
  wrap.insertBefore(saveRow, wrap.querySelector("#holidayPacks").parentElement);

  wrap.querySelector("#reset").onclick = () => {
    if (confirm("Reset ALL settings and events? This cannot be undone.")) {
      localStorage.clear();
      appState = State.loadAppState();
      state = appState.settings;
      State.saveAppState(appState);
      showToast("All data reset", "info");
      setView("today");
    }
  };

  wrap.querySelector("#btnExport").onclick = () => {
    const data = State.exportAppState(appState);
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sol-calendar-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Data exported", "success");
  };

  wrap.querySelector("#btnImport").onclick = () => {
    wrap.querySelector("#importFile").click();
  };

  const importFile = wrap.querySelector("#importFile");
  importFile.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      appState = State.importAppState(data);
      state = appState.settings;
      State.saveAppState(appState);
      render();
      showToast("Data imported successfully!", "success");
    } catch (err) {
      showToast("Import failed: " + err.message, "error");
    }
  };

  // Holiday packs
  const packsEl = wrap.querySelector("#holidayPacks");
  const prefs = appState.holidayPrefs;

  Holidays.HOLIDAY_PACKS.forEach(pack => {
    const packDiv = document.createElement("div");
    packDiv.style.marginBottom = "12px";
    packDiv.style.padding = "10px";
    packDiv.style.background = "rgba(255,255,255,.02)";
    packDiv.style.borderRadius = "8px";
    packDiv.style.border = "1px solid var(--line)";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.gap = "8px";
    header.style.alignItems = "center";
    header.style.marginBottom = "6px";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = !!prefs[pack.id];
    toggle.disabled = pack.locked;
    toggle.onchange = () => {
      const newPrefs = { ...appState.holidayPrefs };
      newPrefs[pack.id] = toggle.checked;
      setState({ holidayPrefs: newPrefs });
    };

    const label = document.createElement("label");
    label.textContent = pack.name;
    label.style.fontWeight = "600";
    label.style.cursor = "pointer";
    label.style.flex = "1";
    label.onclick = () => {
      if (!pack.locked) {
        toggle.checked = !toggle.checked;
        const newPrefs = { ...appState.holidayPrefs };
        newPrefs[pack.id] = toggle.checked;
        setState({ holidayPrefs: newPrefs });
      }
    };

    const badge = document.createElement("span");
    badge.className = "tag";
    badge.textContent = pack.type;

    header.appendChild(toggle);
    header.appendChild(label);
    header.appendChild(badge);
    packDiv.appendChild(header);

    const desc = document.createElement("div");
    desc.className = "mini";
    desc.textContent = pack.desc;
    packDiv.appendChild(desc);

    if (pack.items && pack.items.length > 0) {
      const itemsList = document.createElement("div");
      itemsList.style.marginTop = "6px";
      itemsList.style.fontSize = "11px";
      itemsList.style.color = "var(--muted)";
      itemsList.textContent = pack.items.map(i => i.name).join(", ");
      packDiv.appendChild(itemsList);
    }

    packsEl.appendChild(packDiv);
  });

  mainEl.innerHTML = "";
  mainEl.appendChild(wrap);
}

function renderEventCard(e, gDate) {
  const card = document.createElement("div");
  card.className = "evt";
  card.style.margin = "10px 0 0";
  card.innerHTML = `
    <div class="name">${escapeHtml(e.name)}</div>
    <div class="sub">${e.type === "gregorian" ? "Gregorian date" : "77EZ day# anchored"} • ${e.recurring ? "Recurring" : "One-time"}</div>
  `;
  return card;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function render() {
  renderTabs(); // Update tabs based on auth state
  renderControl();
  if (view === "today") return renderToday();
  if (view === "month") return renderMonth();
  if (view === "year") return renderYear();
  if (view === "events") return renderEvents();
  if (view === "groups") return renderGroups();
  if (view === "settings") return renderSettings();
  if (view === "about") return renderAbout();
  if (view === "login") return renderLogin();
}

// ============================================================================
// LOGIN VIEW
// ============================================================================

function renderLogin() {
  viewTitleEl.textContent = "Login";
  const wrap = document.createElement("div");
  wrap.className = "body";
  wrap.style.maxWidth = "400px";
  wrap.style.margin = "0 auto";
  wrap.style.paddingTop = "40px";
  
  if (!authEnabled) {
    wrap.innerHTML = `
      <h2 style="margin:0 0 16px; font-size:18px">Cloud Sync Setup</h2>
      <p style="margin:0 0 16px; line-height:1.6; color:var(--muted)">
        To enable cloud sync and sharing, configure your Supabase credentials:
      </p>
      <div class="field">
        <label>Supabase URL</label>
        <input type="text" id="supabaseUrl" placeholder="https://xxx.supabase.co" value="${SUPABASE_URL}" />
      </div>
      <div class="field">
        <label>Supabase Anon Key</label>
        <input type="text" id="supabaseKey" placeholder="eyJh..." value="${SUPABASE_ANON_KEY}" />
      </div>
      <button class="btn primary" id="saveSupabase" style="width:100%">Save & Reload</button>
      <p style="margin:16px 0 0; font-size:12px; color:var(--muted)">
        Need setup help? See <a href="docs/SETUP_GUIDE.md" style="color:var(--gold)">SETUP_GUIDE.md</a>
      </p>
    `;
    
    wrap.querySelector("#saveSupabase").onclick = () => {
      const url = wrap.querySelector("#supabaseUrl").value.trim();
      const key = wrap.querySelector("#supabaseKey").value.trim();
      
      if (!url || !key) {
        showToast("Enter both URL and Key", "error");
        return;
      }
      
      localStorage.setItem('supabase_url', url);
      localStorage.setItem('supabase_anon_key', key);
      showToast("Saved! Reloading...", "success");
      setTimeout(() => window.location.reload(), 1000);
    };
  } else {
    wrap.innerHTML = `
      <h2 style="margin:0 0 16px; font-size:18px">Sol Calendar</h2>
      <p style="margin:0 0 24px; line-height:1.6; color:var(--muted)">
        Sign in to sync your calendar across devices and share with groups.
      </p>
      
      <div id="loginTabs" style="display:flex; gap:8px; margin-bottom:16px">
        <button class="btn" id="tabMagic" style="flex:1">Magic Link</button>
        <button class="btn" id="tabPassword" style="flex:1">Password</button>
      </div>
      
      <div id="magicLogin">
        <div class="field">
          <label>Email</label>
          <input type="email" id="emailMagic" placeholder="you@example.com" />
        </div>
        <button class="btn primary" id="sendMagic" style="width:100%">Send Magic Link</button>
      </div>
      
      <div id="passwordLogin" style="display:none">
        <div class="field">
          <label>Email</label>
          <input type="email" id="emailPass" placeholder="you@example.com" />
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" id="password" placeholder="••••••••" />
        </div>
        <div style="display:flex; gap:8px">
          <button class="btn primary" id="signIn" style="flex:1">Sign In</button>
          <button class="btn" id="signUp" style="flex:1">Sign Up</button>
        </div>
      </div>
      
      <p style="margin:24px 0 0; text-align:center; font-size:12px; color:var(--muted)">
        Or <span style="color:var(--gold); cursor:pointer" id="skipLogin">continue without login</span>
      </p>
    `;
    
    const magicDiv = wrap.querySelector("#magicLogin");
    const passDiv = wrap.querySelector("#passwordLogin");
    
    wrap.querySelector("#tabMagic").onclick = () => {
      magicDiv.style.display = "block";
      passDiv.style.display = "none";
      wrap.querySelector("#tabMagic").classList.add("primary");
      wrap.querySelector("#tabPassword").classList.remove("primary");
    };
    
    wrap.querySelector("#tabPassword").onclick = () => {
      magicDiv.style.display = "none";
      passDiv.style.display = "block";
      wrap.querySelector("#tabPassword").classList.add("primary");
      wrap.querySelector("#tabMagic").classList.remove("primary");
    };
    
    wrap.querySelector("#sendMagic").onclick = async () => {
      const email = wrap.querySelector("#emailMagic").value.trim();
      if (!email) {
        showToast("Enter email", "error");
        return;
      }
      
      const { error } = await Auth.signInWithEmail(email);
      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Check your email for login link!", "success");
      }
    };
    
    wrap.querySelector("#signIn").onclick = async () => {
      const email = wrap.querySelector("#emailPass").value.trim();
      const password = wrap.querySelector("#password").value;
      
      if (!email || !password) {
        showToast("Enter email and password", "error");
        return;
      }
      
      const { error } = await Auth.signInWithPassword(email, password);
      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Signed in!", "success");
        setView("today");
      }
    };
    
    wrap.querySelector("#signUp").onclick = async () => {
      const email = wrap.querySelector("#emailPass").value.trim();
      const password = wrap.querySelector("#password").value;
      
      if (!email || !password) {
        showToast("Enter email and password", "error");
        return;
      }
      
      if (password.length < 6) {
        showToast("Password must be at least 6 characters", "error");
        return;
      }
      
      const { error } = await Auth.signUp(email, password);
      if (error) {
        showToast(error.message, "error");
      } else {
        showToast("Check your email to confirm!", "success");
      }
    };
    
    wrap.querySelector("#skipLogin").onclick = () => {
      setView("today");
    };
    
    // Default to magic link tab
    wrap.querySelector("#tabMagic").classList.add("primary");
  }
  
  controlEl.innerHTML = "";
  mainEl.innerHTML = "";
  mainEl.appendChild(wrap);
}

// ============================================================================
// GROUPS VIEW
// ============================================================================

async function renderGroups() {
  viewTitleEl.textContent = "Groups";
  
  if (!currentUser) {
    const wrap = document.createElement("div");
    wrap.className = "body";
    wrap.innerHTML = `<p>Please login to use groups.</p>`;
    mainEl.innerHTML = "";
    mainEl.appendChild(wrap);
    return;
  }
  
  const wrap = document.createElement("div");
  wrap.className = "body";
  
  // Create/Join section
  const actions = document.createElement("div");
  actions.className = "card";
  actions.style.borderRadius = "16px";
  actions.innerHTML = `
    <div class="body">
      <div class="row">
        <button class="btn primary" id="createGroup" style="flex:1">Create Group</button>
        <button class="btn" id="joinGroup" style="flex:1">Join by Code</button>
      </div>
    </div>
  `;
  wrap.appendChild(actions);
  
  actions.querySelector("#createGroup").onclick = async () => {
    const name = prompt("Group name:");
    if (!name) return;
    
    const group = await Groups.createGroup(name, currentUser.id);
    if (group) {
      showToast(`Created: ${name}`, "success");
      userGroups = await Groups.getMyGroups(currentUser.id);
      renderGroups();
    } else {
      showToast("Failed to create group", "error");
    }
  };
  
  actions.querySelector("#joinGroup").onclick = async () => {
    const code = prompt("Enter invite code:");
    if (!code) return;
    
    const success = await Groups.joinGroupByCode(code, currentUser.id);
    if (success) {
      showToast("Joined group!", "success");
      userGroups = await Groups.getMyGroups(currentUser.id);
      renderGroups();
    } else {
      showToast("Invalid code or already joined", "error");
    }
  };
  
  // Groups list
  const listWrap = document.createElement("div");
  listWrap.style.marginTop = "16px";
  
  if (userGroups.length === 0) {
    listWrap.innerHTML = `<p class="mini" style="padding:16px">No groups yet. Create one to get started!</p>`;
  } else {
    for (const group of userGroups) {
      const card = document.createElement("div");
      card.className = "card";
      card.style.marginBottom = "12px";
      card.style.borderRadius = "12px";
      
      card.innerHTML = `
        <div class="body">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <div>
              <div style="font-size:15px; font-weight:650">${escapeHtml(group.name)}</div>
              <div class="mini" style="margin-top:4px">Role: ${group.myRole} • Code: ${group.invite_code}</div>
            </div>
            <button class="btn" data-group-id="${group.id}" style="font-size:11px; padding:6px 8px">Leave</button>
          </div>
        </div>
      `;
      
      card.querySelector("button").onclick = async () => {
        if (!confirm(`Leave ${group.name}?`)) return;
        
        const success = await Groups.leaveGroup(group.id, currentUser.id);
        if (success) {
          showToast("Left group", "info");
          userGroups = await Groups.getMyGroups(currentUser.id);
          renderGroups();
        } else {
          showToast("Cannot leave (you are owner)", "error");
        }
      };
      
      listWrap.appendChild(card);
    }
  }
  
  wrap.appendChild(listWrap);
  
  controlEl.innerHTML = "";
  mainEl.innerHTML = "";
  mainEl.appendChild(wrap);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

setView("today");
render();

