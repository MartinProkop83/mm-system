import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { raceLogoUrl } from "../../race-logo";
import { vehiclePhotoUrl } from "../../vehicle-photo";

function clean(value: unknown, max = 80) { return String(value ?? "").trim().slice(0, max); }

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const id = clean(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "Vehicle id is required" }, { status: 400 });
  const d1 = getD1();

  const vehicle = await d1.prepare(`
    SELECT id, name, license_plate AS licensePlate, notes, photo_key AS photoKey, photo_updated_at AS photoUpdatedAt,
           current_km AS currentKm, service_interval_km AS serviceIntervalKm, last_service_km AS lastServiceKm, last_service_note AS lastServiceNote, last_service_date AS lastServiceDate,
           created_at AS createdAt, updated_at AS updatedAt
    FROM vehicles WHERE id = ? AND archived_at IS NULL
  `).bind(id).first<Record<string, unknown>>();
  if (!vehicle) return Response.json({ error: "Vehicle not found" }, { status: 404 });

  const [assignments, pairedMechanicRows, allRaceMechanicRows, serviceEntries, mechanics] = await Promise.all([
    d1.prepare(`
      SELECT r.id AS raceId, r.name AS raceName, r.status AS raceStatus,
             r.start_date AS startDate, r.end_date AS endDate,
             r.departure_date AS departureDate, r.return_date AS returnDate,
             r.track, r.country_code AS countryCode,
             r.race_template_id AS raceTemplateId, rt.logo_key AS logoKey, rt.logo_updated_at AS logoUpdatedAt
      FROM race_vehicles rv JOIN races r ON r.id = rv.race_id
      LEFT JOIN race_templates rt ON rt.id = r.race_template_id
      WHERE rv.vehicle_id = ? AND r.status != 'archived'
      ORDER BY r.start_date DESC
    `).bind(id).all<Record<string, unknown>>(),
    d1.prepare(`SELECT race_id AS raceId, mechanic_name_snapshot AS mechanicName FROM race_mechanics WHERE vehicle_id = ?`).bind(id).all<{ raceId: string; mechanicName: string }>(),
    d1.prepare(`
      SELECT rm.race_id AS raceId, rm.mechanic_name_snapshot AS mechanicName
      FROM race_mechanics rm
      JOIN race_vehicles rv2 ON rv2.race_id = rm.race_id
      WHERE rv2.vehicle_id = ?
    `).bind(id).all<{ raceId: string; mechanicName: string }>(),
    d1.prepare(`
      SELECT id, service_date AS serviceDate, km, work_done AS workDone, mechanic_id AS mechanicId, mechanic_name_snapshot AS mechanicName
      FROM vehicle_service_entries WHERE vehicle_id = ? ORDER BY service_date DESC, created_at DESC
    `).bind(id).all<Record<string, unknown>>(),
    d1.prepare("SELECT id, name FROM mechanics WHERE archived_at IS NULL ORDER BY name").all<{ id: string; name: string }>(),
  ]);

  const pairedByRace = new Map<string, string[]>();
  for (const row of pairedMechanicRows.results) {
    const list = pairedByRace.get(row.raceId) ?? [];
    list.push(row.mechanicName);
    pairedByRace.set(row.raceId, list);
  }
  const allByRace = new Map<string, string[]>();
  for (const row of allRaceMechanicRows.results) {
    const list = allByRace.get(row.raceId) ?? [];
    list.push(row.mechanicName);
    allByRace.set(row.raceId, list);
  }

  return Response.json({
    vehicle: { ...vehicle, photoUrl: vehiclePhotoUrl(vehicle.id, vehicle.photoKey, vehicle.photoUpdatedAt) },
    assignments: (assignments.results as Array<Record<string, unknown>>).map((assignment) => {
      const raceId = String(assignment.raceId);
      const paired = pairedByRace.get(raceId) ?? [];
      const isSpecific = paired.length > 0;
      return {
        ...assignment,
        logoUrl: raceLogoUrl(assignment.raceTemplateId, assignment.logoKey, assignment.logoUpdatedAt),
        mechanics: isSpecific ? paired : (allByRace.get(raceId) ?? []),
        mechanicsAreSpecific: isSpecific,
      };
    }),
    serviceEntries: serviceEntries.results,
    mechanics: mechanics.results,
  });
}
