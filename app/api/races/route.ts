import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { isCountryCode } from "../../countries";
import { raceLogoUrl } from "../../race-logo";
import { normalizeRaceCalendarColor } from "../../race-calendar-colors";
import { circuitImageUrl } from "../../circuit-image";

const categoryOrder = ["BABY", "MINI", "MINI U10", "MINI GR3", "OKJ", "OKN-J", "OKN", "OK", "KZ"];
const allowedCategories = new Set(categoryOrder);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function deriveStatus(startDate: string, endDate: string) {
  const today = todayIso();
  if (today < startDate) return "planned";
  if (today > endDate) return "completed";
  return "active";
}

type RacePayload = {
  id?: string;
  raceTemplateId?: string;
  circuitId?: string;
  series?: string;
  seriesRound?: string | number;
  track?: string;
  address?: string;
  countryCode?: string;
  startDate?: string;
  endDate?: string;
  departureDate?: string;
  returnDate?: string;
  organizer?: string;
  notes?: string;
  status?: string;
  categories?: string[];
  mechanicIds?: string[];
  vehicleIds?: string[];
};

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function uniqueIds(values: string[] | undefined) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => clean(value, 80)).filter(Boolean)));
}

function intervalsOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

async function getRaceTemplate(id: string) {
  return getD1().prepare("SELECT id, name FROM race_templates WHERE id = ? AND archived_at IS NULL").bind(id).first<{ id: string; name: string }>();
}

async function prepareTravelAssignments(
  mechanicIds: string[],
  vehicleIds: string[],
  target: { departureDate: string; returnDate: string },
  excludeRaceId: string,
) {
  const d1 = getD1();
  const mechanics: Array<{ id: string; name: string }> = [];
  for (const mechanicId of mechanicIds) {
    const mechanic = await d1.prepare("SELECT id, name FROM mechanics WHERE id = ? AND archived_at IS NULL").bind(mechanicId).first<{ id: string; name: string }>();
    if (!mechanic) return Response.json({ error: "Mechanic not found" }, { status: 404 });
    const rows = await d1.prepare(`
      SELECT r.name, r.departure_date AS departureDate, r.return_date AS returnDate
      FROM race_mechanics rm JOIN races r ON r.id = rm.race_id
      WHERE rm.mechanic_id = ? AND r.id != ? AND r.status != 'archived'
    `).bind(mechanicId, excludeRaceId).all<{ name: string; departureDate: string; returnDate: string }>();
    const conflict = rows.results.find((row) => intervalsOverlap(row.departureDate, row.returnDate, target.departureDate, target.returnDate));
    if (conflict) return Response.json({ error: `Mechanic ${mechanic.name} is already assigned to ${conflict.name}` }, { status: 409 });
    mechanics.push(mechanic);
  }

  const vehicles: Array<{ id: string; name: string; licensePlate: string }> = [];
  for (const vehicleId of vehicleIds) {
    const vehicle = await d1.prepare("SELECT id, name, license_plate AS licensePlate FROM vehicles WHERE id = ? AND archived_at IS NULL").bind(vehicleId).first<{ id: string; name: string; licensePlate: string }>();
    if (!vehicle) return Response.json({ error: "Vehicle not found" }, { status: 404 });
    const rows = await d1.prepare(`
      SELECT r.name, r.departure_date AS departureDate, r.return_date AS returnDate
      FROM race_vehicles rv JOIN races r ON r.id = rv.race_id
      WHERE rv.vehicle_id = ? AND r.id != ? AND r.status != 'archived'
    `).bind(vehicleId, excludeRaceId).all<{ name: string; departureDate: string; returnDate: string }>();
    const conflict = rows.results.find((row) => intervalsOverlap(row.departureDate, row.returnDate, target.departureDate, target.returnDate));
    if (conflict) return Response.json({ error: `Vehicle ${vehicle.name} is already assigned to ${conflict.name}` }, { status: 409 });
    vehicles.push(vehicle);
  }

  return { mechanics, vehicles };
}

function normalize(payload: RacePayload) {
  const raceTemplateId = clean(payload.raceTemplateId, 80);
  const circuitId = clean(payload.circuitId, 80);
  const series = clean(payload.series, 60);
  const seriesRoundRaw = clean(payload.seriesRound, 4);
  const seriesRound = seriesRoundRaw ? Number(seriesRoundRaw) : null;
  const track = clean(payload.track, 140);
  const address = clean(payload.address, 300);
  const countryCode = clean(payload.countryCode, 3).toUpperCase();
  const startDate = clean(payload.startDate, 10);
  const endDate = clean(payload.endDate, 10);
  const departureDate = clean(payload.departureDate, 10);
  const returnDate = clean(payload.returnDate, 10);
  const organizer = clean(payload.organizer, 120);
  const notes = clean(payload.notes, 2000);
  const status = validDate(startDate) && validDate(endDate) ? deriveStatus(startDate, endDate) : "planned";
  const categories = categoryOrder.filter((category) => new Set(payload.categories ?? []).has(category));
  let error = "";
  const mechanicIds = uniqueIds(payload.mechanicIds);
  const vehicleIds = uniqueIds(payload.vehicleIds);
  if (!raceTemplateId || !track || !isCountryCode(countryCode)) error = "Race, track and country are required";
  else if (![startDate, endDate, departureDate, returnDate].every(validDate)) error = "All race and travel dates are required";
  else if (!(departureDate <= startDate && startDate <= endDate && endDate <= returnDate)) error = "Dates must follow departure, race and return order";
  else if (categories.length === 0 || categories.some((category) => !allowedCategories.has(category))) error = "Select at least one valid category";
  else if (seriesRound !== null && (!Number.isInteger(seriesRound) || seriesRound < 1 || seriesRound > 10)) error = "Series round must be between 1 and 10";
  return { raceTemplateId, circuitId, series, seriesRound, track, address, countryCode, startDate, endDate, departureDate, returnDate, organizer, notes, status, categories, mechanicIds, vehicleIds, error };
}

async function resolveCircuit(race: ReturnType<typeof normalize>) {
  if (!race.circuitId) return race;
  const circuit = await getD1().prepare(`SELECT id,name,country_code AS countryCode,address FROM circuits WHERE id=? AND archived_at IS NULL`).bind(race.circuitId).first<{id:string;name:string;countryCode:string;address:string}>();
  if (!circuit) return Response.json({ error: "Circuit not found" }, { status: 404 });
  if (circuit.countryCode !== race.countryCode) return Response.json({ error: "Circuit country does not match race country" }, { status: 409 });
  return { ...race, track: circuit.name, address: circuit.address };
}

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const [races, categories, counts, entryResources, extraResources] = await Promise.all([
    d1.prepare(`
      SELECT r.id, r.race_template_id AS raceTemplateId, r.circuit_id AS circuitId, r.name, r.series, r.series_round AS seriesRound, r.race_type AS raceType, r.track, r.address,
             r.country_code AS countryCode, start_date AS startDate, end_date AS endDate,
             departure_date AS departureDate, return_date AS returnDate,
             organizer, r.notes,
             CASE WHEN r.status = 'archived' THEN 'archived'
                  WHEN r.end_date < date('now') THEN 'completed'
                  WHEN r.start_date > date('now') THEN 'planned'
                  ELSE 'active' END AS status,
             r.created_at AS createdAt, r.updated_at AS updatedAt,
             rt.calendar_color AS calendarColor, rt.logo_key AS logoKey, rt.logo_updated_at AS logoUpdatedAt,
             c.name AS circuitName, c.address AS circuitAddress, c.website_url AS circuitWebsiteUrl, c.maps_url AS circuitMapsUrl,
             c.latitude AS circuitLatitude, c.longitude AS circuitLongitude, c.distance_km AS circuitDistanceKm,
             c.drive_minutes AS circuitDriveMinutes, c.image_key AS circuitImageKey, c.image_updated_at AS circuitImageUpdatedAt
      FROM races r LEFT JOIN race_templates rt ON rt.id = r.race_template_id LEFT JOIN circuits c ON c.id = r.circuit_id
      WHERE r.status != 'archived'
      ORDER BY
        CASE WHEN r.end_date >= date('now') THEN 0 ELSE 1 END,
        CASE WHEN r.end_date >= date('now') THEN r.start_date END ASC,
        CASE WHEN r.end_date < date('now') THEN r.start_date END DESC,
        r.name
    `).all(),
    d1.prepare(`SELECT race_id AS raceId, category, sort_order AS sortOrder, notes FROM race_categories ORDER BY sort_order`).all(),
    d1.prepare(`
      SELECT r.id AS raceId,
             COUNT(DISTINCT e.id) AS driverCount,
             COUNT(DISTINCT rm.mechanic_id) AS mechanicCount,
             COUNT(DISTINCT rv.vehicle_id) AS vehicleCount
      FROM races r
      LEFT JOIN race_entries e ON e.race_id = r.id
      LEFT JOIN race_mechanics rm ON rm.race_id = r.id
      LEFT JOIN race_vehicles rv ON rv.race_id = r.id
      GROUP BY r.id
    `).all(),
    d1.prepare(`
      SELECT race_id AS raceId,
             engine_1_id AS engine1Id, engine_2_id AS engine2Id, engine_3_id AS engine3Id,
             carburetor_1_id AS carburetor1Id, carburetor_2_id AS carburetor2Id, carburetor_3_id AS carburetor3Id
      FROM race_entries
    `).all(),
    d1.prepare("SELECT race_id AS raceId, resource_type AS resourceType, resource_id AS resourceId FROM race_extras").all(),
  ]);
  const categoryRows = categories.results as Array<{ raceId: string; category: string; sortOrder: number; notes: string }>;
  const countRows = counts.results as Array<{ raceId: string; driverCount: number; mechanicCount: number; vehicleCount: number }>;
  const resourceRows = (entryResources.results as Array<{ raceId: string; engine1Id: string | null; engine2Id: string | null; engine3Id: string | null; carburetor1Id: string | null; carburetor2Id: string | null; carburetor3Id: string | null }>).flatMap((row) => [
    row.engine1Id && { raceId: row.raceId, resourceType: "engine" as const, resourceId: row.engine1Id },
    row.engine2Id && { raceId: row.raceId, resourceType: "engine" as const, resourceId: row.engine2Id },
    row.engine3Id && { raceId: row.raceId, resourceType: "engine" as const, resourceId: row.engine3Id },
    row.carburetor1Id && { raceId: row.raceId, resourceType: "carburetor" as const, resourceId: row.carburetor1Id },
    row.carburetor2Id && { raceId: row.raceId, resourceType: "carburetor" as const, resourceId: row.carburetor2Id },
    row.carburetor3Id && { raceId: row.raceId, resourceType: "carburetor" as const, resourceId: row.carburetor3Id },
  ].filter((item): item is { raceId: string; resourceType: "engine" | "carburetor"; resourceId: string } => Boolean(item)));
  resourceRows.push(...extraResources.results as Array<{ raceId: string; resourceType: "engine" | "carburetor"; resourceId: string }>);
  return Response.json({
    races: (races.results as Array<Record<string, unknown>>).map((race) => ({
      ...race,
      calendarColor: normalizeRaceCalendarColor(race.calendarColor),
      logoUrl: raceLogoUrl(race.raceTemplateId, race.logoKey, race.logoUpdatedAt),
      circuitImageUrl: circuitImageUrl(race.circuitId, race.circuitImageKey, race.circuitImageUpdatedAt),
      categories: categoryRows.filter((row) => row.raceId === race.id).map((row) => row.category),
      ...(countRows.find((row) => row.raceId === race.id) ?? { driverCount: 0, mechanicCount: 0, vehicleCount: 0 }),
      engineCount: new Set(resourceRows.filter((row) => row.raceId === race.id && row.resourceType === "engine").map((row) => row.resourceId)).size,
      carburetorCount: new Set(resourceRows.filter((row) => row.raceId === race.id && row.resourceType === "carburetor").map((row) => row.resourceId)).size,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  let race = normalize(payload);
  if (race.error) return Response.json({ error: race.error }, { status: 400 });
  await ensureRuntimeSchema();
  const resolvedCircuit = await resolveCircuit(race);
  if (resolvedCircuit instanceof Response) return resolvedCircuit;
  race = resolvedCircuit;
  const d1 = getD1();
  const template = await getRaceTemplate(race.raceTemplateId);
  if (!template) return Response.json({ error: "Race preset not found" }, { status: 404 });
  const id = crypto.randomUUID();
  const travel = await prepareTravelAssignments(race.mechanicIds, race.vehicleIds, race, id);
  if (travel instanceof Response) return travel;
  const now = Date.now();
  await d1.batch([
    d1.prepare(`
      INSERT INTO races (
        id, race_template_id, circuit_id, name, series, series_round, race_type, track, address, country_code,
        start_date, end_date, departure_date, return_date, organizer,
        notes, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, template.id, race.circuitId || null, template.name, race.series, race.seriesRound, template.name, race.track, race.address, race.countryCode, race.startDate, race.endDate, race.departureDate, race.returnDate, race.organizer, race.notes, race.status, user.email, now, now),
    ...race.categories.map((category) => d1.prepare("INSERT INTO race_categories (id, race_id, category, sort_order, notes) VALUES (?, ?, ?, ?, '')").bind(crypto.randomUUID(), id, category, categoryOrder.indexOf(category))),
    ...travel.mechanics.map((mechanic) => d1.prepare("INSERT INTO race_mechanics (id, race_id, mechanic_id, mechanic_name_snapshot) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), id, mechanic.id, mechanic.name)),
    ...travel.vehicles.map((vehicle) => d1.prepare("INSERT INTO race_vehicles (id, race_id, vehicle_id, vehicle_name_snapshot, license_plate_snapshot) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), id, vehicle.id, vehicle.name, vehicle.licensePlate)),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'create', 'race', ?, ?, ?)").bind(crypto.randomUUID(), user.email, id, JSON.stringify({ ...race, raceName: template.name }), now),
  ]);
  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  if (!payload.id) return Response.json({ error: "Race id is required" }, { status: 400 });
  let race = normalize(payload);
  if (race.error) return Response.json({ error: race.error }, { status: 400 });
  await ensureRuntimeSchema();
  const resolvedCircuit = await resolveCircuit(race);
  if (resolvedCircuit instanceof Response) return resolvedCircuit;
  race = resolvedCircuit;
  const d1 = getD1();
  const template = await getRaceTemplate(race.raceTemplateId);
  if (!template) return Response.json({ error: "Race preset not found" }, { status: 404 });
  const existing = await d1.prepare("SELECT * FROM races WHERE id = ? AND status != 'archived'").bind(payload.id).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Race not found" }, { status: 404 });
  const assigned = await d1.prepare("SELECT DISTINCT category FROM race_entries WHERE race_id = ? UNION SELECT DISTINCT category FROM race_extras WHERE race_id = ?").bind(payload.id, payload.id).all<{ category: string }>();
  const removedAssigned = assigned.results.find((row: { category: string }) => !race.categories.includes(row.category));
  if (removedAssigned) return Response.json({ error: `Category ${removedAssigned.category} still has assignments` }, { status: 409 });
  const travel = await prepareTravelAssignments(race.mechanicIds, race.vehicleIds, race, payload.id);
  if (travel instanceof Response) return travel;
  const previousPairings = await d1.prepare("SELECT mechanic_id AS mechanicId, vehicle_id AS vehicleId FROM race_mechanics WHERE race_id = ? AND vehicle_id IS NOT NULL").bind(payload.id).all<{ mechanicId: string; vehicleId: string }>();
  const previousPairingRows: Array<{ mechanicId: string; vehicleId: string }> = previousPairings.results;
  const preservedVehicleByMechanic = new Map(previousPairingRows.map((row) => [row.mechanicId, row.vehicleId]));

  const now = Date.now();
  await d1.batch([
    d1.prepare(`
      UPDATE races SET race_template_id = ?, circuit_id = ?, name = ?, series = ?, series_round = ?, race_type = ?, track = ?, address = ?,
        country_code = ?, start_date = ?, end_date = ?, departure_date = ?, return_date = ?,
        organizer = ?, notes = ?, status = ?, updated_at = ?
      WHERE id = ? AND status != 'archived'
    `).bind(template.id, race.circuitId || null, template.name, race.series, race.seriesRound, template.name, race.track, race.address, race.countryCode, race.startDate, race.endDate, race.departureDate, race.returnDate, race.organizer, race.notes, race.status, now, payload.id),
    d1.prepare("DELETE FROM race_categories WHERE race_id = ?").bind(payload.id),
    ...race.categories.map((category) => d1.prepare("INSERT INTO race_categories (id, race_id, category, sort_order, notes) VALUES (?, ?, ?, ?, '')").bind(crypto.randomUUID(), payload.id, category, categoryOrder.indexOf(category))),
    d1.prepare("DELETE FROM race_mechanics WHERE race_id = ?").bind(payload.id),
    d1.prepare("DELETE FROM race_vehicles WHERE race_id = ?").bind(payload.id),
    ...travel.mechanics.map((mechanic) => {
      const preservedVehicleId = preservedVehicleByMechanic.get(mechanic.id);
      const vehicleId = preservedVehicleId && race.vehicleIds.includes(preservedVehicleId) ? preservedVehicleId : null;
      return d1.prepare("INSERT INTO race_mechanics (id, race_id, mechanic_id, mechanic_name_snapshot, vehicle_id) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), payload.id, mechanic.id, mechanic.name, vehicleId);
    }),
    ...travel.vehicles.map((vehicle) => d1.prepare("INSERT INTO race_vehicles (id, race_id, vehicle_id, vehicle_name_snapshot, license_plate_snapshot) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), payload.id, vehicle.id, vehicle.name, vehicle.licensePlate)),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'update', 'race', ?, ?, ?)").bind(crypto.randomUUID(), user.email, payload.id, JSON.stringify({ before: existing, after: { ...race, raceName: template.name } }), now),
  ]);
  return Response.json({ id: payload.id });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  if (!payload.id) return Response.json({ error: "Race id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const existing = await d1.prepare("SELECT * FROM races WHERE id = ? AND status != 'archived'").bind(payload.id).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Race not found" }, { status: 404 });
  const now = Date.now();
  await d1.batch([
    d1.prepare("UPDATE races SET status = 'archived', updated_at = ? WHERE id = ?").bind(now, payload.id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'archive', 'race', ?, ?, ?)").bind(crypto.randomUUID(), user.email, payload.id, JSON.stringify(existing), now),
  ]);
  return Response.json({ id: payload.id });
}

async function readPayload(request: Request): Promise<RacePayload | Response> {
  try {
    return (await request.json()) as RacePayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
