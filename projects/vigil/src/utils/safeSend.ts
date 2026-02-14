export async function safeSend(ch: { send: (s: string)=>any }, text: string) {
  const MAX = 1900;
  if (text.length <= MAX) return ch.send(text);
  for (let i = 0; i < text.length; i += MAX) {
    await ch.send(text.slice(i, i + MAX));
  }
}
