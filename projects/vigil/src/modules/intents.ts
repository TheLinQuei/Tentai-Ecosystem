export type VoiceIntent =
  // speech / wake
  | { kind: "say"; text: string }
  | { kind: "leave" }
  | { kind: "beep" }
  | { kind: "wake_on" }
  | { kind: "wake_off" }
  | { kind: "wake_aliases"; list: string }
  // roles
  | { kind: "role_create"; name: string; perms: "admin" | "none" }
  | { kind: "role_give"; user: string; role: string }
  | { kind: "role_remove"; user: string; role: string }
  | { kind: "role_delete"; role: string }
  // channels
  | { kind: "chan_create"; name: string; type: "text" | "voice" }
  | { kind: "chan_delete"; name: string }
  // music
  | { kind: "music_play"; query: string }
  | { kind: "music_pause" }
  | { kind: "music_resume" }
  | { kind: "music_skip" }
  | { kind: "music_stop" }
  | { kind: "music_volume"; pct: number }
  | { kind: "none" };

export function parseVoiceCommand(input: string): VoiceIntent {
  const t = input.trim();

  // ---- SAY / WAKE / BASICS ----
  let m = t.match(/^(?:say|speak|tell|repeat)\s+(.+)/i);
  if (m) return { kind: "say", text: m[1].trim() };
  if (/^(?:leave|disconnect|go away|you can go)$/i.test(t)) return { kind: "leave" };
  if (/^(?:beep|tone|audio test|test (?:audio|sound))$/i.test(t)) return { kind: "beep" };
  if (/^wake(?:\s+word)?\s+(?:on|enable|enabled)$/i.test(t)) return { kind: "wake_on" };
  if (/^wake(?:\s+word)?\s+(?:off|disable|disabled)$/i.test(t)) return { kind: "wake_off" };
  m = t.match(/^wake\s+aliases?\s+(.+)/i);
  if (m) return { kind: "wake_aliases", list: m[1].trim().replace(/\s*,\s*/g, ",") }; 

  // ---- LEAVE / DISCONNECT ----
  // exact simple forms
  if (/^(?:leave|disconnect|go away|you can go|you can leave|you may leave|get out)[.!?]*$/i.test(t)) {
    return { kind: "leave" };
  }
  // natural “leave the voice/channel/chat/call/vc”
  if (/^(?:leave|disconnect)\s+(?:the\s+)?(?:(?:voice|vc)(?:\s+(?:channel|chat))?|call|channel|chat)\b/i.test(t)) {
    return { kind: "leave" };
  }

  // ---- ROLES ----
  m = t.match(/^(?:make|create|add)\s+(?:the\s+)?role\s+(.+?)(?:\s+(?:and\s+)?(?:give\s+(?:it|the role)?\s+)?(all\s+perms?|administrator|admin|every\s+perm|full\s+perms?))?$/i);
  if (m) {
    const name = m[1].trim();
    const perms = m[2]?.toLowerCase() ?? "none";
    const p: "admin" | "none" =
      /admin|administrator|all\s+perm|every\s+perm|full\s+perm/.test(perms) ? "admin" : "none";
    return { kind: "role_create", name, perms: p };
  }
  m = t.match(/^give\s+(.+?)\s+(?:the\s+)?role\s+(.+)$/i);
  if (m) return { kind: "role_give", user: m[1].trim(), role: m[2].trim() };
  m = t.match(/^give\s+(?:the\s+)?role\s+(.+?)\s+to\s+(.+)$/i);
  if (m) return { kind: "role_give", role: m[1].trim(), user: m[2].trim() };
  m = t.match(/^(?:remove|take)\s+(?:the\s+)?role\s+(.+?)\s+from\s+(.+)$/i);
  if (m) return { kind: "role_remove", role: m[1].trim(), user: m[2].trim() };
  m = t.match(/^(?:delete|remove|drop)\s+(?:the\s+)?role\s+(.+)$/i);
  if (m) return { kind: "role_delete", role: m[1].trim() };

  // ---- CHANNELS ----
  m = t.match(/^(?:create|make|add)\s+(?:a\s+)?(text|voice)?\s*channel\s+(.+)$/i);
  if (m) {
    const type = (m[1]?.toLowerCase() as "text" | "voice") || "text";
    return { kind: "chan_create", name: m[2].trim(), type };
  }
  m = t.match(/^(?:delete|remove|drop)\s+(?:the\s+)?channel\s+(.+)$/i);
  if (m) return { kind: "chan_delete", name: m[1].trim() };

  // ---- MUSIC ----
  m = t.match(/^play\s+(.+?)(?:\s*[.?!'"]*)$/i);
  if (m) return { kind: "music_play", query: m[1].trim() };
  if (/^(?:pause|pause music)$/i.test(t)) return { kind: "music_pause" };
  if (/^(?:resume|continue|resume music)$/i.test(t)) return { kind: "music_resume" };
  if (/^(?:skip|next)$/i.test(t)) return { kind: "music_skip" };
  if (/^(?:stop|stop music|clear queue)$/i.test(t)) return { kind: "music_stop" };
  m = t.match(/^volume\s+(\d{1,3})%?$/i);
  if (m) return { kind: "music_volume", pct: Math.max(0, Math.min(100, parseInt(m[1], 10))) };

  return { kind: "none" };
}
