import { countries } from "./countries";

export type CircuitLocationInput = {
  name?: string;
  countryCode?: string;
  address?: string;
  mapsUrl?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type ResolvedCircuitLocation = {
  latitude: number;
  longitude: number;
  source: "manual" | "google_maps" | "address";
  resolvedMapsUrl?: string;
};

export type ResolvedCircuitTravel = {
  distanceKm: number;
  driveMinutes: number;
};

// Fixed company base: Vlčovice 314, 742 21 Kopřivnice.
// Keeping the origin fixed makes every circuit distance directly comparable
// and avoids a failed company-name lookup blocking the route calculation.
const WORKSHOP_LOCATION = { latitude: 49.5964848, longitude: 18.1752291 };

export async function resolveCircuitLocation(input: CircuitLocationInput): Promise<ResolvedCircuitLocation | null> {
  if (validCoordinates(input.latitude, input.longitude)) {
    return { latitude: Number(input.latitude), longitude: Number(input.longitude), source: "manual" };
  }

  const direct = coordinatesFromMapsUrl(input.mapsUrl ?? "");
  if (direct) return { ...direct, source: "google_maps" };

  const expandedMapsUrl = await expandGoogleMapsUrl(input.mapsUrl ?? "");
  if (expandedMapsUrl) {
    const expanded = coordinatesFromMapsUrl(expandedMapsUrl);
    if (expanded) return { ...expanded, source: "google_maps", resolvedMapsUrl: expandedMapsUrl };
  }

  const geocoded = await geocodeCircuit(input);
  return geocoded ? { ...geocoded, source: "address" } : null;
}

export async function resolveCircuitTravel(destination: { latitude: number; longitude: number }): Promise<ResolvedCircuitTravel | null> {
  return resolveTravelBetween(WORKSHOP_LOCATION, destination);
}

export async function resolveTravelBetween(origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }): Promise<ResolvedCircuitTravel | null> {
  if (!validCoordinates(origin.latitude, origin.longitude) || !validCoordinates(destination.latitude, destination.longitude)) return null;
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`);
  url.search = new URLSearchParams({ overview: "false", alternatives: "false", steps: "false" }).toString();
  try {
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "MM-System/1.0 (Machac Motors)" }, signal: AbortSignal.timeout(7500) });
    if (!response.ok) return null;
    const data = await response.json() as { code?: string; routes?: Array<{ distance?: number; duration?: number }> };
    const route = data.code === "Ok" ? data.routes?.[0] : null;
    if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) return null;
    return {
      distanceKm: Math.round((Number(route.distance) / 1000) * 10) / 10,
      driveMinutes: Math.max(1, Math.round(Number(route.duration) / 60)),
    };
  } catch {
    return null;
  }
}

export function coordinatesFromMapsUrl(value: string): { latitude: number; longitude: number } | null {
  if (!value.trim()) return null;
  const candidates = [value];
  try { candidates.push(decodeURIComponent(value)); } catch { /* Keep the original URL. */ }

  for (const candidate of candidates) {
    const patterns = [
      /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,|z|\/|$)/i,
      /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/i,
      /(?:[?&](?:query|q|ll|center|destination)=)(-?\d{1,2}(?:\.\d+)?)(?:%2C|,|%2c)(-?\d{1,3}(?:\.\d+)?)/i,
    ];
    for (const pattern of patterns) {
      const match = candidate.match(pattern);
      if (!match) continue;
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (validCoordinates(latitude, longitude)) return { latitude, longitude };
    }
  }
  return null;
}

async function expandGoogleMapsUrl(value: string) {
  if (!value.trim()) return "";
  let url: URL;
  try { url = new URL(value); } catch { return ""; }
  if (!isGoogleMapsHost(url.hostname)) return "";
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "MM-System/1.0" },
      signal: AbortSignal.timeout(5500),
    });
    return response.url || "";
  } catch {
    return "";
  }
}

async function geocodeCircuit(input: CircuitLocationInput) {
  const country = countries.find((item) => item.code === String(input.countryCode ?? "").toUpperCase());
  const address = String(input.address ?? "").trim();
  const mapsQuery = mapsSearchQuery(input.mapsUrl ?? "");
  const postcode = address.match(/\b\d{3}\s?\d{2}\b/)?.[0]?.replace(/\s/g, "") ?? "";
  const cityAfterPostcode = address.match(/\b\d{3}\s?\d{2}\s+([^,]+)/)?.[1]?.trim() ?? "";
  const addressParts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const localityParts = addressParts.length >= 3 ? addressParts.slice(1, -1).reverse() : addressParts.slice(1).reverse();
  const name = String(input.name ?? "").trim();
  const candidates = unique([
    mapsQuery,
    postcode,
    cityAfterPostcode,
    ...localityParts,
    name,
    ...addressParts.slice().reverse(),
  ]).filter((candidate) => candidate.length >= 2);

  const preciseCandidates = unique([
    mapsQuery,
    [name, address].filter(Boolean).join(", "),
    address,
    [name, localityParts[0]].filter(Boolean).join(", "),
    name,
  ]).filter((candidate) => candidate.length >= 3);
  const precise = await geocodeNominatim(preciseCandidates, country?.alpha2);
  if (precise) return precise;

  for (const name of candidates) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.search = new URLSearchParams({
      name,
      count: "5",
      language: "en",
      format: "json",
      ...(country ? { countryCode: country.alpha2 } : {}),
    }).toString();
    try {
      const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4500) });
      if (!response.ok) continue;
      const data = await response.json() as { results?: Array<{ latitude?: number; longitude?: number }> };
      const result = data.results?.find((item) => validCoordinates(item.latitude, item.longitude));
      if (result && validCoordinates(result.latitude, result.longitude)) return { latitude: Number(result.latitude), longitude: Number(result.longitude) };
    } catch {
      // Try the next address fragment if the geocoder cannot use this one.
    }
  }
  return null;
}

async function geocodeNominatim(queries: string[], countryCode?: string) {
  for (const query of unique(queries)) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      addressdetails: "0",
      ...(countryCode ? { countrycodes: countryCode.toLowerCase() } : {}),
    }).toString();
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "accept-language": "cs,en;q=0.8", "user-agent": "MM-System/1.0 (Machac Motors)" },
        signal: AbortSignal.timeout(5500),
      });
      if (!response.ok) continue;
      const data = await response.json() as Array<{ lat?: string; lon?: string }>;
      const latitude = Number(data[0]?.lat);
      const longitude = Number(data[0]?.lon);
      if (validCoordinates(latitude, longitude)) return { latitude, longitude };
    } catch {
      // Try another address form or the city geocoder below.
    }
  }
  return null;
}

function mapsSearchQuery(value: string) {
  try {
    const url = new URL(value);
    return url.searchParams.get("query") ?? url.searchParams.get("q") ?? url.searchParams.get("destination") ?? "";
  } catch {
    return "";
  }
}

function isGoogleMapsHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "goo.gl" || host.endsWith(".goo.gl") || host === "google.com" || host.endsWith(".google.com");
}

function validCoordinates(latitude: unknown, longitude: unknown) {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
