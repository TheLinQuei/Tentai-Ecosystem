import type { Client, Message } from "discord.js";
import { getTopic, setTopic, clearTopic } from "../core/context";
import { touchUser, addFact } from "../memory/vibrainStore";

const CONFIRM = /^(y|ya|yes|yep|ok|okay|sure|please|pls|yes please|yup)[!. ]*$/i;
// catches: "make it easier to understand", "make it simple", "plain english", "eli5", "tl;dr"
const MAKE_EASIER =
  /(make (it )?(easier|simple|easier to understand|easy to understand)|simplif(y|y it)|plain english|explain like i'?m 5|eli5|tl;dr|short( version)?)/i;

const PRONOUNCE_Q = /\bhow (?:do|to) (?:you )?pronounce ([\w'-]+)\b/i;

export function wireClarifier(client: Client) {
  // Observe user messages for intent
  client.on("messageCreate", async (m: Message) => {
    if (m.author.bot || !m.content) return;

    // touch memory for every human message
    touchUser(m.author.id, m.member?.nickname ?? m.author.username);
    
    // learn tiny facts from obvious signals
    if (/make it (easier|simple)/i.test(m.content)) addFact(m.author.id, "prefers plain-language rephrasing");
    if (/meow/i.test(m.content)) addFact(m.author.id, "likes cat banter");

    const p = m.content.match(PRONOUNCE_Q);
    if (p) { setTopic(m.channelId, { type: "pronounce", term: p[1] }); return; }

    if (MAKE_EASIER.test(m.content)) {
      const t = getTopic(m.channelId);
      if (t) { await m.reply(simplify(t)); clearTopic(m.channelId); }
      else { await m.reply("Paste what you want simplified."); }
      return;
    }

    if (CONFIRM.test(m.content.trim())) {
      const t = getTopic(m.channelId);
      if (t) { 
        await m.reply(simplify(t)); 
        clearTopic(m.channelId); 
      }
      // Note: bare confirmations without topic fall through (AI can handle them)
    }
  });

  // Observe bot messages to lock canonical phonetics
  client.on("messageCreate", (m: Message) => {
    if (!m.author.bot || !m.content) return;
    const t = getTopic(m.channelId);
    if (t?.type !== "pronounce") return;

    // e.g. “pronounced as "KYOO-pee"”
    const ph = m.content.match(/pronounced (?:as )?["'“”]?([A-Za-z-]+)["'“”]?/i);
    if (ph) setTopic(m.channelId, { ...t, canonical: ph[1] });
    else setTopic(m.channelId, t); // keep it alive
  });
}

function simplify(t: ReturnType<typeof getTopic> extends infer R ? R : never): string {
  if (!t) return "Say it short and clear.";
  if (t.type === "pronounce") {
    const canonical = (t.canonical ?? t.term).toUpperCase();
    if (/KE?W?PIE?/i.test(t.term) || /KYOO-PEE/i.test(canonical)) {
      return "**Kewpie** = **Q-pee**. Letter **Q** + **pee**. (Rhymes with **Q-pee**.)";
    }
    // generic fallback
    return `**${t.term}**: say it like **${canonical.toLowerCase()}**, broken into easy beats.`;
  }
  return "Simplified: short words, no fluff.";
}
