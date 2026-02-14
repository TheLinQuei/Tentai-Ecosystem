// No API key needed (Open-Meteo + geocoding). Returns a short, spoken-friendly line.
type WeatherOK = { ok: true; where: string; line: string };
type WeatherErr = { ok: false; err: string };
export type WeatherResult = WeatherOK | WeatherErr;

// Basic WMO weather code map (subset)
const WMO: Record<number, string> = {
  0: "clear",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "freezing fog",
  51: "light drizzle",
  53: "drizzle",
  55: "heavy drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  80: "light showers",
  81: "showers",
  82: "heavy showers",
  95: "thunderstorms",
  96: "thunderstorms with hail",
  99: "severe thunderstorms",
};

function pickUnits() {
  const u = (process.env.WEATHER_UNITS || "").toLowerCase();
  // "imperial" -> F & mph; otherwise C & km/h
  const imperial = u === "imperial" || u === "us" || u === "f";
  return {
    temp: imperial ? "fahrenheit" : "celsius",
    wind: imperial ? "mph" : "km/h",
    windParam: imperial ? "ms" : "kmh",
    speedFactor: imperial ? 2.23694 : 3.6, // m/s -> mph or km/h
    symbol: imperial ? "°F" : "°C",
  };
}

export async function getWeatherByName(query: string): Promise<WeatherResult> {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const g = await fetch(geoUrl).then(r => r.json() as any).catch(() => null);
  const place = g?.results?.[0];
  if (!place) return { ok: false, err: "location not found" };

  const lat = place.latitude;
  const lon = place.longitude;
  const where = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
  const tz = place.timezone || "auto";

  const units = pickUnits();
  const api = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&timezone=${encodeURIComponent(tz)}`;
  const w = await fetch(api).then(r => r.json() as any).catch(() => null);
  const c = w?.current;
  if (!c) return { ok: false, err: "weather unavailable" };

  const temp = c.temperature_2m as number;
  const feels = c.apparent_temperature as number;
  const hum = c.relative_humidity_2m as number;
  const precip = c.precipitation as number;
  const code = c.weather_code as number;
  const windMs = c.wind_speed_10m as number;

  // Units from API are °C and m/s regardless; convert if imperial
  const tempF = units.temp === "fahrenheit" ? (temp * 9) / 5 + 32 : temp;
  const feelsF = units.temp === "fahrenheit" ? (feels * 9) / 5 + 32 : feels;
  const wind = Math.round(windMs * units.speedFactor);

  const desc = WMO[code] || "current conditions";
  const tStr = `${Math.round(tempF)}${units.symbol}`;
  const fStr = `${Math.round(feelsF)}${units.symbol}`;
  const rain = precip > 0 ? `, precip ${precip.toFixed(1)} mm` : "";
  const line = `${desc}, ${tStr} (feels ${fStr}), wind ${wind} ${units.wind}, humidity ${hum}%${rain}.`;

  return { ok: true, where, line };
}
