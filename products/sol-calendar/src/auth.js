/**
 * Authentication Module (Supabase)
 * Handles user login, logout, and session management
 */

let supabaseClient = null;

/**
 * Initialize Supabase client
 * Call this before using any auth functions
 */
export function initSupabase(url, anonKey) {
  if (!url || !anonKey) {
    console.warn("Supabase not configured - auth disabled");
    return false;
  }
  
  try {
    // Dynamically import Supabase if available
    if (typeof window.supabase !== 'undefined') {
      supabaseClient = window.supabase.createClient(url, anonKey);
      return true;
    }
  } catch (err) {
    console.error("Failed to initialize Supabase:", err);
  }
  
  return false;
}

/**
 * Check if auth is available
 */
export function isAuthEnabled() {
  return supabaseClient !== null;
}

/**
 * Sign in with email magic link
 */
export async function signInWithEmail(email) {
  if (!supabaseClient) {
    return { error: { message: "Auth not configured" } };
  }
  
  try {
    const { data, error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin
      }
    });
    
    return { data, error };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithPassword(email, password) {
  if (!supabaseClient) {
    return { error: { message: "Auth not configured" } };
  }
  
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    
    return { data, error };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

/**
 * Sign up new user
 */
export async function signUp(email, password) {
  if (!supabaseClient) {
    return { error: { message: "Auth not configured" } };
  }
  
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });
    
    return { data, error };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

/**
 * Sign out current user
 */
export async function signOut() {
  if (!supabaseClient) return;
  
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error("Sign out error:", err);
  }
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  if (!supabaseClient) return null;
  
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
  } catch (err) {
    console.error("Get user error:", err);
    return null;
  }
}

/**
 * Get current session
 */
export async function getSession() {
  if (!supabaseClient) return null;
  
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session;
  } catch (err) {
    console.error("Get session error:", err);
    return null;
  }
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback) {
  if (!supabaseClient) {
    // Call callback immediately with null user if auth disabled
    callback('SIGNED_OUT', null);
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
  
  return supabaseClient.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

/**
 * Get Supabase client for advanced use
 */
export function getSupabaseClient() {
  return supabaseClient;
}
