export type Topic =
  | { type: "pronounce"; term: string; canonical?: string }
  | { type: "explain"; key: string }; // generic “that thing we just talked about”

type Slot = { topic?: Topic; ts: number };
const TTL = 5 * 60 * 1000;
const byChannel = new Map<string, Slot>();

export function setTopic(channelId: string, topic: Topic) { byChannel.set(channelId, { topic, ts: Date.now() }); }
export function getTopic(channelId: string): Topic | undefined {
  const s = byChannel.get(channelId);
  if (!s) return;
  if (Date.now() - s.ts > TTL) { byChannel.delete(channelId); return; }
  return s.topic;
}
export function clearTopic(channelId: string) { byChannel.delete(channelId); }
