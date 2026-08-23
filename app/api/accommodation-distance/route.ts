import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { resolveCircuitLocation, resolveTravelBetween } from "../../circuit-location";
import { getAppUser } from "../../server-auth";

type DistancePayload = { raceId?: unknown; name?: unknown; address?: unknown };

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null) as DistancePayload | null;
  if (!payload) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const raceId = clean(payload.raceId, 80);
  const name = clean(payload.name, 180);
  const address = clean(payload.address, 300);
  if (!raceId || !address) return Response.json({ error: "Race and accommodation address are required" }, { status: 400 });

  await ensureRuntimeSchema();
  const race = await getD1().prepare(`
    SELECT r.track, r.address AS raceAddress, r.country_code AS countryCode,
           c.name AS circuitName, c.address AS circuitAddress, c.maps_url AS circuitMapsUrl,
           c.latitude AS circuitLatitude, c.longitude AS circuitLongitude
    FROM races r
    LEFT JOIN circuits c ON c.id = r.circuit_id AND c.archived_at IS NULL
    WHERE r.id = ? AND r.status != 'archived'
  `).bind(raceId).first<Record<string, unknown>>();
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });

  const accommodationLocation = await resolveCircuitLocation({ name, address, countryCode: clean(race.countryCode, 3) });
  if (!accommodationLocation) return Response.json({ error: "Accommodation location could not be determined" }, { status: 422 });

  const storedCircuitLocation = numericLocation(race.circuitLatitude, race.circuitLongitude);
  const circuitLocation = storedCircuitLocation ?? await resolveCircuitLocation({
    name: clean(race.circuitName || race.track, 180),
    address: clean(race.circuitAddress || race.raceAddress, 300),
    mapsUrl: clean(race.circuitMapsUrl, 800),
    countryCode: clean(race.countryCode, 3),
  });
  if (!circuitLocation) return Response.json({ error: "Circuit location could not be determined" }, { status: 422 });

  const travel = await resolveTravelBetween(accommodationLocation, circuitLocation);
  if (!travel) return Response.json({ error: "Route to circuit could not be calculated" }, { status: 503 });
  return Response.json({ location: accommodationLocation, travel });
}

function numericLocation(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude); const lon = Number(longitude);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180
    ? { latitude: lat, longitude: lon }
    : null;
}
