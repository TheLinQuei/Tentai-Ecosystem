/**
 * Cloud Sync Module
 * Handles syncing app state with Supabase backend
 */

import { getSupabaseClient } from "./auth.js";

/**
 * Push settings to cloud
 */
export async function pushSettings(userId, appState) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        settings: appState.settings,
        holiday_prefs: appState.holidayPrefs,
        custom_holidays: appState.customHolidays,
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error("Push settings error:", error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error("Push settings exception:", err);
    return false;
  }
}

/**
 * Pull settings from cloud
 */
export async function pullSettings(userId) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No settings yet - this is OK for new users
        return null;
      }
      console.error("Pull settings error:", error);
      return null;
    }
    
    return {
      settings: data.settings || {},
      holidayPrefs: data.holiday_prefs || {},
      customHolidays: data.custom_holidays || []
    };
  } catch (err) {
    console.error("Pull settings exception:", err);
    return null;
  }
}

/**
 * Push single event to cloud
 */
export async function pushEvent(userId, event) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('user_events')
      .upsert({
        id: event.id,
        user_id: userId,
        name: event.name,
        type: event.type,
        gregorian_date: event.gregorianDate || null,
        day_no: event.dayNo || null,
        recurring: event.recurring || false,
        created_at: event.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error("Push event error:", error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error("Push event exception:", err);
    return false;
  }
}

/**
 * Pull all events from cloud
 */
export async function pullEvents(userId) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  
  try {
    const { data, error } = await supabase
      .from('user_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Pull events error:", error);
      return [];
    }
    
    return (data || []).map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      gregorianDate: e.gregorian_date,
      dayNo: e.day_no,
      recurring: e.recurring,
      createdAt: e.created_at,
      updatedAt: e.updated_at
    }));
  } catch (err) {
    console.error("Pull events exception:", err);
    return [];
  }
}

/**
 * Delete event from cloud
 */
export async function deleteEventRemote(userId, eventId) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('user_events')
      .delete()
      .eq('id', eventId)
      .eq('user_id', userId);
    
    if (error) {
      console.error("Delete event error:", error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error("Delete event exception:", err);
    return false;
  }
}

/**
 * Full sync: merge local and cloud data
 */
export async function syncAppState(userId, localState) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.log("Sync disabled - auth not configured");
    return localState;
  }
  
  try {
    // Pull cloud data
    const cloudSettings = await pullSettings(userId);
    const cloudEvents = await pullEvents(userId);
    
    // Merge strategy: cloud wins on first login, then track modified timestamps
    let mergedState = { ...localState };
    
    // If cloud has settings and local is default, use cloud
    if (cloudSettings) {
      mergedState.settings = { ...mergedState.settings, ...cloudSettings.settings };
      mergedState.holidayPrefs = cloudSettings.holidayPrefs;
      mergedState.customHolidays = cloudSettings.customHolidays;
    }
    
    // Merge events by ID (cloud + local, deduplicated)
    const eventMap = new Map();
    
    // Add cloud events
    cloudEvents.forEach(e => eventMap.set(e.id, e));
    
    // Add/update with local events
    localState.events.forEach(e => {
      const existing = eventMap.get(e.id);
      if (!existing || (e.updatedAt && e.updatedAt > existing.updatedAt)) {
        eventMap.set(e.id, e);
      }
    });
    
    mergedState.events = Array.from(eventMap.values());
    
    // Push merged state back to cloud
    await pushSettings(userId, mergedState);
    
    // Push any new local events
    for (const event of mergedState.events) {
      if (!cloudEvents.find(ce => ce.id === event.id)) {
        await pushEvent(userId, event);
      }
    }
    
    console.log("Sync complete:", {
      cloudSettings: !!cloudSettings,
      cloudEvents: cloudEvents.length,
      mergedEvents: mergedState.events.length
    });
    
    return mergedState;
  } catch (err) {
    console.error("Sync exception:", err);
    return localState;
  }
}

/**
 * Push a single state change to cloud (called after setState)
 */
export async function pushStateChange(userId, patch) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return false;
  
  try {
    // If settings changed, push settings
    if (patch.settings || patch.holidayPrefs || patch.customHolidays) {
      // Need full state to push, so we'll fetch and merge
      const currentSettings = await pullSettings(userId);
      const merged = {
        settings: { ...(currentSettings?.settings || {}), ...(patch.settings || {}) },
        holidayPrefs: { ...(currentSettings?.holidayPrefs || {}), ...(patch.holidayPrefs || {}) },
        customHolidays: patch.customHolidays !== undefined ? patch.customHolidays : (currentSettings?.customHolidays || [])
      };
      
      await pushSettings(userId, merged);
    }
    
    // If events changed, we need to handle adds/updates/deletes
    // For now, just push all events (inefficient but works)
    if (patch.events) {
      for (const event of patch.events) {
        await pushEvent(userId, event);
      }
    }
    
    return true;
  } catch (err) {
    console.error("Push state change error:", err);
    return false;
  }
}
