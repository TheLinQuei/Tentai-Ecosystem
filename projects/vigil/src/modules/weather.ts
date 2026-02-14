// src/modules/weather.ts
// Realtime weather via Open-Meteo (no API key)

type GeoHit = {
  name: string; latitude: number; longitude: number;
  country?: string; admin1?: string; timezone?: string;
};

const WMO: Record<number, string> = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "depositing rime fog",
  51: "light drizzle", 53: "moderate drizzle", 55: "dense drizzle",
  56: "freezing drizzle", 57: "freezing drizzle (dense)",
  61: "light rain", 63: "moderate rain", 65: "heavy rain",
  66: "freezing rain (light)", 67: "freezing rain (heavy)",
  71: "light snow", 73: "moderate snow", 75: "heavy snow",
  77: "snow grains",
  80: "light rain showers", 81: "moderate rain showers", 82: "violent rain showers",
  85: "light snow showers", 86: "heavy snow showers",
  95: "thunderstorm", 96: "thunderstorm with small hail", 99: "thunderstorm with large hail",
};

const toF = (c: number) => (c * 9) / 5 + 32;
const degToDir = (deg?: number) => {
  if (deg == null) return "—";
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(((deg % 360) / 22.5)) % 16];
};

async function geocode(query: string): Promise<GeoHit | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&format=json&name=${encodeURIComponent(query)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j: any = await r.json();
  const hit = j?.results?.[0];
  if (!hit) return null;
  return {
    name: hit.name,
    latitude: hit.latitude,
    longitude: hit.longitude,
    country: hit.country,
    admin1: hit.admin1,
    timezone: hit.timezone,
  };
}

export async function getCurrentWeather(place: string): Promise<string> {
  const geo = await geocode(place);
  if (!geo) return `I couldn't find **${place}**. Try a city and state/country (e.g., "Chicago, IL").`;

  const params = new URLSearchParams({
    latitude: String(geo.latitude),
    longitude: String(geo.longitude),
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,rain,snowfall,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code",
    timezone: geo.timezone ?? "auto",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  const r = await fetch(url);
  if (!r.ok) return `Weather service is unavailable right now.`;
  const j: any = await r.json();
  const c = j?.current;
  if (!c) return `No current weather data available.`;

  const where = `**${geo.name}**${geo.admin1 ? `, ${geo.admin1}` : ""}${geo.country ? `, ${geo.country}` : ""}`;
  const cond = WMO[c.weather_code as number] ?? "conditions unavailable";
  const tC = Number(c.temperature_2m);
  const tF = Math.round(toF(tC));
  const hum = c.relative_humidity_2m;
  const wind = c.wind_speed_10m;
  const gust = c.wind_gusts_10m;
  const dir = degToDir(c.wind_direction_10m);
  const clouds = c.cloud_cover;

  return `${where}: **${tF}°F** (${tC.toFixed(1)}°C), ${cond}. ` +
         `Humidity ${hum}%. Wind ${wind} m/s (${dir}), gusts ${gust} m/s. Cloud cover ${clouds}%.`;
}
