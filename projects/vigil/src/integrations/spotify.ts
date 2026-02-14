import SpotifyWebApi from "spotify-web-api-node";
import { search } from "play-dl";

type TrackInfo = {
  title: string;
  artists: string[];
  durationMs: number;
  isrc?: string;
};

const SPOTIFY_RX =
  /(?:open\.spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)|spotify:(track|album|playlist):([A-Za-z0-9]+))/;

function parseSpotify(urlOrUri: string): { type: "track" | "album" | "playlist"; id: string } | null {
  const m = SPOTIFY_RX.exec(urlOrUri);
  if (!m) return null;
  const type = (m[1] || m[3]) as "track" | "album" | "playlist";
  const id = (m[2] || m[4]);
  return { type, id };
}

async function getSpotifyClient() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing SPOTIFY_CLIENT_ID/SECRET");

  const api = new SpotifyWebApi({ clientId, clientSecret });
  const token = await api.clientCredentialsGrant();
  api.setAccessToken(token.body.access_token);
  return api;
}

export function isSpotifyUrl(s: string) {
  return SPOTIFY_RX.test(s);
}

export async function fetchTracksFromSpotify(url: string): Promise<TrackInfo[]> {
  const parsed = parseSpotify(url);
  if (!parsed) return [];
  const api = await getSpotifyClient();

  if (parsed.type === "track") {
    const t: any = (await api.getTrack(parsed.id)).body;
    return [
      {
        title: t?.name ?? "Unknown",
        artists: (t?.artists ?? []).map((a: any) => a?.name).filter(Boolean),
        durationMs: t?.duration_ms ?? 0,
        isrc: t?.external_ids?.isrc,
      },
    ];
  }

  if (parsed.type === "album") {
    const tracks: TrackInfo[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const batch: any = await api.getAlbumTracks(parsed.id, { limit: 50, offset });
      for (const it of batch.body.items ?? []) {
        tracks.push({
          title: it?.name ?? "Unknown",
          artists: (it?.artists ?? []).map((a: any) => a?.name).filter(Boolean),
          durationMs: it?.duration_ms ?? 0,
        });
      }
      offset += (batch.body.items ?? []).length;
      hasMore = Boolean(batch.body.next);
    }
    return tracks;
  }

  // playlist
  const tracks: TrackInfo[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const batch: any = await api.getPlaylistTracks(parsed.id, { limit: 100, offset });
    for (const it of batch.body.items ?? []) {
      const t: any = it?.track ?? null;
      if (!t) continue;
      tracks.push({
        title: t?.name ?? "Unknown",
        artists: (t?.artists ?? []).map((a: any) => a?.name).filter(Boolean),
        durationMs: t?.duration_ms ?? 0,
        isrc: t?.external_ids?.isrc,
      });
    }
    offset += (batch.body.items ?? []).length;
    hasMore = Boolean(batch.body.next);
  }
  return tracks;
}

function buildQuery(t: TrackInfo) {
  const main = t.artists[0] ? `${t.artists[0]} - ${t.title}` : t.title;
  return `${main} official audio`;
}

function scoreResult(q: string, durationMs: number, r: any): number {
  const title = (r.title || "").toLowerCase();
  const chan = (r.channel?.name || "").toLowerCase();
  const dur = (r.durationInSec || 0) * 1000;

  let s = 0;
  if (durationMs && dur) {
    const diff = Math.abs(dur - durationMs);
    if (diff < 2000) s += 4;
    else if (diff < 5000) s += 3;
    else if (diff < 10000) s += 2;
  }
  for (const token of q.toLowerCase().split(/\s+/)) {
    if (token.length > 3 && title.includes(token)) s += 0.2;
  }
  if (/- topic$/.test(chan)) s += 2;
  if (chan.includes("official")) s += 1;
  return s;
}

export async function resolveSpotifyToYouTube(url: string): Promise<string[]> {
  const tracks = await fetchTracksFromSpotify(url);
  const out: string[] = [];

  for (const t of tracks) {
    const q = buildQuery(t);
    const results = await search(q, { limit: 8, source: { youtube: "video" } });
    if (!results.length) continue;

    let best = results[0];
    let bestScore = -Infinity;
    for (const r of results) {
      const sc = scoreResult(q, t.durationMs, r);
      if (sc > bestScore) { bestScore = sc; best = r; }
    }
    out.push((best as any).url);
  }
  return out;
}
