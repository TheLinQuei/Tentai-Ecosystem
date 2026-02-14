/**
 * Groups & Sharing Module
 * Handles group creation, invites, and shared events
 */

import { getSupabaseClient } from "./auth.js";

/**
 * Create a new group
 */
export async function createGroup(name, ownerId) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  
  try {
    const inviteCode = generateInviteCode();
    
    const { data, error } = await supabase
      .from('groups')
      .insert({
        name,
        owner_id: ownerId,
        invite_code: inviteCode
      })
      .select()
      .single();
    
    if (error) {
      console.error("Create group error:", error);
      return null;
    }
    
    // Add owner as member
    await supabase.from('group_members').insert({
      group_id: data.id,
      user_id: ownerId,
      role: 'owner'
    });
    
    return data;
  } catch (err) {
    console.error("Create group exception:", err);
    return null;
  }
}

/**
 * Join group by invite code
 */
export async function joinGroupByCode(code, userId) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  
  try {
    // Find group by code
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('invite_code', code.toUpperCase())
      .single();
    
    if (groupError || !group) {
      console.error("Group not found:", code);
      return false;
    }
    
    // Check if already a member
    const { data: existing } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', group.id)
      .eq('user_id', userId)
      .single();
    
    if (existing) {
      return true; // Already a member
    }
    
    // Add as member
    const { error } = await supabase
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: userId,
        role: 'member'
      });
    
    if (error) {
      console.error("Join group error:", error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error("Join group exception:", err);
    return false;
  }
}

/**
 * Get all groups user is a member of
 */
export async function getMyGroups(userId) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  
  try {
    const { data, error } = await supabase
      .from('group_members')
      .select('groups(*), role')
      .eq('user_id', userId);
    
    if (error) {
      console.error("Get groups error:", error);
      return [];
    }
    
    return (data || []).map(m => ({
      ...m.groups,
      myRole: m.role
    }));
  } catch (err) {
    console.error("Get groups exception:", err);
    return [];
  }
}

/**
 * Get group members
 */
export async function getGroupMembers(groupId) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  
  try {
    const { data, error } = await supabase
      .from('group_members')
      .select('user_id, role, joined_at')
      .eq('group_id', groupId);
    
    if (error) {
      console.error("Get members error:", error);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error("Get members exception:", err);
    return [];
  }
}

/**
 * Create group event
 */
export async function createGroupEvent(groupId, userId, event) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('group_events')
      .insert({
        group_id: groupId,
        name: event.name,
        type: event.type,
        gregorian_date: event.gregorianDate || null,
        day_no: event.dayNo || null,
        recurring: event.recurring || false,
        created_by: userId
      })
      .select()
      .single();
    
    if (error) {
      console.error("Create group event error:", error);
      return null;
    }
    
    return {
      id: data.id,
      name: data.name,
      type: data.type,
      gregorianDate: data.gregorian_date,
      dayNo: data.day_no,
      recurring: data.recurring,
      groupId: data.group_id,
      createdBy: data.created_by,
      createdAt: data.created_at
    };
  } catch (err) {
    console.error("Create group event exception:", err);
    return null;
  }
}

/**
 * Get all events for groups user is in
 */
export async function getGroupEvents(userId) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  
  try {
    // Get user's group IDs
    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);
    
    if (!memberships || memberships.length === 0) {
      return [];
    }
    
    const groupIds = memberships.map(m => m.group_id);
    
    // Get events for those groups
    const { data, error } = await supabase
      .from('group_events')
      .select('*, groups(name)')
      .in('group_id', groupIds)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Get group events error:", error);
      return [];
    }
    
    return (data || []).map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      gregorianDate: e.gregorian_date,
      dayNo: e.day_no,
      recurring: e.recurring,
      groupId: e.group_id,
      groupName: e.groups?.name,
      createdBy: e.created_by,
      createdAt: e.created_at,
      isGroupEvent: true
    }));
  } catch (err) {
    console.error("Get group events exception:", err);
    return [];
  }
}

/**
 * Delete group event
 */
export async function deleteGroupEvent(groupId, eventId, userId) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  
  try {
    // Check if user has permission (created it or is admin/owner)
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();
    
    const { data: event } = await supabase
      .from('group_events')
      .select('created_by')
      .eq('id', eventId)
      .single();
    
    const canDelete = 
      membership?.role === 'owner' ||
      membership?.role === 'admin' ||
      event?.created_by === userId;
    
    if (!canDelete) {
      console.error("No permission to delete group event");
      return false;
    }
    
    const { error } = await supabase
      .from('group_events')
      .delete()
      .eq('id', eventId)
      .eq('group_id', groupId);
    
    if (error) {
      console.error("Delete group event error:", error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error("Delete group event exception:", err);
    return false;
  }
}

/**
 * Leave a group
 */
export async function leaveGroup(groupId, userId) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  
  try {
    // Check if owner
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();
    
    if (membership?.role === 'owner') {
      // Can't leave if owner - must delete group or transfer ownership
      return false;
    }
    
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    
    if (error) {
      console.error("Leave group error:", error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error("Leave group exception:", err);
    return false;
  }
}

/**
 * Generate random invite code
 */
function generateInviteCode() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}
