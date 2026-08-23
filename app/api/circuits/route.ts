import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { circuitImageUrl } from "../../circuit-image";
import { resolveCircuitLocation, resolveCircuitTravel } from "../../circuit-location";
import { isCountryCode } from "../../countries";
import { getAppUser } from "../../server-auth";

type CircuitPayload = {
  id?: string;
  name?: string;
  countryCode?: string;
  address?: string;
  websiteUrl?: string;
  mapsUrl?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  distanceKm?: number | string | null;
  driveMinutes?: number | string | null;
};

function clean(value: unknown, max = 300) { return String(value ?? "").trim().slice(0, max); }
function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}
function validUrl(value: string) {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}
function normalize(payload: CircuitPayload) {
  const name = clean(payload.name, 140);
  const countryCode = clean(payload.countryCode, 3).toUpperCase();
  const address = clean(payload.address, 400);
  const websiteUrl = clean(payload.websiteUrl, 500);
  const mapsUrlInput = clean(payload.mapsUrl, 500);
  const mapsUrl = mapsUrlInput || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "");
  const latitude = optionalNumber(payload.latitude);
  const longitude = optionalNumber(payload.longitude);
  const distanceKm = optionalNumber(payload.distanceKm);
  const driveMinutes = optionalNumber(payload.driveMinutes);
  let error = "";
  if (!name || !isCountryCode(countryCode)) error = "Circuit name and country are required";
  else if (!validUrl(websiteUrl) || !validUrl(mapsUrl)) error = "Website and map must be valid links";
  else if (Number.isNaN(latitude) || (latitude !== null && (latitude < -90 || latitude > 90))) error = "Invalid latitude";
  else if (Number.isNaN(longitude) || (longitude !== null && (longitude < -180 || longitude > 180))) error = "Invalid longitude";
  else if (Number.isNaN(distanceKm) || (distanceKm !== null && distanceKm < 0)) error = "Invalid distance";
  else if (Number.isNaN(driveMinutes) || (driveMinutes !== null && driveMinutes < 0)) error = "Invalid drive time";
  return { name, countryCode, address, websiteUrl, mapsUrl, latitude, longitude, distanceKm, driveMinutes: driveMinutes === null ? null : Math.round(driveMinutes), error };
}

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const rows = await getD1().prepare(`
    SELECT id, name, country_code AS countryCode, address, website_url AS websiteUrl, maps_url AS mapsUrl,
      latitude, longitude, distance_km AS distanceKm, drive_minutes AS driveMinutes,
      image_key AS imageKey, image_updated_at AS imageUpdatedAt, created_at AS createdAt, updated_at AS updatedAt
    FROM circuits WHERE archived_at IS NULL ORDER BY country_code, name
  `).all<Record<string, unknown>>();
  return Response.json({ circuits: rows.results.map((row) => ({ ...row, imageUrl: circuitImageUrl(row.id, row.imageKey, row.imageUpdatedAt) })) });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await request.json().catch(() => null) as CircuitPayload | null;
  if (!payload) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const circuit = normalize(payload);
  if (circuit.error) return Response.json({ error: circuit.error }, { status: 400 });
  const location = await resolveCircuitLocation(circuit);
  if (location) {
    circuit.latitude = location.latitude;
    circuit.longitude = location.longitude;
    if (circuit.distanceKm === null || circuit.driveMinutes === null) {
      const travel = await resolveCircuitTravel(location);
      if (travel) {
        circuit.distanceKm ??= travel.distanceKm;
        circuit.driveMinutes ??= travel.driveMinutes;
      }
    }
  }
  await ensureRuntimeSchema();
  const id = crypto.randomUUID(); const now = Date.now(); const d1 = getD1();
  try {
    await d1.batch([
      d1.prepare(`INSERT INTO circuits (id,name,country_code,address,website_url,maps_url,latitude,longitude,distance_km,drive_minutes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, circuit.name, circuit.countryCode, circuit.address, circuit.websiteUrl, circuit.mapsUrl, circuit.latitude, circuit.longitude, circuit.distanceKm, circuit.driveMinutes, user.email, now, now),
      d1.prepare(`INSERT INTO audit_logs (id,actor_email,action,entity_type,entity_id,details,created_at) VALUES (?,?,'create','circuit',?,?,?)`).bind(crypto.randomUUID(), user.email, id, JSON.stringify(circuit), now),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return Response.json({ error: "This circuit already exists" }, { status: 409 });
    throw error;
  }
  return Response.json({ id, locationResolved: Boolean(location), locationSource: location?.source ?? null }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await request.json().catch(() => null) as CircuitPayload | null;
  if (!payload?.id) return Response.json({ error: "Circuit id is required" }, { status: 400 });
  const circuit = normalize(payload);
  if (circuit.error) return Response.json({ error: circuit.error }, { status: 400 });
  const location = await resolveCircuitLocation(circuit);
  if (location) {
    circuit.latitude = location.latitude;
    circuit.longitude = location.longitude;
    if (circuit.distanceKm === null || circuit.driveMinutes === null) {
      const travel = await resolveCircuitTravel(location);
      if (travel) {
        circuit.distanceKm ??= travel.distanceKm;
        circuit.driveMinutes ??= travel.driveMinutes;
      }
    }
  }
  await ensureRuntimeSchema(); const d1 = getD1();
  const existing = await d1.prepare("SELECT * FROM circuits WHERE id = ? AND archived_at IS NULL").bind(payload.id).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Circuit not found" }, { status: 404 });
  const now = Date.now();
  try {
    await d1.batch([
      d1.prepare(`UPDATE circuits SET name=?,country_code=?,address=?,website_url=?,maps_url=?,latitude=?,longitude=?,distance_km=?,drive_minutes=?,updated_at=? WHERE id=? AND archived_at IS NULL`)
        .bind(circuit.name, circuit.countryCode, circuit.address, circuit.websiteUrl, circuit.mapsUrl, circuit.latitude, circuit.longitude, circuit.distanceKm, circuit.driveMinutes, now, payload.id),
      d1.prepare(`INSERT INTO audit_logs (id,actor_email,action,entity_type,entity_id,details,created_at) VALUES (?,?,'update','circuit',?,?,?)`).bind(crypto.randomUUID(), user.email, payload.id, JSON.stringify({ before: existing, after: circuit }), now),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return Response.json({ error: "This circuit already exists" }, { status: 409 });
    throw error;
  }
  return Response.json({ id: payload.id, locationResolved: Boolean(location), locationSource: location?.source ?? null });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as { id?: string };
  if (!payload.id) return Response.json({ error: "Circuit id is required" }, { status: 400 });
  await ensureRuntimeSchema(); const d1 = getD1(); const now = Date.now();
  const existing = await d1.prepare("SELECT * FROM circuits WHERE id=? AND archived_at IS NULL").bind(payload.id).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Circuit not found" }, { status: 404 });
  await d1.batch([
    d1.prepare("UPDATE circuits SET archived_at=?,updated_at=? WHERE id=?").bind(now, now, payload.id),
    d1.prepare(`INSERT INTO audit_logs (id,actor_email,action,entity_type,entity_id,details,created_at) VALUES (?,?,'archive','circuit',?,?,?)`).bind(crypto.randomUUID(), user.email, payload.id, JSON.stringify(existing), now),
  ]);
  return Response.json({ id: payload.id });
}
